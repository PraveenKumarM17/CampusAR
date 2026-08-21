import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, QrCode, Search } from 'lucide-react';
import type { IndoorBuildingContext, IndoorPlace, IndoorRouteResponse } from '@campusar/shared';
import { ApiError } from '../../lib/api';
import { useCampusApi } from '../../hooks/useCampusApi';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import {
  parseIndoorParams,
  placeBelongsToBuilding,
} from '../../lib/buildingNavigation';
import { FloorLayoutViewer } from './FloorLayoutViewer';
import { IndoorQrScanner } from '../../components/indoor/IndoorQrScanner';
export function IndoorPage() {
  const token = useAuthStore((s) => s.accessToken);
  const campusApi = useCampusApi();
  const { accessibility } = usePrefsStore();
  const {
    selectedBuildingId,
    selectedBuildingName,
    indoorDestinationPlaceId,
    indoorDestinationName,
    indoorDestinationDetail,
    startIndoorNavigation,
    cancelIndoorScan,
    completeIndoorNavigation,
    setIndoorDestination,
  } = useNavStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlIds = useMemo(() => parseIndoorParams(searchParams.toString()), [searchParams]);

  const [qr, setQr] = useState('');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<IndoorPlace[]>([]);
  const [selected, setSelected] = useState<IndoorPlace | null>(null);
  const [route, setRoute] = useState<IndoorRouteResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<IndoorBuildingContext | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const buildingId = urlIds.building ?? selectedBuildingId;
  const destinationId = urlIds.destination ?? indoorDestinationPlaceId;
  const buildingName = context?.building.name ?? selectedBuildingName;
  const guided = Boolean(buildingId && destinationId);

  const current = useMemo(() => route?.nodes[0] ?? null, [route]);
  const next = useMemo(() => route?.nodes[1] ?? null, [route]);

  useEffect(() => {
    if (!buildingId) {
      setContext(null);
      setRestoreError(null);
      return;
    }
    let cancelled = false;
    campusApi
      .indoorBuildingContext(buildingId, token)
      .then((ctx) => {
        if (cancelled) return;
        if (!ctx.indoorMap) {
          setRestoreError(`${ctx.building.name} does not have an indoor map for this preview.`);
          setContext(ctx);
          return;
        }
        setContext(ctx);
        setRestoreError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContext(null);
        setRestoreError(
          err instanceof Error
            ? err.message
            : 'That building is no longer available. Return to search to choose another destination.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId, token, campusApi]);

  useEffect(() => {
    if (!destinationId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    campusApi
      .indoorPlace(destinationId, buildingId ?? undefined, token)
      .then((place) => {
        if (cancelled) return;
        if (buildingId && !placeBelongsToBuilding(place, buildingId)) {
          setRestoreError('That indoor destination is not inside the selected building.');
          setSelected(null);
          return;
        }
        setSelected(place);
        if (!indoorDestinationPlaceId) {
          setIndoorDestination(place.id, place.name, null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSelected(null);
        const gone =
          err instanceof ApiError && (err.status === 404 || err.code === 'NOT_FOUND');
        setRestoreError(
          gone
            ? 'That indoor destination was deleted or unpublished. Return to search to choose another place.'
            : err instanceof Error
              ? err.message
              : 'Could not restore the indoor destination.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [destinationId, buildingId, token, indoorDestinationPlaceId, setIndoorDestination, campusApi]);

  async function resolveQr(e: FormEvent) {
    e.preventDefault();
    await localizeAtAnchor(qr.trim());
  }

  async function localizeAtAnchor(code: string) {
    if (!code) return;
    setError(null);
    setRoute(null);
    try {
      const normalized = code.toUpperCase();
      setQr(normalized);
      const res = await campusApi.indoorResolveAnchor(normalized, token, buildingId ?? undefined);
      setStatus(`Localized at ${res.node.name ?? res.anchor.anchorCode} (${res.map.name}).`);
      if (guided && destinationId) {
        await startIndoor(destinationId, normalized);
      }
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Marker not found');
    }
  } catch (err) {
    setStatus(null);
    setError(
      err instanceof Error ? err.message : 'Marker not found',
    );
  }
}

async function resolveQr(e: FormEvent) {
  e.preventDefault();
  await resolveQrCode(qr);
}

  async function searchPlaces(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await campusApi.indoorSearchPlaces(query.trim(), buildingId ?? undefined, token);
      setPlaces(res);
      if (res.length === 0) setError('No indoor places match that search.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }

  async function startIndoor(
  placeId: string,
  sourceQr = qr,
) {
  setBusy(true);
  setError(null);

  try {
    const res = await campusApi.indoorRoute(
      {
        sourceAnchorCode: sourceQr.trim(),
        destinationPlaceId: placeId,
        expectedBuildingId: buildingId ?? undefined,
        preferences: {
          avoidStairs: accessibility.avoidStairs,
          preferElevator: accessibility.preferLift,
          wheelchairAccessible: accessibility.wheelchairMode,
        },
      },
      token,
    );
      setRoute(res);
      startIndoorNavigation();
      setStatus(`Indoor route ready · ${Math.round(res.totalDistanceM)} m`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Indoor routing failed');
    } finally {
      setBusy(false);
    }
  }

  function handleCancelScan() {
    cancelIndoorScan();
    navigate('/navigate');
  }

  function handleFinish() {
    completeIndoorNavigation();
    navigate('/map');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Indoor navigation</h1>
        <p className="page-sub">
          {buildingName
            ? `You are navigating inside ${buildingName}`
            : 'Scan a CampusAR QR marker to relocalize. Indoor routes use the mapped graph, not GPS.'}
        </p>
      </div>

      {buildingId && !restoreError && (
        <div className="panel rounded-md p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Floor plan</h2>
          <FloorLayoutViewer buildingId={buildingId} token={token} route={route} />
        </div>
      )}

      {restoreError && (
        <div className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 text-sm">
          <p className="text-accent-danger">{restoreError}</p>
          <button type="button" className="mt-2 text-sm font-semibold underline" onClick={() => navigate('/navigate')}>
            Return to search
          </button>
        </div>
      )}

      {guided && !restoreError && (
        <div className="panel rounded-md p-4">
          <p className="font-semibold">{indoorDestinationName ?? selected?.name ?? 'Indoor destination'}</p>
          {indoorDestinationDetail && <p className="text-sm text-ink-mute">{indoorDestinationDetail}</p>}
          <p className="mt-2 text-sm">Scan the nearest CampusAR marker</p>
        </div>
      )}

      <form className="panel space-y-3 rounded-md p-4" onSubmit={(e) => void resolveQr(e)}>
  <label className="label" htmlFor="indoor-qr">
    Indoor QR / marker code
  </label>

  <p className="text-sm text-ink-mute">
    Scan the CampusAR marker
  </p>

  <IndoorQrScanner
    onScan={(decodedText) => {
      void resolveQrCode(decodedText);
    }}
    onError={(message) => {
      setError(message);
    }}
  />
  <div className="flex gap-2">
          <input
            id="indoor-qr"
            className="input"
            value={qr}
            onChange={(e) => setQr(e.target.value.toUpperCase())}
            placeholder="IT-BLOCK-GF-ENTRANCE-01"
          />
          <button className="btn-primary shrink-0" type="submit">
            <QrCode size={16} /> Localize
          </button>
        </div>
        <button
          className="btn-ghost w-full"
          type="button"
          onClick={() => setScannerOpen(true)}
        >
          <Camera size={16} /> Scan marker with camera
        </button>
        {guided && (
          <button className="btn-ghost w-full" type="button" onClick={handleCancelScan}>
            Cancel
          </button>
        )}
      </form>

      {!guided && (
        <form className="panel space-y-3 rounded-md p-4" onSubmit={(e) => void searchPlaces(e)}>
          <label className="label" htmlFor="indoor-q">
            Search indoor place
          </label>
          <div className="flex gap-2">
            <input
              id="indoor-q"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Room 308, Teacher X, cubicle…"
            />
            <button className="btn-ghost shrink-0" type="submit">
              <Search size={16} /> Search
            </button>
          </div>
          {places.length > 0 && (
            <ul className="divide-y divide-line">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`w-full px-2 py-2 text-left text-sm ${selected?.id === p.id ? 'bg-accent/10 font-semibold' : ''}`}
                    onClick={() => setSelected(p)}
                  >
                    {p.name}
                    <span className="ml-2 text-xs text-ink-faint">{p.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn-primary"
            type="button"
            disabled={!qr.trim() || !selected || busy}
            onClick={() => selected && void startIndoor(selected.id)}
          >
            Start indoor route
          </button>
        </form>
      )}

      {status && <p className="text-sm text-accent">{status}</p>}
      {error && <p className="text-sm text-accent-danger">{error}</p>}

      {route && (
        <>
          <IndoorArNavigator
            route={route}
            destinationName={selected?.name ?? indoorDestinationName ?? 'Indoor destination'}
            onFinish={handleFinish}
          />
          <div className="panel space-y-3 rounded-md p-4">
            <p className="font-semibold">
              {current?.instruction ?? 'Walk'}
              {next ? ` · next ${next.distanceM.toFixed(1)} m` : ''}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {route.instructions.map((step, i) => (
                <li key={`${i}-${step}`}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-ink-faint">
              {Math.round(route.totalDistanceM)} m · ~{route.estimatedTimeMinutes.toFixed(1)} min ·
              anchor-localized indoor waypoints
            </p>
          </div>
        </>
      )}
      {scannerOpen && (
        <IndoorQrScanner
          onClose={() => setScannerOpen(false)}
          onScan={(value) => {
            setScannerOpen(false);
            void localizeAtAnchor(value);
          }}
        />
      )}
    </div>
  );
}
