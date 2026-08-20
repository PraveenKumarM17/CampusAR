import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, MapPin, Volume2, AlertTriangle, Users, CheckCircle2, LocateFixed } from 'lucide-react';
import type { CampusPlace, GraphNode, RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useCampusLive } from '../../hooks/useCampusLive';
import { useGeolocation } from '../../hooks/useGeolocation';
import {
  bearingDegrees,
  isNavigationGpsReady,
  isReliableGpsFix,
  snapGpsForRouting,
} from '../../lib/geo';
import {
  classifyTurn,
  dampRelativeBearing,
  relativeBearingDeg,
} from '../../lib/navigationHeading';
import {
  computeRouteProgress,
  distanceToNextWaypointM,
  evaluateOffRouteRecalc,
  formatDistance,
  isNearDestination,
  OFF_ROUTE_RECALC_M,
  updateArrivalHold,
} from '../../lib/routeProgress';
import {
  appendMovementSample,
  evaluateGpsMovement,
  type GpsMovementSample,
} from '../../lib/gpsMovement';
import { GuideDollViewport, guideFacingBearing, poseFromRouteContext } from './GuideDoll';
import { CAMPUS_LABEL } from '../../lib/campus';

/** Explicit navigation phases — only one primary phase at a time. */
export type ArNavPhase =
  | 'initializing'
  | 'waiting_gps'
  | 'gps_unavailable'
  | 'navigating'
  | 'off_route'
  | 'recalculating'
  | 'arrived';

const OFF_ROUTE_CHECK_MS = 3_000;
const ARROW_DAMP_DEG = 10;
const DOLL_YAW_DAMP_DEG = 8;
const GPS_INIT_TIMEOUT_MS = 12_000;

function campusPlacesToGraphNodes(places: CampusPlace[]): GraphNode[] {
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    floorId: p.floorId,
    buildingId: p.buildingId,
    kind: p.kind,
  }));
}

