import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {SpatialMeasurementPoint} from '@campusar/shared';
import {api, ApiError} from '../../api/api';
import {
  CampusARMeasureView,
  getCampusARMeasureModule,
  isNativeArSupported,
} from '../../ar/nativeCampusARMeasure';
import type {ArMeasureEvent, ArTrackingQuality, ArWorldPoint} from '../../ar/types';
import {useAuthStore} from '../../stores/authStore';
import {useSiteStore} from '../../stores/siteStore';

type Props = {
  onBack: () => void;
};

const TRACKING_LABEL: Record<ArTrackingQuality, string> = {
  unavailable: 'AR unavailable',
  initializing: 'Initializing tracking…',
  limited: 'Limited tracking',
  normal: 'Tracking normal',
  interrupted: 'Tracking interrupted',
};

export function ArMeasurementScreen({onBack}: Props) {
  const token = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  const siteId = useSiteStore(s => s.activeSiteId);
  const [tracking, setTracking] = useState<ArTrackingQuality>('initializing');
  const [trackingReason, setTrackingReason] = useState<string | undefined>();
  const [surfaceDetected, setSurfaceDetected] = useState(false);
  const [points, setPoints] = useState<ArWorldPoint[]>([]);
  const [segmentM, setSegmentM] = useState<number | null>(null);
  const [totalM, setTotalM] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const native = useMemo(() => (isNativeArSupported() ? getCampusARMeasureModule() : null), []);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    (async () => {
      try {
        await native.startSession();
        if (!cancelled) setSessionReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start AR session');
        }
      }
    })();
    return () => {
      cancelled = true;
      void native.pauseSession();
    };
  }, [native]);

  const onMeasureEvent = useCallback((event: {nativeEvent: ArMeasureEvent}) => {
    const payload = event.nativeEvent;
    if (payload.type === 'tracking') {
      setTracking(payload.quality);
      setTrackingReason(payload.reason);
    } else if (payload.type === 'surface') {
      setSurfaceDetected(payload.detected);
    } else if (payload.type === 'points') {
      setPoints(payload.points);
      setSegmentM(payload.segmentDistanceM);
      setTotalM(payload.totalDistanceM);
    } else if (payload.type === 'error') {
      setError(payload.message);
    }
  }, []);

  async function ensurePath(): Promise<string> {
    if (pathId) return pathId;
    if (!token) throw new ApiError('UNAUTHORIZED', 'Sign in to save measurements.', 401);
    if (!siteId) {
      throw new ApiError('SITE_REQUIRED', 'Select a campus site before saving measurements.', 400);
    }
    if (user?.role !== 'admin') {
      throw new ApiError(
        'FORBIDDEN',
        'Saving AR paths requires an organization admin account (map builder draft).',
        403,
      );
    }
    const snap = await api.mapBuilderSnapshot(token);
    const path = await api.measurements.createPath(
      {
        siteId,
        mapVersionId: snap.version.id,
        name: `Mobile AR ${new Date().toISOString()}`,
        pathType: 'indoor',
        status: 'draft',
        metadata: {platform: Platform.OS, source: 'native_ar'},
      },
      token,
    );
    setPathId(path.id);
    return path.id;
  }

  async function onPlacePoint() {
    if (!native) return;
    setBusy(true);
    setError(null);
    try {
      const placed = await native.placePoint();
      if (!placed) {
        setError('No surface detected. Aim at a textured floor and try again.');
        return;
      }
      if (token) {
        const id = await ensurePath();
        const spatial: SpatialMeasurementPoint = {
          worldPosition: {
            x: placed.x * 1000,
            y: placed.y * 1000,
            z: placed.z * 1000,
          },
          raycastTarget: {type: 'plane', confidence: tracking === 'normal' ? 0.85 : 0.55},
          trackingQuality: {
            state: tracking === 'normal' ? 'normal' : 'limited',
            featureDensity: tracking === 'normal' ? 0.8 : 0.4,
            depthAvailable: false,
            cameraMotionSmoothed: true,
          },
          estimatedAccuracy: tracking === 'normal' ? 40 : 120,
          revisitCount: 0,
          timestamp: Date.now(),
        };
        await api.measurements.addPoint(id, {point: spatial, label: `P${points.length + 1}`}, token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not place point');
    } finally {
      setBusy(false);
    }
  }

  if (!native) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Native AR not linked</Text>
        <Text style={styles.fallbackBody}>
          Rebuild the {Platform.OS} application to include CampusARMeasure native modules.
        </Text>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CampusARMeasureView style={StyleSheet.absoluteFill} onMeasureEvent={onMeasureEvent} />
      <View style={styles.reticle} pointerEvents="none" />
      <View style={styles.hud}>
        <View style={styles.row}>
          <Pressable onPress={onBack}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
          <Text style={styles.tracking}>
            {TRACKING_LABEL[tracking]}
            {trackingReason ? ` — ${trackingReason}` : ''}
          </Text>
        </View>
        <Text style={styles.metric}>
          Segment: {segmentM != null ? `${segmentM.toFixed(2)} m` : '—'} · Total:{' '}
          {totalM.toFixed(2)} m · Points: {points.length}
        </Text>
        <Text style={styles.hint}>
          {surfaceDetected
            ? 'Surface detected — tap Place point'
            : 'Move slowly to detect horizontal surfaces'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.controls}>
          <Pressable
            style={[styles.btn, (!sessionReady || busy) && styles.btnDisabled]}
            disabled={!sessionReady || busy}
            onPress={onPlacePoint}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Place point</Text>}
          </Pressable>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => {
              void native.undoLastPoint();
            }}>
            <Text style={styles.btnSecondaryText}>Undo</Text>
          </Pressable>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => {
              void native.clearPoints();
              setPathId(null);
            }}>
            <Text style={styles.btnSecondaryText}>Clear</Text>
          </Pressable>
          <Pressable
            style={styles.btnSecondary}
            onPress={() => {
              void native.resetSession();
              setPathId(null);
            }}>
            <Text style={styles.btnSecondaryText}>Reset AR</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  reticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(15,23,42,0.82)',
  },
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  tracking: {color: '#e2e8f0', fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 8},
  metric: {color: '#f8fafc', marginTop: 8, fontWeight: '600'},
  hint: {color: '#94a3b8', marginTop: 4, fontSize: 13},
  error: {color: '#fca5a5', marginTop: 6},
  controls: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  btnDisabled: {opacity: 0.5},
  btnText: {color: '#fff', fontWeight: '600'},
  btnSecondary: {
    borderColor: '#475569',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSecondaryText: {color: '#e2e8f0'},
  link: {color: '#93c5fd', fontWeight: '600'},
  fallback: {flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f172a'},
  fallbackTitle: {color: '#f8fafc', fontSize: 20, fontWeight: '700'},
  fallbackBody: {color: '#94a3b8', marginVertical: 12},
});
