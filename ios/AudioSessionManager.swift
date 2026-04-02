import Foundation
import AVFoundation
import UIKit

@objc(AudioSessionManager)
class AudioSessionManager: NSObject {

  private var wasActive = false

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    NSLog("[AudioSessionManager] Initialized — listening for app state changes")
  }

  @objc func appDidEnterBackground() {
    let session = AVAudioSession.sharedInstance()
    // Only release if we have an active PlayAndRecord session (= in a call)
    guard session.category == .playAndRecord else { return }

    wasActive = true
    NSLog("[AudioSessionManager] App backgrounded during call — releasing audio session")

    do {
      // Deactivate audio session so other apps (Camera) can use the mic
      try session.setActive(false, options: .notifyOthersOnDeactivation)
      NSLog("[AudioSessionManager] Audio session deactivated successfully")
    } catch {
      NSLog("[AudioSessionManager] Failed to deactivate: \(error)")
    }
  }

  @objc func appWillEnterForeground() {
    guard wasActive else { return }
    wasActive = false

    NSLog("[AudioSessionManager] App foregrounded — reactivating audio session")
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
      try session.setActive(true)
      NSLog("[AudioSessionManager] Audio session reactivated successfully")
    } catch {
      NSLog("[AudioSessionManager] Failed to reactivate: \(error)")
    }
  }

  // Expose to JS so React Native loads the module
  @objc func ping(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve("AudioSessionManager active")
  }

  @objc static func requiresMainQueueSetup() -> Bool { return true }
}
