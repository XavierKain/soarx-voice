import Foundation
import AVFoundation
import UIKit
import React

@objc(AudioSessionManager)
class AudioSessionManager: RCTEventEmitter {

  private var wasManuallyMuted = false
  private var isInterrupted = false
  private var hasListeners = false

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

  // MARK: - Setup

  private func setupNotifications() {
    let nc = NotificationCenter.default

    // Primary: AVAudioSession interruption (Camera taking mic, phone call, etc.)
    nc.addObserver(
      self,
      selector: #selector(handleAudioInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance()
    )

    // Secondary: hint that another app is about to take audio
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

  // MARK: - Audio session control (called from JS)

  @objc func configureAudioSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      )
      try session.setActive(true)
      NSLog("[AudioSession] Configured and activated: playAndRecord + voiceChat")
    } catch {
      NSLog("[AudioSession] Configuration failed: \(error)")
    }
  }

  @objc func deactivateAudioSession() {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      NSLog("[AudioSession] Deactivated — mic released for other apps")
    } catch {
      NSLog("[AudioSession] Deactivation failed: \(error)")
    }
  }

  // MARK: - Interruption handling

  @objc private func handleAudioInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else {
      NSLog("[AudioSession] Interruption notification without valid type")
      return
    }

    switch type {
    case .began:
      NSLog("[AudioSession] ★ INTERRUPTION BEGAN (Camera/call took the mic)")
      isInterrupted = true
      if hasListeners {
        sendEvent(withName: "onAudioInterrupted", body: ["reason": "interruption"])
      }

    case .ended:
      let options = AVAudioSession.InterruptionOptions(
        rawValue: info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      )
      let shouldResume = options.contains(.shouldResume)
      NSLog("[AudioSession] ★ INTERRUPTION ENDED (shouldResume=\(shouldResume))")
      isInterrupted = false

      // Reactivate our audio session
      do {
        try AVAudioSession.sharedInstance().setActive(true)
        NSLog("[AudioSession] Audio session reactivated")
      } catch {
        NSLog("[AudioSession] Reactivation failed: \(error)")
      }

      if shouldResume && hasListeners {
        sendEvent(withName: "onAudioResumed", body: ["reason": "interruptionEnded"])
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
      NSLog("[AudioSession] Secondary audio hint: BEGIN (another app wants audio)")
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
      NSLog("[AudioSession] App became active while interrupted — attempting recovery")
      do {
        try AVAudioSession.sharedInstance().setActive(true)
        isInterrupted = false
        if hasListeners {
          sendEvent(withName: "onAudioResumed", body: ["reason": "appBecameActive"])
        }
      } catch {
        NSLog("[AudioSession] Recovery failed: \(error)")
      }
    }
  }

  // MARK: - JS methods

  @objc func setManuallyMuted(_ muted: Bool) {
    wasManuallyMuted = muted
    NSLog("[AudioSession] wasManuallyMuted = \(muted)")
  }

  @objc func getManuallyMuted(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(wasManuallyMuted)
  }

  @objc func ping(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve("AudioSessionManager active, interrupted=\(isInterrupted)")
  }
}
