/** Google Play listing for ARCore — shown when AR services are missing or outdated. */
import { logArLifecycle } from './arMeasureDiagnostics';
import { arDebugger } from '../../lib/ar/debugging/arDebugger';
export const ARCORE_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.google.ar.core';

export const ARCORE_UPDATE_MESSAGE =
  'AR requires Google Play Services for AR (ARCore). Open the Google Play Store, search for "Google Play Services for AR", install or update it, then restart your browser and try again.';

export type WebXrPreflightReason = 'unsupported' | 'insecure' | 'arcore';

export type WebXrPreflightResult =
  | { ok: true }
  | {
      ok: false;
      reason: WebXrPreflightReason;
      message: string;
      userWarning?: string;
    };

export type WebXrErrorClassification = {
  message: string;
  userWarning: string | null;
  logDetail: string;
  isArcoreLikely: boolean;
};

export type XRSessionWithHitTest = XRSession & {
  requestHitTestSource?: (init: {
    space: XRReferenceSpace;
    entityTypes?: string[];
  }) => Promise<XRHitTestSource | undefined>;
  cancelAnimationFrame?: (handle: number) => void;
};

export type WebXrFrameContext = {
  session: XRSession;
  refSpace: XRReferenceSpace;
  hitTestSource: XRHitTestSource | null;
  gl: WebGLRenderingContext;
};

export type WebXrLifecycleState = 'idle' | 'initializing' | 'running' | 'stopping';

export type WebXrStartOptions = {
  canvas: HTMLCanvasElement;
  overlayRoot: HTMLElement;
  onFrame: (time: number, frame: XRFrame, ctx: WebXrFrameContext) => void;
  /** WebXR select (screen tap) — required for point placement on Android. */
  onSelect?: (event: XRInputSourceEvent, transientHit?: XRHitTestResult, frame?: XRFrame) => void;
  /** Lingering preview stream tracks to stop on teardown (camera HAL release). */
  mediaStream?: MediaStream | null;
  /** Optional video element to fully release on teardown. */
  videoElement?: HTMLVideoElement | null;
  /** Fired after the session ends (user, system, visibility, or teardown). */
  onEnded?: () => void;
  /** Hit-test could not be created — session may still run with limited placement. */
  onHitTestUnavailable?: (message: string) => void;
};

/** Resolve the hit belonging to the current native screen tap. */
export function resolveSelectHitTest(
  frame: XRFrame | undefined,
  inputSource: XRInputSource,
  transientSource: XRTransientInputHitTestSource | null,
  persistentSource: XRHitTestSource | null,
): XRHitTestResult | undefined {
  if (!frame) return undefined;

  if (transientSource && frame.getHitTestResultsForTransientInput) {
    const transient = frame
      .getHitTestResultsForTransientInput(transientSource)
      .find((item) => item.inputSource === inputSource);
    const hit = transient?.results[0];
    if (hit) return hit;
  }

  if (persistentSource && frame.getHitTestResults) {
    return frame.getHitTestResults(persistentSource)[0];
  }

  return undefined;
}

