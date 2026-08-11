import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { UserPose } from '../lib/geo';
import { GPS_MAX_ACCURACY_M, haversineMeters } from '../lib/geo';

export interface GeoWatchState {
  pose: UserPose | null;
  error: string | null;
  watching: boolean;
  /** True after deviceorientation delivers a heading (compass). */
  compassAvailable: boolean;
  /** Compass-only heading for turn UI; null when compass unavailable. */
  compassHeading: number | null;
  requestCompassPermission: () => Promise<boolean>;
  /** Force a fresh high-accuracy read (call when user taps Track me). */
  refreshLocation: () => void;
}

const GEO_HIGH: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
};

type GpsRefs = {
  compassHeadingRef: MutableRefObject<number | null>;
  lastFixRef: MutableRefObject<{ lat: number; lon: number; t: number; accuracy: number | null } | null>;
  courseHeadingRef: MutableRefObject<number | null>;
  smoothedRef: MutableRefObject<{ lat: number; lon: number } | null>;
  bestAccuracyRef: MutableRefObject<number | null>;
  setPose: Dispatch<SetStateAction<UserPose | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  hasPoseRef: MutableRefObject<boolean>;
};

function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

function resetGpsFilters(refs: GpsRefs): void {
  refs.smoothedRef.current = null;
  refs.lastFixRef.current = null;
  refs.bestAccuracyRef.current = null;
  refs.hasPoseRef.current = false;
}

/** Reject the first coarse network fix; real GPS usually reports ≤ 65 m. */
function shouldAcceptFix(
  accuracy: number | null,
  bestAccuracy: number | null,
  hasPose: boolean,
  force: boolean,
): boolean {
  if (force) return true;
  if (accuracy == null) return true;
  if (!hasPose) return accuracy <= 100;
  if (accuracy <= GPS_MAX_ACCURACY_M) return true;
  if (bestAccuracy != null && accuracy <= bestAccuracy * 0.85) return true;
  return false;
}

/**
 * Allow large jumps when correcting a bad network/Wi‑Fi fix (often km away from truth).
 */
function shouldAllowJump(
  jumpM: number,
  dtSec: number,
  prevAccuracy: number | null,
  newAccuracy: number | null,
  force: boolean,
): boolean {
  if (force) return true;
  if (jumpM / dtSec <= 40) return true;
  if (prevAccuracy != null && prevAccuracy > GPS_MAX_ACCURACY_M) return true;
  if (newAccuracy != null && newAccuracy <= 50 && jumpM > 150) return true;
  if (
    newAccuracy != null &&
    prevAccuracy != null &&
    newAccuracy < prevAccuracy * 0.65 &&
    jumpM > 80
  ) {
    return true;
  }
  return false;
}

function applyPosition(pos: GeolocationPosition, refs: GpsRefs, force = false): boolean {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const accuracy = pos.coords.accuracy ?? null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;

  if (!shouldAcceptFix(accuracy, refs.bestAccuracyRef.current, refs.hasPoseRef.current, force)) {
    return false;
  }

  const prev = refs.lastFixRef.current;
  const smoothed = refs.smoothedRef.current;
  if (prev && smoothed) {
    const jumpM = haversineMeters(smoothed.lat, smoothed.lon, lat, lon);
    const dtSec = Math.max(0.001, (pos.timestamp - prev.t) / 1000);
    if (!shouldAllowJump(jumpM, dtSec, prev.accuracy, accuracy, force)) {
      return false;
    }
  }

  const reliable = accuracy == null || accuracy <= GPS_MAX_ACCURACY_M;
  let outLat = lat;
  let outLon = lon;

  // Only smooth noisy fixes — never blend toward a wrong network location.
  if (smoothed && !force && !reliable && accuracy != null && accuracy > 25) {
    const alpha = accuracy > 45 ? 0.35 : 0.55;
    outLat = smoothed.lat * (1 - alpha) + lat * alpha;
    outLon = smoothed.lon * (1 - alpha) + lon * alpha;
  }

  refs.smoothedRef.current = { lat: outLat, lon: outLon };
  refs.lastFixRef.current = { lat, lon, t: pos.timestamp, accuracy };

  if (accuracy != null) {
    refs.bestAccuracyRef.current =
      refs.bestAccuracyRef.current == null
        ? accuracy
        : Math.min(refs.bestAccuracyRef.current, accuracy);
  }

  const gpsHeading =
    pos.coords.heading != null && Number.isFinite(pos.coords.heading)
      ? normalizeHeading(pos.coords.heading)
      : null;

  if (prev) {
    const movedM = haversineMeters(prev.lat, prev.lon, lat, lon);
    const dt = pos.timestamp - prev.t;
    if (movedM >= 2 && dt > 0 && dt < 15_000) {
      refs.courseHeadingRef.current = bearingBetween(prev.lat, prev.lon, lat, lon);
    }
  }

  const heading =
    gpsHeading ?? refs.compassHeadingRef.current ?? refs.courseHeadingRef.current ?? null;

  refs.setPose({
    latitude: outLat,
    longitude: outLon,
    accuracy,
    heading,
    timestamp: pos.timestamp,
  });
  refs.hasPoseRef.current = true;
  refs.setError(null);
  return true;
}

