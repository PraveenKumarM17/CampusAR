import ARKit
import React
import SceneKit
import UIKit

@objc(CampusARMeasureView)
final class CampusARMeasureView: UIView, ARSCNViewDelegate, ARSessionDelegate {
  @objc var onMeasureEvent: RCTDirectEventBlock?

  private let sceneView = ARSCNView(frame: .zero)
  private var pointNodes: [SCNNode] = []
  private var lineNode: SCNNode?
  private var anchors: [ARAnchor] = []
  private var pointIds: [String] = []
  private var lastTrackingQuality: String = "initializing"
  private var lastSurfaceDetected = false

  override init(frame: CGRect) {
    super.init(frame: frame)
    sceneView.delegate = self
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = true
    sceneView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(sceneView)
    NSLayoutConstraint.activate([
      sceneView.leadingAnchor.constraint(equalTo: leadingAnchor),
      sceneView.trailingAnchor.constraint(equalTo: trailingAnchor),
      sceneView.topAnchor.constraint(equalTo: topAnchor),
      sceneView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    sceneView.session.pause()
    if CampusARMeasureRegistry.shared.activeView === self {
      CampusARMeasureRegistry.shared.activeView = nil
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      CampusARMeasureRegistry.shared.activeView = self
    }
  }

  func startSession() {
    guard ARWorldTrackingConfiguration.isSupported else {
      emitError("ARKit world tracking is not supported on this device.")
      emitTracking(quality: "unavailable", reason: "unsupported_device")
      return
    }
    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal]
    config.environmentTexturing = .automatic
    sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    emitTracking(quality: "initializing", reason: nil)
  }

  func pauseSession() {
    sceneView.session.pause()
  }

  func resumeSession() {
    startSession()
  }

  func resetSession() {
    clearPoints()
    startSession()
  }

  @discardableResult
  func placePointAtScreenCenter() -> [String: Any]? {
    guard let frame = sceneView.session.currentFrame else {
      emitError("AR frame not ready.")
      return nil
    }
    let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
    let results = sceneView.hitTest(center, types: [.existingPlaneUsingExtent, .estimatedHorizontalPlane])
    guard let result = results.first else {
      emitSurface(detected: false)
      return nil
    }

    let world = result.worldTransform.columns.3
    let position = SCNVector3(world.x, world.y, world.z)
    let anchor = ARAnchor(transform: result.worldTransform)
    sceneView.session.add(anchor: anchor)
    anchors.append(anchor)

    let sphere = SCNSphere(radius: 0.015)
    sphere.firstMaterial?.diffuse.contents = UIColor.systemTeal
    let node = SCNNode(geometry: sphere)
    node.position = position
    sceneView.scene.rootNode.addChildNode(node)
    pointNodes.append(node)

    let id = UUID().uuidString
    pointIds.append(id)
    redrawLine()
    emitPoints()

    return ["id": id, "x": Double(world.x), "y": Double(world.y), "z": Double(world.z)]
  }

  func undoLastPoint() {
    guard let anchor = anchors.popLast(), let node = pointNodes.popLast() else { return }
    pointIds.removeLast()
    sceneView.session.remove(anchor: anchor)
    node.removeFromParentNode()
    redrawLine()
    emitPoints()
  }

  func clearPoints() {
    for anchor in anchors {
      sceneView.session.remove(anchor: anchor)
    }
    for node in pointNodes {
      node.removeFromParentNode()
    }
    lineNode?.removeFromParentNode()
    lineNode = nil
    anchors.removeAll()
    pointNodes.removeAll()
    pointIds.removeAll()
    emitPoints()
  }

  func currentTrackingState() -> [String: Any] {
    ["quality": lastTrackingQuality]
  }

  // MARK: - ARSessionDelegate

  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    let quality: String
    var reason: String?
    switch camera.trackingState {
    case .notAvailable:
      quality = "unavailable"
      reason = "not_available"
    case .limited(let limited):
      quality = "limited"
      switch limited.reason {
      case .initializing: reason = "initializing"
      case .excessiveMotion: reason = "excessive_motion"
      case .insufficientFeatures: reason = "insufficient_features"
      case .relocalizing: reason = "relocalizing"
      @unknown default: reason = "limited"
      }
    case .normal:
      quality = "normal"
    @unknown default:
      quality = "limited"
    }
    if quality != lastTrackingQuality {
      lastTrackingQuality = quality
      emitTracking(quality: quality, reason: reason)
    }
  }