function resizeCanvasToViewport(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

/** Map low-level WebXR / ARCore failures to actionable user guidance. */
export function classifyWebXrError(error: unknown): WebXrErrorClassification {
  const raw = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const lower = raw.toLowerCase();

  const arcoreHints = [
    'arcore',
    'play services for ar',
    'google play services for ar',
    'failed to initialize ar',
    'ar service',
    'arcoreapk',
    'session not supported',
    'not supported',
    'unsupported feature',
    'feature not supported',
  ];

  const hitTestHints = ['hit-test', 'hittest', 'hit test'];

  const isArcoreLikely =
    arcoreHints.some((hint) => lower.includes(hint)) || name === 'NotSupportedError';

  if (isArcoreLikely) {
    return {
      message: ARCORE_UPDATE_MESSAGE,
      userWarning: ARCORE_UPDATE_MESSAGE,
      logDetail: `[WebXR] ARCore / session error (${name}): ${raw}`,
      isArcoreLikely: true,
    };
  }

  if (hitTestHints.some((hint) => lower.includes(hint))) {
    const message =
      'Plane detection (hit-test) failed to start. Update Google Play Services for AR and ensure the room is well lit.';
    return {
      message,
      userWarning: ARCORE_UPDATE_MESSAGE,
      logDetail: `[WebXR] Hit-test error (${name}): ${raw}`,
      isArcoreLikely: true,
    };
  }

  if (name === 'SecurityError' || lower.includes('secure context')) {
    return {
      message: 'WebXR requires HTTPS. Open this site with https:// and accept the certificate warning if prompted.',
      userWarning: null,
      logDetail: `[WebXR] Security error: ${raw}`,
      isArcoreLikely: false,
    };
  }

  return {
    message: raw || 'Could not start WebXR AR session',
    userWarning: null,
    logDetail: `[WebXR] ${name}: ${raw}`,
    isArcoreLikely: false,
  };
}

/** Pre-flight check before claiming the camera for an immersive-ar session. */
export async function checkWebXrArSupport(): Promise<WebXrPreflightResult> {
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'insecure',
      message:
        'HTTPS is required for WebXR. Open https:// plus your server address (not http://), accept the certificate warning, then try again.',
    };
  }

  if (!navigator.xr?.isSessionSupported) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'WebXR is not available in this browser. Use Chrome or Edge on an ARCore-capable Android device.',
    };
  }

  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      console.warn('[WebXR] immersive-ar not supported on this device');
      return {
        ok: false,
        reason: 'arcore',
        message: ARCORE_UPDATE_MESSAGE,
        userWarning: ARCORE_UPDATE_MESSAGE,
      };
    }
    return { ok: true };
  } catch (err) {
    const classified = classifyWebXrError(err);
    console.error(classified.logDetail, err);
    return {
      ok: false,
      reason: classified.isArcoreLikely ? 'arcore' : 'unsupported',
      message: classified.userWarning ?? classified.message,
      userWarning: classified.userWarning ?? undefined,
    };
  }
}

async function requestArSession(overlayRoot: HTMLElement): Promise<XRSessionWithHitTest> {
  if (!navigator.xr) throw new Error('WebXR is not available');

  const primary: XRSessionInit = {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['local-floor', 'anchors'],
    domOverlay: { root: overlayRoot },
  };

  logArLifecycle('XR_SESSION_REQUEST_BEGIN', 'hit-test+dom-overlay');
  try {
    const session = (await navigator.xr.requestSession(
      'immersive-ar',
      primary,
    )) as XRSessionWithHitTest;
    logArLifecycle('XR_SESSION_CREATED', 'primary');
    return session;
  } catch (primaryErr) {
    const classified = classifyWebXrError(primaryErr);
    console.warn('[WebXR] Primary session failed', classified.logDetail, primaryErr);

    const fallback: XRSessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['local-floor', 'dom-overlay', 'anchors'],
      domOverlay: { root: overlayRoot },
    };

    logArLifecycle('XR_SESSION_REQUEST_BEGIN', 'hit-test fallback');
    try {
      const session = (await navigator.xr.requestSession(
        'immersive-ar',
        fallback,
      )) as XRSessionWithHitTest;
      logArLifecycle('XR_SESSION_CREATED', 'fallback');
      return session;
    } catch (fallbackErr) {
      const fallbackClassified = classifyWebXrError(fallbackErr);
      console.error(fallbackClassified.logDetail, fallbackErr);
      throw primaryErr instanceof Error ? primaryErr : new Error(classified.message);
    }
  }
}

/**
 * Owns WebXR session lifecycle: start, per-frame loop, select events, and guaranteed hardware release.
 * endSession() MUST complete before React unmounts the WebGL canvas.
 */
