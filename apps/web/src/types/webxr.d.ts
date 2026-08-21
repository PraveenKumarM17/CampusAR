/** Minimal WebXR hit-test typings for AR measure panel. */
interface XRHitTestSource {
  getHitTestResults(frame: XRFrame): readonly XRHitTestResult[];
}

interface XRSession {
  requestHitTestSource?(init: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
}

interface Navigator {
  xr?: XRSystem;
}