  func sessionWasInterrupted(_ session: ARSession) {
    emitTracking(quality: "interrupted", reason: "session_interrupted")
  }

  func sessionInterruptionEnded(_ session: ARSession) {
    emitTracking(quality: "initializing", reason: "interruption_ended")
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    emitError(error.localizedDescription)
  }

  // MARK: - Rendering helpers

  private func redrawLine() {
    lineNode?.removeFromParentNode()
    lineNode = nil
    guard pointNodes.count >= 2 else { return }
    var vertices: [SCNVector3] = pointNodes.map { $0.position }
    let source = SCNGeometrySource(vertices: vertices)
    var indices: [Int32] = []
    for i in 0..<(vertices.count - 1) {
      indices.append(Int32(i))
      indices.append(Int32(i + 1))
    }
    let element = SCNGeometryElement(
      indices: indices,
      primitiveType: .line
    )
    let geometry = SCNGeometry(sources: [source], elements: [element])
    geometry.firstMaterial?.diffuse.contents = UIColor.systemYellow
    geometry.firstMaterial?.isDoubleSided = true
    let node = SCNNode(geometry: geometry)
    sceneView.scene.rootNode.addChildNode(node)
    lineNode = node
  }

  private func emitPoints() {
    var points: [[String: Any]] = []
    for (idx, node) in pointNodes.enumerated() {
      let p = node.position
      points.append([
        "id": pointIds[idx],
        "x": Double(p.x),
        "y": Double(p.y),
        "z": Double(p.z),
      ])
    }
    var segmentDistance: Any = NSNull()
    if points.count >= 2 {
      let a = points[points.count - 2]
      let b = points[points.count - 1]
      if let ax = a["x"] as? Double, let ay = a["y"] as? Double, let az = a["z"] as? Double,
         let bx = b["x"] as? Double, let by = b["y"] as? Double, let bz = b["z"] as? Double {
        let dx = bx - ax
        let dy = by - ay
        let dz = bz - az
        segmentDistance = sqrt(dx * dx + dy * dy + dz * dz)
      }
    }
    var total = 0.0
    if points.count >= 2 {
      for i in 1..<points.count {
        guard
          let pa = points[i - 1] as? [String: Any],
          let pb = points[i] as? [String: Any],
          let ax = pa["x"] as? Double, let ay = pa["y"] as? Double, let az = pa["z"] as? Double,
          let bx = pb["x"] as? Double, let by = pb["y"] as? Double, let bz = pb["z"] as? Double
        else { continue }
        let dx = bx - ax
        let dy = by - ay
        let dz = bz - az
        total += sqrt(dx * dx + dy * dy + dz * dz)
      }
    }
    onMeasureEvent?([
      "type": "points",
      "points": points,
      "segmentDistanceM": segmentDistance,
      "totalDistanceM": total,
    ])
  }

  private func emitTracking(quality: String, reason: String?) {
    var payload: [String: Any] = ["type": "tracking", "quality": quality]
    if let reason { payload["reason"] = reason }
    onMeasureEvent?(payload)
  }

  private func emitSurface(detected: Bool) {
    if detected == lastSurfaceDetected { return }
    lastSurfaceDetected = detected
    onMeasureEvent?(["type": "surface", "detected": detected])
  }

  private func emitError(_ message: String) {
    onMeasureEvent?(["type": "error", "message": message])
  }
}