export class WebXrSessionManager {
  private session: XRSessionWithHitTest | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private transientHitTestSource: XRTransientInputHitTestSource | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private glContext: WebGLRenderingContext | null = null;
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private animFrameId: number | null = null;
  private frameLoopActive = false;
  private tearingDown = false;
  private sessionAlreadyEnded = false;
  private lifecycleState: WebXrLifecycleState = 'idle';
  private endSessionPromise: Promise<void> | null = null;
  private onEndedCallback: (() => void) | null = null;
  private onFrameCallback: WebXrStartOptions['onFrame'] | null = null;
  private onSelectCallback: WebXrStartOptions['onSelect'] | null = null;
  private detachSelectPlacement: (() => void) | null = null;
  private suppressEndedCallback = false;

  private endListener: (() => void) | null = null;

  getLifecycleState(): WebXrLifecycleState {
    return this.lifecycleState;
  }

  getSession(): XRSessionWithHitTest | null {
    return this.session;
  }

  getRefSpace(): XRReferenceSpace | null {
    return this.refSpace;
  }

  getHitTestSource(): XRHitTestSource | null {
    return this.hitTestSource;
  }

  getGl(): WebGLRenderingContext | null {
    return this.glContext;
  }

  isActive(): boolean {
    return this.session != null && !this.tearingDown;
  }

  /** Register a preview MediaStream whose tracks must be stopped on session end. */
  registerMediaStream(stream: MediaStream | null | undefined): void {
    this.mediaStream = stream ?? null;
  }

  registerVideoElement(video: HTMLVideoElement | null | undefined): void {
    this.videoElement = video ?? null;
  }

  /** Skip onEnded callback when caller handles post-teardown (e.g. restore preview). */
  setSuppressEndedCallback(suppress: boolean): void {
    this.suppressEndedCallback = suppress;
  }

  /** Register an external select handler detach (from attachWebXrSelectPlacement). */
  registerSelectDetach(detach: () => void): void {
    this.detachSelectPlacement?.();
    this.detachSelectPlacement = detach;
  }

