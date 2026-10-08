import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARCORE_UPDATE_MESSAGE,
  checkWebXrArSupport,
  classifyWebXrError,
  resolveSelectHitTest,
  WebXrSessionManager,
} from './webXrSessionManager';

function stubBrowserGlobals(overrides: {
  isSecureContext?: boolean;
  xr?: XRSystem | undefined;
}): void {
  vi.stubGlobal('window', { isSecureContext: overrides.isSecureContext ?? true });
  vi.stubGlobal('navigator', { xr: overrides.xr });
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe('webXrSessionManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('classifyWebXrError', () => {
    it('maps ARCore-related failures to Play Store guidance', () => {
      const result = classifyWebXrError(new DOMException('ARCore not installed', 'NotSupportedError'));
      expect(result.isArcoreLikely).toBe(true);
      expect(result.userWarning).toBe(ARCORE_UPDATE_MESSAGE);
    });

    it('maps hit-test failures to ARCore guidance', () => {
      const result = classifyWebXrError(new Error('Failed to create hit-test source'));
      expect(result.isArcoreLikely).toBe(true);
      expect(result.userWarning).toBe(ARCORE_UPDATE_MESSAGE);
    });

    it('maps generic errors without ARCore hint', () => {
      const result = classifyWebXrError(new Error('User activation required'));
      expect(result.isArcoreLikely).toBe(false);
      expect(result.userWarning).toBeNull();
    });
  });

  describe('checkWebXrArSupport', () => {
    it('rejects insecure contexts', async () => {
      stubBrowserGlobals({ isSecureContext: false });
      const result = await checkWebXrArSupport();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('insecure');
    });

    it('rejects when WebXR API is missing', async () => {
      stubBrowserGlobals({ xr: undefined });
      const result = await checkWebXrArSupport();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('unsupported');
    });

    it('rejects when immersive-ar is not supported', async () => {
      stubBrowserGlobals({
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(false),
          requestSession: vi.fn(),
        } as unknown as XRSystem,
      });
      const result = await checkWebXrArSupport();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('arcore');
        expect(result.userWarning).toBe(ARCORE_UPDATE_MESSAGE);
      }
    });

    it('accepts when immersive-ar is supported', async () => {
      stubBrowserGlobals({
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(true),
          requestSession: vi.fn(),
        } as unknown as XRSystem,
      });
      const result = await checkWebXrArSupport();
      expect(result.ok).toBe(true);
    });
  });

  describe('resolveSelectHitTest', () => {
    it('uses a same-frame persistent hit when transient input has no result', () => {
      const persistentHit = {} as XRHitTestResult;
      const frame = {
        getHitTestResultsForTransientInput: vi.fn().mockReturnValue([]),
        getHitTestResults: vi.fn().mockReturnValue([persistentHit]),
      } as unknown as XRFrame;
      const persistentSource = {} as XRHitTestSource;
      const inputSource = {} as XRInputSource;

      expect(
        resolveSelectHitTest(
          frame,
          inputSource,
          {} as XRTransientInputHitTestSource,
          persistentSource,
        ),
      ).toBe(persistentHit);
      expect(frame.getHitTestResults).toHaveBeenCalledWith(persistentSource);
    });
  });

  describe('WebXrSessionManager.teardown', () => {
    it('awaits session.end and clears references', async () => {
      const end = vi.fn().mockResolvedValue(undefined);
      const cancel = vi.fn();
      const removeEnd = vi.fn();
      const removeSelect = vi.fn();

      const session = {
        end,
        renderState: { baseLayer: undefined },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn((type: string) => {
          if (type === 'end') removeEnd();
          if (type === 'select') removeSelect();
        }),
        requestAnimationFrame: vi.fn(),
      } as unknown as XRSession;

      const manager = new WebXrSessionManager();
      (manager as unknown as { session: XRSession | null }).session = session;
      (manager as unknown as { hitTestSource: XRHitTestSource | null }).hitTestSource = {
        cancel,
      } as unknown as XRHitTestSource;

      await manager.teardown('test');

      expect(cancel).toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
      expect(manager.getSession()).toBeNull();
      expect(manager.getHitTestSource()).toBeNull();
    });

    it('is idempotent when teardown is called twice', async () => {
      const end = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
      );

      const session = {
        end,
        renderState: { baseLayer: undefined },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as XRSession;

      const manager = new WebXrSessionManager();
      (manager as unknown as { session: XRSession | null }).session = session;

      const first = manager.teardown('test');
      const second = manager.teardown('test');
      await Promise.all([first, second]);

      expect(end).toHaveBeenCalledTimes(1);
    });
  });
});
