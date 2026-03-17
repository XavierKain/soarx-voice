import Foundation
import MediaPlayer
import AVFoundation
import React
import UIKit

@objc(HIDModule)
class HIDModule: RCTEventEmitter {
  private var hasListeners = false
  private static var shared: HIDModule?
  private var lastToggleTime: TimeInterval = 0

  override init() {
    super.init()
    HIDModule.shared = self
    setupRemoteCommandCenter()
    NSLog("[HID] Module initialized")
  }

  override func supportedEvents() -> [String]! {
    return ["onHIDToggle"]
  }

  override func startObserving() {
    hasListeners = true
    NSLog("[HID] JS listeners attached")
    // Keep screen on during voice channel (AssistiveTouch needs active screen)
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = true
      NSLog("[HID] Screen stays on (idle timer disabled)")
    }
  }

  override func stopObserving() {
    hasListeners = false
    NSLog("[HID] JS listeners detached")
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = false
      NSLog("[HID] Screen auto-lock restored")
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool { return true }

  // MARK: - MPRemoteCommandCenter (headset play/pause buttons)

  private func setupRemoteCommandCenter() {
    let cc = MPRemoteCommandCenter.shared()

    cc.togglePlayPauseCommand.isEnabled = true
    cc.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-togglePlayPause")
      return .success
    }
    cc.playCommand.isEnabled = true
    cc.playCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-play")
      return .success
    }
    cc.pauseCommand.isEnabled = true
    cc.pauseCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-pause")
      return .success
    }
    cc.nextTrackCommand.isEnabled = true
    cc.nextTrackCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-nextTrack")
      return .success
    }
    cc.previousTrackCommand.isEnabled = true
    cc.previousTrackCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-previousTrack")
      return .success
    }

    let nowPlayingInfo: [String: Any] = [
      MPMediaItemPropertyTitle: "SoarXVoice",
      MPMediaItemPropertyArtist: "In Flight",
      MPNowPlayingInfoPropertyPlaybackRate: 1.0,
      MPMediaItemPropertyPlaybackDuration: 999999
    ]
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    UIApplication.shared.beginReceivingRemoteControlEvents()
    NSLog("[HID] RemoteCommandCenter configured")
  }

  // MARK: - Key Press (from AppDelegate pressesBegan)

  @objc static func handleKeyPress(keyCode: String) {
    guard let instance = shared else { return }
    let now = Date().timeIntervalSince1970
    if now - instance.lastToggleTime < 0.5 { return }
    instance.lastToggleTime = now
    instance.emitToggle(source: "keyPress-\(keyCode)")
  }

  // MARK: - Emit

  private func emitToggle(source: String) {
    NSLog("[HID] TOGGLE source=\(source) hasListeners=\(hasListeners)")
    if hasListeners {
      sendEvent(withName: "onHIDToggle", body: ["source": source])
    }
  }
}
