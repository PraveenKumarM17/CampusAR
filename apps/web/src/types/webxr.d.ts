/** Minimal WebXR hit-test + DOM overlay typings for AR measure panel. */
interface XRHitTestResult {
  getPose(baseSpace: XRReferenceSpace): XRPose | undefined;
}

interface XRHitTestSource {
  getHitTestResults(frame: XRFrame): readonly XRHitTestResult[];
  cancel(): void;
}

interface XRPose {
  readonly transform: XRRigidTransform;
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

interface XRWebGLLayer {
  readonly framebuffer: WebGLFramebuffer | null;
  readonly framebufferWidth: number;
  readonly framebufferHeight: number;
}

interface XRRenderState {
  readonly baseLayer: XRWebGLLayer | undefined;
}

interface XRFrame {
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined;
  getHitTestResults?(hitTestSource: XRHitTestSource): readonly XRHitTestResult[];
}

interface XRSession {
  readonly renderState: XRRenderState;
  requestHitTestSource?(init: { space: XRReferenceSpace }): Promise<XRHitTestSource | undefined>;
  requestReferenceSpace(type: string): Promise<XRReferenceSpace>;
  updateRenderState(state: {
    baseLayer?: XRWebGLLayer;
  }): void;
  requestAnimationFrame(callback: (time: number, frame: XRFrame) => void): number;
  end(): Promise<void>;
  addEventListener(type: 'select' | 'end', listener: (event: XRInputSourceEvent) => void): void;
}

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
}

interface XRSystem {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init?: XRSessionInit): Promise<XRSession>;
}

interface Navigator {
  xr?: XRSystem;
}

interface WebGLRenderingContext {
  makeXRCompatible(): Promise<void>;
}
