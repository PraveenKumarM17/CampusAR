import React

@objc(CampusARMeasureViewManager)
final class CampusARMeasureViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    CampusARMeasureView()
  }
}
