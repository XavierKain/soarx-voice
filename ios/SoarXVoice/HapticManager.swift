import Foundation
import UIKit

@objc(HapticManager)
class HapticManager: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func singleTap() {
    DispatchQueue.main.async {
      let generator = UIImpactFeedbackGenerator(style: .heavy)
      generator.prepare()
      generator.impactOccurred(intensity: 1.0)
    }
  }

  @objc func doubleTap() {
    DispatchQueue.main.async {
      let generator = UIImpactFeedbackGenerator(style: .heavy)
      generator.prepare()
      generator.impactOccurred(intensity: 1.0)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
        generator.impactOccurred(intensity: 1.0)
      }
    }
  }
}