  /** Start immersive-ar after pre-flight checks (caller should run checkWebXrArSupport first). */
  async start(options: WebXrStartOptions): Promise<void> {
    if (
      this.lifecycleState === 'initializing' ||
      this.lifecycleState === 'running' ||
      this.lifecycleState === 'stopping'
    ) {
      await this.endSession();
    }

    this.lifecycleState = 'initializing';
    this.tearingDown = false;
    this.sessionAlreadyEnded = false;
    this.onEndedCallback = options.onEnded ?? null;
    this.onFrameCallback = options.onFrame;
    this.onSelectCallback = options.onSelect ?? null;
    if (options.mediaStream) {
      this.mediaStream = options.mediaStream;
    }
    if (options.videoElement) {
      this.videoElement = options.videoElement;
    }

    resizeCanvasToViewport(options.canvas);

    const gl = options.canvas.getContext('webgl', {
      xrCompatible: true,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: true,
      stencil: false,
    });
    if (!gl) {
      throw new Error('WebGL not available');
    }
    if (gl.isContextLost()) {
      this.glContext = null;
      throw new Error('WebGL context is already lost. Close and reopen AR to create a fresh context.');
    }
    this.glContext = gl;

    try {
      await gl.makeXRCompatible();
    } catch (err) {
      this.forceGlAndMediaCleanup();
      const classified = classifyWebXrError(err);
      console.error(classified.logDetail, err);
      throw new Error(classified.userWarning ?? classified.message);
    }

    let session: XRSessionWithHitTest;
    try {
      session = await requestArSession(options.overlayRoot);
    } catch (err) {
      this.forceGlAndMediaCleanup();
      const classified = classifyWebXrError(err);
      console.error(classified.logDetail, err);
      throw new Error(classified.userWarning ?? classified.message);
    }
    this.session = session;

    try {
      session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, gl, {
          alpha: true,
          antialias: false,
          depth: true,
          ignoreDepthValues: true,
        }),
      });
    } catch (err) {
      await this.endSession();
      const classified = classifyWebXrError(err);
      console.error(classified.logDetail, err);
      throw new Error(classified.userWarning ?? classified.message);
    }

    let refSpace: XRReferenceSpace;
    try {
      refSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      try {
        refSpace = await session.requestReferenceSpace('local');
      } catch (err) {
        this.lifecycleState = 'idle';
        await this.endSession();
        const classified = classifyWebXrError(err);
        console.error(classified.logDetail, err);
        throw new Error(classified.userWarning ?? classified.message);
      }
    }
    this.refSpace = refSpace;

    let hitTestSource: XRHitTestSource | null = null;
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      if (session.requestHitTestSource) {
        try {
          hitTestSource =
            (await session.requestHitTestSource({
              space: viewerSpace,
              entityTypes: ['plane', 'point'],
            })) ?? null;
        } catch (entityTypeError) {
          console.warn('[WebXR] Entity-specific hit-test request failed; retrying default source', entityTypeError);
          hitTestSource = (await session.requestHitTestSource({ space: viewerSpace })) ?? null;
        }
      }
    } catch (err) {
      const classified = classifyWebXrError(err);
      console.warn(classified.logDetail, err);
      hitTestSource = null;
    }
    this.hitTestSource = hitTestSource;

    try {
      if (session.requestHitTestSourceForTransientInput) {
        this.transientHitTestSource =
          (await session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' })) ?? null;
        arDebugger.info('WebXR', 'Transient touch hit-test source created', {
          persistent: Boolean(hitTestSource),
        });
      }
    } catch (err) {
      this.transientHitTestSource = null;
      arDebugger.warn('WebXR', 'Transient touch hit-test unavailable', err);
    }

    if (hitTestSource) {
      logArLifecycle('HIT_TEST_SOURCE_CREATED');
    } else {
      const message =
        'Plane detection (hit-test) is unavailable. Update Google Play Services for AR or move to a well-lit area with visible floor surfaces.';
      console.warn('[WebXR] Hit-test source unavailable');
      options.onHitTestUnavailable?.(message);
    }

    this.attachSessionListeners(session);

    this.frameLoopActive = true;
    this.animFrameId = session.requestAnimationFrame(this.onXrFrame);
    this.lifecycleState = 'running';
    logArLifecycle('XR_FRAME_LOOP_START');
    logArLifecycle('XR_SESSION_CREATED', 'running');
  }

  private onXrFrame = (time: number, frame: XRFrame): void => {
    if (!this.frameLoopActive || this.tearingDown) return;

    const session = this.session;
    const gl = this.glContext;
    const refSpace = this.refSpace;
    if (!session || !gl || !refSpace) return;

    const baseLayer = session.renderState.baseLayer;
    if (baseLayer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
      gl.viewport(0, 0, baseLayer.framebufferWidth, baseLayer.framebufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    this.onFrameCallback?.(time, frame, {
      session,
      refSpace,
      hitTestSource: this.hitTestSource,
      gl,
    });

    if (this.frameLoopActive && !this.tearingDown && this.session) {
      this.animFrameId = this.session.requestAnimationFrame(this.onXrFrame);
    }
  };

  private attachSessionListeners(session: XRSession): void {
    this.endListener = () => {
      if (this.tearingDown) return;
      console.info('[WebXR] Session ended (native end event)');
      this.sessionAlreadyEnded = true;
      void this.endSession();
    };

    session.addEventListener('end', this.endListener);

    if (this.onSelectCallback) {
      const handler = (event: XRInputSourceEvent) => {
        if (this.tearingDown || !this.onSelectCallback) return;
        logArLifecycle('XR_SELECT');
        const frame = (event as XRInputSourceEvent & { frame?: XRFrame }).frame;
        const tapHit = resolveSelectHitTest(
          frame,
          event.inputSource,
          this.transientHitTestSource,
          this.hitTestSource,
        );
        arDebugger.debug('WebXR', 'XR select received', {
          hasTapHit: Boolean(tapHit),
          usedTransientHit: Boolean(this.transientHitTestSource && tapHit),
        });
        try {
          this.onSelectCallback(event, tapHit, frame);
        } catch (err) {
          console.error('[WebXR] onSelect callback failed', err);
        }
      };
      session.addEventListener('select', handler);
      this.detachSelectPlacement = () => session.removeEventListener('select', handler);
    }
  }

  private detachSessionListeners(session: XRSession | null): void {
    if (!session) return;
    if (this.endListener) {
      session.removeEventListener('end', this.endListener);
      this.endListener = null;
    }
    this.detachSelectPlacement?.();
    this.detachSelectPlacement = null;
  }

  /**
   * Strict async ARCore teardown — detach XRWebGLLayer, await session.end(),
   * then destroy WebGL context BEFORE React may unmount the canvas.
   */
  async endSession(): Promise<void> {
    if (this.endSessionPromise) return this.endSessionPromise;
    if (!this.session && !this.glContext && !this.mediaStream) return;

    this.endSessionPromise = this.runEndSession().finally(() => {
      this.endSessionPromise = null;
    });
    return this.endSessionPromise;
  }

  /** @deprecated Prefer endSession() */
  async teardown(_reason = 'manual'): Promise<void> {
    return this.endSession();
  }

  private async runEndSession(): Promise<void> {
    if (this.tearingDown && !this.session && this.lifecycleState === 'idle') {
      this.forceGlAndMediaCleanup();
      return;
    }

    this.lifecycleState = 'stopping';
    this.tearingDown = true;
    this.frameLoopActive = false;
    logArLifecycle('XR_FRAME_LOOP_STOP');
    logArLifecycle('XR_SESSION_END_BEGIN');

    const session = this.session;
    const alreadyEnded = this.sessionAlreadyEnded;
    this.detachSessionListeners(session);

    try {
      if (this.hitTestSource) {
        this.hitTestSource.cancel();
        this.hitTestSource = null;
      }

      if (this.animFrameId != null && session?.cancelAnimationFrame) {
        session.cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      if (session && !alreadyEnded) {
        try {
          session.updateRenderState({ baseLayer: null });
        } catch (err) {
          console.warn('[WebXR] baseLayer detach failed', err);
        }

        await session.end();
      }
    } catch (error) {
      console.warn('WebXR Session end threw an error, forcing cleanup:', error);
    } finally {
      this.session = null;
      this.refSpace = null;
      this.hitTestSource = null;
      if (this.transientHitTestSource) {
        this.transientHitTestSource.cancel();
        this.transientHitTestSource = null;
      }
      this.animFrameId = null;
      this.sessionAlreadyEnded = false;

      this.releaseVideoAndGl();

      if (!this.suppressEndedCallback) {
        try {
          this.onEndedCallback?.();
        } catch (err) {
          console.warn('[WebXR] onEnded callback failed', err);
        }
      }
      this.suppressEndedCallback = false;
      this.onEndedCallback = null;
      this.onFrameCallback = null;
      this.onSelectCallback = null;
      this.tearingDown = false;
      this.lifecycleState = 'idle';
      logArLifecycle('XR_SESSION_END_COMPLETE');
    }
  }

  private releaseVideoAndGl(): void {
    if (this.glContext) {
      this.glContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch (err) {
          console.warn('[WebXR] Media track stop failed', err);
        }
      });
      this.mediaStream = null;
    }

    if (this.videoElement) {
      try {
        this.videoElement.pause();
      } catch {
        // ignore
      }
      const stream = this.videoElement.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      }
      this.videoElement.srcObject = null;
      try {
        this.videoElement.load();
      } catch {
        // ignore
      }
      this.videoElement = null;
    }
  }

  private forceGlAndMediaCleanup(): void {
    this.releaseVideoAndGl();
  }
}
