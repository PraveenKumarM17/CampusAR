import Foundation
import React

@objc(CampusARMeasureModule)
final class CampusARMeasureModule: NSObject {
  private func view() -> CampusARMeasureView? {
    CampusARMeasureRegistry.shared.activeView
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { true }

  @objc(startSession:rejecter:)
  func startSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let view = self.view() else {
        reject("no_view", "AR view is not mounted", nil)
        return
      }
      view.startSession()
      resolve(nil)
    }
  }

  @objc(pauseSession:rejecter:)
  func pauseSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.view()?.pauseSession()
      resolve(nil)
    }
  }

  @objc(resumeSession:rejecter:)
  func resumeSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let view = self.view() else {
        reject("no_view", "AR view is not mounted", nil)
        return
      }
      view.resumeSession()
      resolve(nil)
    }
  }

  @objc(placePoint:rejecter:)
  func placePoint(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let view = self.view() else {
        reject("no_view", "AR view is not mounted", nil)
        return
      }
      if let point = view.placePointAtScreenCenter() {
        resolve(point)
      } else {
        resolve(NSNull())
      }
    }
  }

  @objc(undoLastPoint:rejecter:)
  func undoLastPoint(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.view()?.undoLastPoint()
      resolve(nil)
    }
  }

  @objc(clearPoints:rejecter:)
  func clearPoints(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.view()?.clearPoints()
      resolve(nil)
    }
  }

  @objc(resetSession:rejecter:)
  func resetSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.view()?.resetSession()
      resolve(nil)
    }
  }

  @objc(getTrackingState:rejecter:)
  func getTrackingState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      resolve(self.view()?.currentTrackingState() ?? ["quality": "unavailable"])
    }
  }
}