/** Watch browser GPS; prefer high-accuracy fixes over coarse network guesses. */
export function useGeolocation(enabled = true): GeoWatchState {
  const [pose, setPose] = useState<UserPose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [compassAvailable, setCompassAvailable] = useState(false);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const compassHeadingRef = useRef<number | null>(null);
  const lastFixRef = useRef<{ lat: number; lon: number; t: number; accuracy: number | null } | null>(
    null,
  );
  const courseHeadingRef = useRef<number | null>(null);
  const smoothedRef = useRef<{ lat: number; lon: number } | null>(null);
  const bestAccuracyRef = useRef<number | null>(null);
  const hasPoseRef = useRef(false);
  const refsRef = useRef<GpsRefs | null>(null);

  const requestCompassPermission = async (): Promise<boolean> => {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        return result === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  };

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    const refs = refsRef.current;
    if (!refs) return;

    resetGpsFilters(refs);
    setError('Getting precise GPS… stand outdoors if possible.');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos, refs, true);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — allow precise location in browser settings.'
            : 'Could not get GPS — move outdoors and tap Track me again.',
        );
      },
      GEO_HIGH,
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onOrient(e: DeviceOrientationEvent) {
      const webkit = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let next: number | null = null;
      if (typeof webkit.webkitCompassHeading === 'number') {
        next = normalizeHeading(webkit.webkitCompassHeading);
      } else if (e.alpha != null) {
        next = normalizeHeading(360 - e.alpha);
      }
      if (next == null) return;
      compassHeadingRef.current = next;
      setCompassAvailable(true);
      setCompassHeading(next);
    }

    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientationabsolute', onOrient as EventListener);

    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('deviceorientationabsolute', onOrient as EventListener);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }

    const refs: GpsRefs = {
      compassHeadingRef,
      lastFixRef,
      courseHeadingRef,
      smoothedRef,
      bestAccuracyRef,
      setPose,
      setError,
      hasPoseRef,
    };
    refsRef.current = refs;

    setWatching(true);

    // Prefer watchPosition for continuous updates; skip initial getCurrentPosition
    // so we don't lock onto a stale network fix before GPS warms up.
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        applyPosition(pos, refs, false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — pick a start point on the map.'
            : 'Waiting for GPS… allow precise location and try outdoors.',
        );
      },
      GEO_HIGH,
    );

    // After a short delay, force one high-accuracy read to replace any coarse fix.
    const warmup = window.setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyPosition(pos, refs, true),
        () => {},
        GEO_HIGH,
      );
    }, 2500);

    const tick = window.setInterval(() => {
      setPose((prev) => {
        if (!prev) return prev;
        const nextHeading =
          compassHeadingRef.current ?? courseHeadingRef.current ?? prev.heading;
        if (nextHeading == null || nextHeading === prev.heading) return prev;
        return { ...prev, heading: nextHeading };
      });
    }, 250);

    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearTimeout(warmup);
      window.clearInterval(tick);
      setWatching(false);
      refsRef.current = null;
      hasPoseRef.current = false;
      bestAccuracyRef.current = null;
      smoothedRef.current = null;
      lastFixRef.current = null;
    };
  }, [enabled]);

  return {
    pose,
    error,
    watching,
    compassAvailable,
    compassHeading,
    requestCompassPermission,
    refreshLocation,
  };
}
