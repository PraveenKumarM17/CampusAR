/** Development-only AR diagnostics — enable with ?ar_debug=1 or localStorage campusar_ar_debug=1 */

export type ArDiagnosticCode =
  | 'WEBXR_NOT_SUPPORTED'
  | 'IMMERSIVE_AR_NOT_SUPPORTED'
  | 'SESSION_REQUEST_FAILED'
  | 'REFERENCE_SPACE_FAILED'
  | 'HIT_TEST_SOURCE_FAILED'
  | 'NO_HIT_RESULT'
  | 'ANCHOR_CREATION_FAILED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'SESSION_ENDED'
  | 'CAMERA_RESOURCE_RELEASE_FAILED'
  | 'GPS_UNAVAILABLE'
  | 'PLACE_POINT_FAILED';

export type ArDiagnosticEntry = {
  code: ArDiagnosticCode;
  operation: string;
  detail: string;
  ts: number;
};

export type ArDiagnosticSnapshot = {
  browser: string;
  secureContext: boolean;
  measureMode: string | null;
  xrSessionActive: boolean;
  hitTestReady: boolean;
  hasValidHitPose: boolean;
  anchorPointCount: number;
  cameraTrackCount: number;
  lifecycleState: string;
  cameraOwner: string;
  lastError: string | null;
};

const MAX_LOG = 40;
const log: ArDiagnosticEntry[] = [];

export function isArDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('campusar_ar_debug') === '1') return true;
    return new URLSearchParams(window.location.search).get('ar_debug') === '1';
  } catch {
    return false;
  }
}

/** Lifecycle trace events — enable with ?ar_debug=1 */
export type ArLifecycleEvent =
  | 'AR_OPEN'
  | 'AR_START_BEGIN'
  | 'AR_MODE'
  | 'CAMERA_OWNER'
  | 'PREVIEW_RELEASE_BEGIN'
  | 'PREVIEW_RELEASE_COMPLETE'
  | 'XR_SESSION_REQUEST_BEGIN'
  | 'XR_SESSION_CREATED'
  | 'XR_SESSION_END_BEGIN'
  | 'XR_SESSION_END_COMPLETE'
  | 'HIT_TEST_SOURCE_CREATED'
  | 'XR_FRAME_LOOP_START'
  | 'XR_FRAME_LOOP_STOP'
  | 'PLACE_BUTTON'
  | 'XR_SELECT'
  | 'HIT_POSE_VALID'
  | 'POINT_CREATED'
  | 'GPS_AVAILABLE'
  | 'GPS_UNAVAILABLE'
  | 'ANCHOR_CREATED'
  | 'ANCHOR_FAILED'
  | 'CLEANUP_BEGIN'
  | 'CLEANUP_COMPLETE';

export function logArLifecycle(event: ArLifecycleEvent, detail = ''): void {
  if (isArDebugEnabled()) {
    console.info(`[AR Lifecycle] ${event}${detail ? ` — ${detail}` : ''}`);
  }
}

export function logArDiagnostic(
  code: ArDiagnosticCode,
  operation: string,
  detail: string,
  err?: unknown,
): void {
  const entry: ArDiagnosticEntry = {
    code,
    operation,
    detail: err instanceof Error ? `${detail}: ${err.message}` : detail,
    ts: Date.now(),
  };
  log.unshift(entry);
  if (log.length > MAX_LOG) log.length = MAX_LOG;
  if (isArDebugEnabled()) {
    console.info(`[AR Diag] ${code} @ ${operation} — ${entry.detail}`);
  }
}

export function getArDiagnosticLog(): readonly ArDiagnosticEntry[] {
  return log;
}

export function userMessageForDiagnostic(code: ArDiagnosticCode): string {
  switch (code) {
    case 'WEBXR_NOT_SUPPORTED':
    case 'IMMERSIVE_AR_NOT_SUPPORTED':
      return 'WebXR AR is not available on this browser. Use Chrome on an ARCore-capable Android device over HTTPS.';
    case 'SESSION_REQUEST_FAILED':
      return 'Could not start the AR session. Update Google Play Services for AR and try again.';
    case 'REFERENCE_SPACE_FAILED':
      return 'AR tracking space failed to initialize. Restart the browser and try again.';
    case 'HIT_TEST_SOURCE_FAILED':
      return 'Plane detection failed to start. Move to a well-lit area with visible floor surfaces.';
    case 'NO_HIT_RESULT':
      return 'No surface detected. Point at a flat floor or wall until the reticle turns green.';
    case 'ANCHOR_CREATION_FAILED':
      return 'Point placed using hit-test pose (anchor optional).';
    case 'CAMERA_PERMISSION_DENIED':
      return 'Camera permission is required. Allow camera access in browser settings.';
    case 'GPS_UNAVAILABLE':
      return 'Location unavailable — point placed without GPS metadata.';
    case 'PLACE_POINT_FAILED':
      return 'Could not place the measurement point. Try again on the same surface.';
    default:
      return 'An AR error occurred. Stop AR, wait a moment, then try again.';
  }
}
