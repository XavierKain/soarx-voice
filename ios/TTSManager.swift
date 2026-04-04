import Foundation
import AVFoundation

@objc(TTSManager)
class TTSManager: NSObject, AVSpeechSynthesizerDelegate {

  private let synthesizer = AVSpeechSynthesizer()
  private let voice = AVSpeechSynthesisVoice(language: "en-US")

  override init() {
    super.init()
    synthesizer.delegate = self
    NSLog("[TTS] Manager initialized")
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func speak(_ text: String) {
    DispatchQueue.main.async {
      // Stop any current speech
      if self.synthesizer.isSpeaking {
        self.synthesizer.stopSpeaking(at: .immediate)
      }

      let utterance = AVSpeechUtterance(string: text)
      utterance.voice = self.voice
      utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 1.1
      utterance.volume = 0.8
      utterance.pitchMultiplier = 1.0

      self.synthesizer.speak(utterance)
      NSLog("[TTS] Speaking: \(text)")
    }
  }
}
