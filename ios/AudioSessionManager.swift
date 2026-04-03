import Foundation
import AVFoundation
import UIKit
import React

@objc(AudioSessionManager)
class AudioSessionManager: RCTEventEmitter {

  private var hasListeners = false
  private var isInterrupted = false

  override init() {
    super.init()
    setupNotifications()
    NSLog("[AudioSession] Manager initialized")
  }

  override func supportedEvents() -> [String]! {
    return ["onAudioInterrupted", "onAudioResumed"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  @objc override static func requiresMainQueueSetup() -> Bool { return true }

  // MARK: - Configure audio session BEFORE Agora uses it

  @objc func configureAudioSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      )
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      NSLog("[AudioSession] Configured and activated: playAndRecord + voiceChat")
    } catch {
      NSLog("[AudioSession] Configuration failed: \(error)")
    }
  }

  @objc func deactivateAudioSession() {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      NSLog("[AudioSession] Deactivated — mic released")
    } catch {
      NSLog("[AudioSession] Deactivation failed: \(error)")
    }
  }

  // MARK: - Notifications

  private func setupNotifications() {
    let nc = NotificationCenter.default

    // AVAudioSession interruption (Camera video, phone call, Siri, etc.)
    nc.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance()
    )

    // Secondary audio hint (early warning)
    nc.addObserver(
      self,
      selector: #selector(handleSecondaryAudioHint(_:)),
      name: AVAudioSession.silenceSecondaryAudioHintNotification,
      object: nil
    )

    // App lifecycle: recover on foreground return
    nc.addObserver(
      self,
      selector: #selector(appDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    NSLog("[AudioSession] Notifications registered")
  }

  // MARK: - Interruption handling (Camera taking mic, phone call, etc.)

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else {
      NSLog("[AudioSession] Interruption without valid type")
      return
    }

    switch type {
    case .began:
      NSLog("[AudioSession] ★ INTERRUPTION BEGAN — Camera/call took the mic")
      isInterrupted = true
      if hasListeners {
        sendEvent(withName: "onAudioInterrupted", body: ["reason": "interruption"])
      }

    case .ended:
      let optValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let options = AVAudioSession.InterruptionOptions(rawValue: optValue)
      let shouldResume = options.contains(.shouldResume)
      NSLog("[AudioSession] ★ INTERRUPTION ENDED — shouldResume=\(shouldResume)")
      isInterrupted = false

      if shouldResume {
        // Delay to let Camera fully release the mic
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
          guard let self = self else { return }
          self.reactivateSession()
          if self.hasListeners {
            self.sendEvent(withName: "onAudioResumed", body: ["reason": "interruptionEnded"])
          }
        }
      }

    @unknown default:
      NSLog("[AudioSession] Unknown interruption type")
    }
  }

  // MARK: - Secondary audio hint (early warning)

  @objc private func handleSecondaryAudioHint(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt,
          let type = AVAudioSession.SilenceSecondaryAudioHintType(rawValue: typeValue)
    else { return }

    switch type {
    case .begin:
      NSLog("[AudioSession] Secondary audio hint: BEGIN")
      if !isInterrupted && hasListeners {
        sendEvent(withName: "onAudioInterrupted", body: ["reason": "secondaryHint"])
      }
    case .end:
      NSLog("[AudioSession] Secondary audio hint: END")
      if !isInterrupted && hasListeners {
        sendEvent(withName: "onAudioResumed", body: ["reason": "secondaryHintEnded"])
      }
    @unknown default: break
    }
  }

  // MARK: - App lifecycle fallback

  @objc private func appDidBecomeActive() {
    if isInterrupted {
      NSLog("[AudioSession] App became active while interrupted — recovering")
      isInterrupted = false
      reactivateSession()
      if hasListeners {
        sendEvent(withName: "onAudioResumed", body: ["reason": "appBecameActive"])
      }
    }
  }

  // MARK: - Reactivate session after interruption

  private func reactivateSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      )
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      NSLog("[AudioSession] Session reactivated successfully")
    } catch {
      NSLog("[AudioSession] Reactivation failed: \(error)")
    }
  }

  // MARK: - JS methods

  @objc func ping(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve("AudioSessionManager active, interrupted=\(isInterrupted)")
  }
}
