/** Minimal WebXR hit-test + DOM overlay typings for AR measure panel. */
interface XRHitTestSource {
  getHitTestResults(frame: XRFrame): readonly XRHitTestResult[];
}

interface XRRigidTransform {
  readonly inverse: XRRigidTransform;
  readonly matrix: Float32Array;
  readonly position: DOMPointReadOnly;
}

interface XRView {
  readonly transform: XRRigidTransform;
  readonly projectionMatrix: Float32Array;
}

interface XRViewerPose {
  readonly views: readonly XRView[];
}

interface XRFrame {
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined;
}

interface XRSession {
  requestHitTestSource?(init: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
}

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
}

interface Navigator {
  xr?: XRSystem;
}