export function ArPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const {
    sourceNodeId,
    destinationNodeId,
    hasIndoorMap,
    selectedBuildingName,
    markArrivedAtBuilding,
  } = useNavStore();
  const { accessibility, voiceEnabled, avatarGender, setAvatarGender } = usePrefsStore();
  const live = useCampusLive();
  const {
    pose,
    error: gpsError,
    watching,
    compassHeading,
    requestCompassPermission,
    refreshLocation,
  } = useGeolocation(true);

  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [manualStepIndex, setManualStepIndex] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const [greetingWave, setGreetingWave] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [routeReady, setRouteReady] = useState(false);
  const [initTimedOut, setInitTimedOut] = useState(false);
  const [userWalking, setUserWalking] = useState(false);

  const routeReqId = useRef(0);
  const lastRouteSourceRef = useRef<string | null>(null);
  const lastRecalcAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const arrivalHoldRef = useRef<{ since: number | null }>({ since: null });
  const lastSpokenStepRef = useRef(-1);
  const bootstrapAttemptedRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const movementSamplesRef = useRef<GpsMovementSample[]>([]);
  const userWalkingRef = useRef(false);
  const [arrowRotation, setArrowRotation] = useState(0);
  const [dollYawDeg, setDollYawDeg] = useState(0);

  const placeNodes = useMemo(() => campusPlacesToGraphNodes(places), [places]);

  useEffect(() => {
    api.places(token).then(setPlaces).catch(() => setPlaces([]));
  }, [token]);

  useEffect(() => {
    void requestCompassPermission();
  }, [requestCompassPermission]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError('Camera unavailable — showing simulated AR overlay.');
      }
    }
    void startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const resolveRouteSource = useCallback(
    (preferredId?: string | null): string | null => {
      if (preferredId) return preferredId;
      if (pose && placeNodes.length > 0 && isNavigationGpsReady(pose)) {
        const snap = snapGpsForRouting(pose, placeNodes);
        setGpsNote(snap.message);
        if (snap.ok) return snap.node.id;
      }
      return sourceNodeId;
    },
    [pose, placeNodes, sourceNodeId],
  );

  const loadRoute = useCallback(
    async (options?: {
      resetProgress?: boolean;
      sourceId?: string | null;
      /** Set after the first bootstrap attempt finishes (success or failure). */
      markReady?: boolean;
    }) => {
      const destination = destinationNodeId;
      const source = resolveRouteSource(options?.sourceId ?? null);
      if (!source || !destination) {
        if (options?.markReady) setRouteReady(true);
        setError('Pick a source and destination on Map or Navigate first.');
        return;
      }
      if (source === destination) {
        if (options?.markReady) setRouteReady(true);
        setError('Source and destination must be different.');
        return;
      }

      const reqId = ++routeReqId.current;
      setLoadingRoute(true);
      try {
        const r = await api.recalculate(
          { sourceNodeId: source, destinationNodeId: destination, accessibility, usePrediction: true },
          token,
        );
        if (reqId !== routeReqId.current) return;
        setRoute(r);
        lastRouteSourceRef.current = source;
        lastRecalcAtRef.current = Date.now();
        offRouteSinceRef.current = null;
        if (options?.resetProgress) {
          setManualStepIndex(0);
          setArrived(false);
          arrivalHoldRef.current = { since: null };
          lastSpokenStepRef.current = -1;
          setGreetingWave(true);
        }
        setError(null);
      } catch (err) {
        if (reqId !== routeReqId.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load route');
      } finally {
        if (reqId === routeReqId.current) {
          setLoadingRoute(false);
          if (options?.markReady) setRouteReady(true);
        }
      }
    },
    [destinationNodeId, resolveRouteSource, accessibility, token],
  );

  const loadRouteRef = useRef(loadRoute);
  loadRouteRef.current = loadRoute;

  // Reset session when endpoints change — do not load a route until GPS bootstrap completes.
  useEffect(() => {
    setRoute(null);
    setRouteReady(false);
    setInitTimedOut(false);
    bootstrapAttemptedRef.current = false;
    offRouteSinceRef.current = null;
    setArrived(false);
    arrivalHoldRef.current = { since: null };
    lastSpokenStepRef.current = -1;
    setManualStepIndex(0);
    movementSamplesRef.current = [];
    userWalkingRef.current = false;
    setUserWalking(false);
  }, [sourceNodeId, destinationNodeId, accessibility, token]);

  // Stop waiting indefinitely for GPS during bootstrap.
  useEffect(() => {
    if (routeReady || !destinationNodeId) return;
    const t = window.setTimeout(() => setInitTimedOut(true), GPS_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [routeReady, destinationNodeId, sourceNodeId, accessibility, token]);

  // GPS-first bootstrap: snap current location → calculate route → then render navigation.
  useEffect(() => {
    if (routeReady || !destinationNodeId || placeNodes.length === 0) return;
    if (bootstrapAttemptedRef.current) return;

    if (pose && isNavigationGpsReady(pose)) {
      const snap = snapGpsForRouting(pose, placeNodes);
      setGpsNote(snap.message);
      if (snap.ok) {
        bootstrapAttemptedRef.current = true;
        void loadRouteRef.current({
          resetProgress: true,
          sourceId: snap.node.id,
          markReady: true,
        });
        return;
      }
    }

    if (!initTimedOut) return;

    bootstrapAttemptedRef.current = true;
    if (sourceNodeId) {
      void loadRouteRef.current({
        resetProgress: true,
        sourceId: sourceNodeId,
        markReady: true,
      });
    } else {
      setRouteReady(true);
    }
  }, [routeReady, destinationNodeId, placeNodes, pose, initTimedOut, sourceNodeId]);

  // Off-route recalculation: sustained deviation + cooldown (never every GPS tick).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (arrived || loadingRoute || !route?.path.length || !destinationNodeId) return;
      if (!pose || !isNavigationGpsReady(pose)) return;

      const progress = computeRouteProgress(pose, route.path);
      const decision = evaluateOffRouteRecalc({
        distanceToRouteM: progress.distanceToRouteM,
        now: Date.now(),
        lastRecalcAt: lastRecalcAtRef.current,
        offRouteSince: offRouteSinceRef.current,
        loadingRoute,
      });
      offRouteSinceRef.current = decision.offRouteSince;
      if (!decision.shouldRecalc) return;

      const snap = snapGpsForRouting(pose, placeNodes);
      if (!snap.ok || snap.node.id === lastRouteSourceRef.current) return;
      void loadRouteRef.current({ resetProgress: false, sourceId: snap.node.id });
    }, OFF_ROUTE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [arrived, loadingRoute, route, destinationNodeId, pose, placeNodes]);

  const gpsReady = isNavigationGpsReady(pose);

  const progress = useMemo(() => {
    if (!gpsReady || !route?.path.length || !pose) return null;
    return computeRouteProgress(pose, route.path);
  }, [gpsReady, route, pose]);

  const stepIndex = gpsReady && progress ? progress.stepIndex : manualStepIndex;
  const step = route?.path[stepIndex];
  const nextStep = route?.path[stepIndex + 1];
  const nextWaypoint = nextStep ?? step;

  const distToNextMeters = useMemo(() => {
    if (progress && route?.path.length) {
      return distanceToNextWaypointM(progress, route.path);
    }
    return step?.distanceM ?? 0;
  }, [progress, route?.path, step?.distanceM]);

  const remaining = progress?.distanceRemainingM ?? route?.totalDistanceM ?? 0;

  const targetBearing = useMemo(() => {
    if (gpsReady && pose && nextWaypoint) {
      return bearingDegrees(
        pose.latitude,
        pose.longitude,
        nextWaypoint.latitude,
        nextWaypoint.longitude,
      );
    }
    return step?.bearing ?? 0;
  }, [gpsReady, pose, nextWaypoint, step?.bearing]);

  const guideBearing = useMemo(
    () =>
      guideFacingBearing({
        currentBearing: targetBearing,
        nextBearing: route?.path[stepIndex + 2]?.bearing ?? nextStep?.bearing,
        nextInstruction: nextStep?.instruction,
        distanceToNextM: distToNextMeters,
        turnWithinM: Math.max(35, Math.min(60, distToNextMeters * 0.85)),
      }),
    [targetBearing, route?.path, stepIndex, nextStep, distToNextMeters],
  );

  const rawArrowRel =
    compassHeading != null ? relativeBearingDeg(targetBearing, compassHeading) : null;
  const rawDollYaw =
    compassHeading != null ? relativeBearingDeg(guideBearing, compassHeading) : 0;

  useEffect(() => {
    if (rawArrowRel == null) return;
    setArrowRotation((prev) => dampRelativeBearing(prev, rawArrowRel, ARROW_DAMP_DEG));
  }, [rawArrowRel]);

  useEffect(() => {
    if (compassHeading == null) {
      setDollYawDeg(0);
      return;
    }
    setDollYawDeg((prev) => dampRelativeBearing(prev, rawDollYaw, DOLL_YAW_DAMP_DEG));
  }, [rawDollYaw, compassHeading]);

  const turnClass =
    rawArrowRel != null ? classifyTurn(rawArrowRel) : null;

  const navPhase: ArNavPhase = useMemo(() => {
    if (arrived) return 'arrived';
    if (!destinationNodeId) return 'initializing';
    if (!routeReady) {
      if (initTimedOut && !route) return 'gps_unavailable';
      return 'waiting_gps';
    }
    if (loadingRoute) return 'recalculating';
    if (!route) return 'gps_unavailable';
    if (!pose) return 'waiting_gps';
    if (!gpsReady) return 'gps_unavailable';
    if (progress && progress.distanceToRouteM > OFF_ROUTE_RECALC_M) return 'off_route';
    return 'navigating';
  }, [
    arrived,
    loadingRoute,
    destinationNodeId,
    route,
    pose,
    gpsReady,
    progress,
    routeReady,
    initTimedOut,
  ]);

  const poseAnim = poseFromRouteContext({
    instruction: step?.instruction,
    nextInstruction: nextStep?.instruction,
    distanceToNextM: distToNextMeters,
    arrived,
    waveWithinM: 30,
    atRouteStart: greetingWave && navPhase === 'navigating',
    isMoving: gpsReady ? userWalking : false,
  });
  const isWaving = poseAnim === 'waveLeft' || poseAnim === 'waveRight';

  const avgCrowd = useMemo(() => {
    if (!live.crowd.length) return null;
    const sum = live.crowd.reduce((s, c) => s + c.intensity, 0);
    return sum / live.crowd.length;
  }, [live.crowd]);

  useEffect(() => {
    if (!gpsReady || !route?.path.length || arrived || !pose) return;
    const near = isNearDestination(pose, route.path);
    const now = Date.now();
    const next = updateArrivalHold(near, now, arrivalHoldRef.current);
    arrivalHoldRef.current = { since: next.since };
    if (next.arrived) {
      setArrived(true);
      if (hasIndoorMap) markArrivedAtBuilding();
    }
  }, [gpsReady, pose, route, arrived, hasIndoorMap, markArrivedAtBuilding]);

  useEffect(() => {
    if (!voiceEnabled) return;
    if (arrived) {
      if (lastSpokenStepRef.current === -2) return;
      lastSpokenStepRef.current = -2;
      const utter = new SpeechSynthesisUtterance('Success. You have reached your destination.');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      return;
    }
    if (!step || stepIndex === lastSpokenStepRef.current) return;
    lastSpokenStepRef.current = stepIndex;
    const utter = new SpeechSynthesisUtterance(step.instruction);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [step, stepIndex, voiceEnabled, arrived]);

  const routeStartNodeId = route?.path?.[0]?.nodeId;

  useEffect(() => {
    if (!greetingWave) return;
    const t = setTimeout(() => setGreetingWave(false), 3800);
    return () => clearTimeout(t);
  }, [greetingWave, routeStartNodeId]);

  // Visual-only: doll walks when GPS shows meaningful displacement (not for navigation progress).
  useEffect(() => {
    if (!gpsReady || !pose || navPhase === 'arrived') {
      if (!gpsReady) {
        userWalkingRef.current = false;
        setUserWalking(false);
        movementSamplesRef.current = [];
      }
      return;
    }
    movementSamplesRef.current = appendMovementSample(movementSamplesRef.current, {
      latitude: pose.latitude,
      longitude: pose.longitude,
      timestamp: pose.timestamp,
    });
    const movement = evaluateGpsMovement(
      movementSamplesRef.current,
      userWalkingRef.current,
      Date.now(),
    );
    userWalkingRef.current = movement.walking;
    setUserWalking(movement.walking);
  }, [gpsReady, pose, navPhase]);

  // After Refresh GPS, recalculate when the next reliable fix arrives.
  useEffect(() => {
    if (!refreshPendingRef.current || !destinationNodeId || placeNodes.length === 0) return;
    if (!pose || !isNavigationGpsReady(pose)) return;
    refreshPendingRef.current = false;
    const snap = snapGpsForRouting(pose, placeNodes);
    setGpsNote(snap.message);
    if (!snap.ok || snap.node.id === lastRouteSourceRef.current) return;
    void loadRouteRef.current({ resetProgress: false, sourceId: snap.node.id });
  }, [pose, destinationNodeId, placeNodes]);

  function handleRefreshGps() {
    refreshPendingRef.current = true;
    void requestCompassPermission();
    refreshLocation();
  }

  function handleManualNext() {
    if (!route) return;
    setManualStepIndex((i) => Math.min(i + 1, route.path.length - 1));
  }

  function handleRestart() {
    setRoute(null);
    setRouteReady(false);
    setInitTimedOut(false);
    bootstrapAttemptedRef.current = false;
    movementSamplesRef.current = [];
    userWalkingRef.current = false;
    setUserWalking(false);
  }

  const destLabel =
    route?.destination?.name ??
    places.find((p) => p.id === destinationNodeId)?.name ??
    null;

  const phaseLabel: Record<ArNavPhase, string> = {
    initializing: 'Loading…',
    waiting_gps: 'Getting your location…',
    gps_unavailable: 'GPS unavailable',
    navigating: 'On route',
    off_route: 'Off route',
    recalculating: 'Updating route…',
    arrived: 'Arrived',
  };

  const showNavigation = routeReady && route != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">AR Navigation</h1>
          <p className="page-sub">{CAMPUS_LABEL} — follow the guide on camera.</p>
          {destLabel && (
            <p className="mt-1 text-sm text-ink-mute">
              To <span className="font-semibold text-ink">{destLabel}</span>
              {watching && gpsReady && (
                <span className="ml-2 text-accent">
                  · Live GPS
                  {pose?.accuracy != null ? ` ±${Math.round(pose.accuracy)} m` : ''}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-2 !py-2 text-sm"
            onClick={handleRefreshGps}
          >
            <LocateFixed size={16} />
            Refresh GPS
          </button>
          <span className="text-sm text-ink-mute">Guide doll</span>
          <div className="inline-flex border border-line bg-paper-raised">
            <button
              type="button"
              className={`px-3 py-2 text-sm font-semibold ${
                avatarGender === 'female' ? 'bg-accent text-white' : 'text-ink-mute'
              }`}
              onClick={() => setAvatarGender('female')}
            >
              Female
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm font-semibold ${
                avatarGender === 'male' ? 'bg-accent text-white' : 'text-ink-mute'
              }`}
              onClick={() => setAvatarGender('male')}
            >
              Male
            </button>
          </div>
        </div>
      </div>

      {(live.lastEmergency || avgCrowd != null) && (
        <div className="flex flex-wrap gap-2">
          {live.lastEmergency && (
            <div className="inline-flex items-center gap-2 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
              <AlertTriangle size={14} /> {live.lastEmergency}
            </div>
          )}
          {avgCrowd != null && (
            <div className="inline-flex items-center gap-2 border border-line bg-paper-raised px-3 py-2 text-sm">
              <Users size={14} className="text-accent" />
              Crowd {Math.round(avgCrowd * 100)}% · {live.connected ? 'live' : 'cached'}
            </div>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-md border border-line bg-ink-950">
        <video ref={videoRef} className="h-[min(78vh,720px)] w-full object-cover" playsInline muted />
        {!videoRef.current?.srcObject && cameraError && (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#2a353e,#12171c)]" />
        )}

        {!routeReady && navPhase !== 'arrived' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 px-6 text-center backdrop-blur-sm">
            <p className="font-display text-lg font-semibold text-white">
              📍 Getting your current location…
            </p>
            <p className="max-w-sm text-sm text-white/75">
              {initTimedOut
                ? 'GPS fix unavailable — use manual controls below or tap Refresh GPS.'
                : 'Allow location access and stand outdoors for best accuracy.'}
            </p>
            {loadingRoute && (
              <p className="text-xs text-white/60">Calculating route from your position…</p>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
          <div className="rounded-md border border-white/20 bg-ink/80 px-3 py-2 text-sm text-white backdrop-blur-sm">
            <p className="text-xs text-white/70">Distance remaining</p>
            <p className="font-display text-xl font-semibold">
              {navPhase === 'arrived' ? 0 : showNavigation ? formatDistance(remaining) : '—'}
            </p>
            {showNavigation && navPhase !== 'arrived' && (
              <p className="text-xs text-white/65">
                {navPhase === 'recalculating'
                  ? 'Updating route…'
                  : gpsReady
                    ? `Next turn ${formatDistance(distToNextMeters)}`
                    : phaseLabel[navPhase]}
              </p>
            )}
          </div>
          <div className="rounded-md border border-white/20 bg-ink/80 px-3 py-2 text-right text-sm text-white backdrop-blur-sm">
            <p className="inline-flex items-center justify-end gap-1 text-xs text-white/65">
              <MapPin size={12} /> {phaseLabel[navPhase]}
            </p>
            <p className="font-semibold">
              {showNavigation
                ? `Step ${Math.min(stepIndex + 1, route!.path.length)}/${route!.path.length}`
                : '—'}
            </p>
          </div>
        </div>

        {showNavigation && navPhase !== 'arrived' && gpsReady && (
          <div className="pointer-events-none absolute left-1/2 top-[22%] z-10 -translate-x-1/2">
            {compassHeading != null ? (
              <>
                <div className="ar-arrow flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-md">
                  <ArrowUp
                    size={32}
                    className="text-white transition-transform duration-200"
                    style={{ transform: `rotate(${arrowRotation}deg)` }}
                  />
                </div>
                {turnClass && turnClass !== 'straight' && (
                  <p className="mt-2 max-w-[10rem] text-center text-[10px] font-semibold text-white/90">
                    {turnClass.replace('-', ' ')}
                  </p>
                )}
              </>
            ) : (
              <p className="max-w-[10rem] rounded bg-ink/70 px-2 py-1 text-center text-[10px] text-white/70">
                Allow compass for turn arrow
              </p>
            )}
          </div>
        )}

        <GuideDollViewport
          gender={avatarGender}
          pose={
            navPhase === 'arrived'
              ? 'celebrate'
              : !routeReady
                ? 'idle'
                : poseAnim
          }
          pathYawDeg={compassHeading != null ? dollYawDeg : 0}
          className="pointer-events-none absolute bottom-36 left-1/2 z-10 h-72 w-52 -translate-x-1/2 sm:bottom-40 sm:h-[22rem] sm:w-64"
        />

        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-gradient-to-t from-ink/95 via-ink/85 to-ink/40 px-3 pb-3 pt-8 sm:px-4">
          {navPhase === 'arrived' ? (
            <div className="mx-auto max-w-lg rounded-md border border-accent/40 bg-accent px-4 py-3 text-center text-white animate-fade-up">
              <p className="inline-flex items-center justify-center gap-2 font-display text-lg font-semibold sm:text-xl">
                <CheckCircle2 size={20} /> You&apos;ve arrived
              </p>
              <p className="mt-1 text-sm sm:text-base">
                {selectedBuildingName
                  ? `You have arrived at ${selectedBuildingName}.`
                  : destLabel
                    ? `Welcome to ${destLabel}.`
                    : 'You have reached your destination.'}
              </p>
              {hasIndoorMap && (
                <button
                  type="button"
                  className="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-accent"
                  onClick={() => navigate('/navigate')}
                >
                  Choose indoor destination
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-lg rounded-md border border-white/15 bg-ink/70 px-3 py-2.5 text-center text-white backdrop-blur-sm sm:px-4 sm:py-3">
              {isWaving && (
                <p className="mb-1 text-xs font-semibold text-[#9fe0d8]">
                  Guide saying hello — follow her
                </p>
              )}
              <p className="inline-flex items-center justify-center gap-2 text-xs text-white/70">
                <Volume2 size={12} /> Next instruction
              </p>
              <p className="mt-1 font-display text-base font-semibold sm:text-lg">
                {!showNavigation
                  ? navPhase === 'waiting_gps' && !initTimedOut
                    ? '📍 Getting your current location…'
                    : phaseLabel[navPhase]
                  : step?.instruction ??
                    (navPhase === 'recalculating' ? 'Calculating route…' : phaseLabel[navPhase])}
              </p>
            </div>
          )}

          <div className="mt-3 flex justify-center gap-2">
            {navPhase !== 'arrived' ? (
              <>
                {!gpsReady && routeReady && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost !bg-paper-raised"
                      onClick={() => setManualStepIndex((i) => Math.max(0, i - 1))}
                    >
                      Back
                    </button>
                    <button type="button" className="btn-primary" onClick={handleManualNext}>
                      Next turn
                    </button>
                  </>
                )}
                {gpsReady && (
                  <p className="self-center text-xs text-white/60">
                    Following GPS · {formatDistance(distToNextMeters)} along route to next turn
                  </p>
                )}
                {!gpsReady && pose && !isReliableGpsFix(pose) && pose.accuracy != null && (
                  <p className="self-center text-xs text-accent-warn">
                    Low accuracy (±{Math.round(pose.accuracy)} m) — move outdoors
                  </p>
                )}
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={handleRestart}>
                Walk it again
              </button>
            )}
          </div>
        </div>
      </div>

      {(error || cameraError || gpsError || gpsNote) && (
        <p className="text-sm text-accent-warn">
          {error ?? gpsError ?? gpsNote ?? cameraError}
        </p>
      )}
    </div>
  );
}
