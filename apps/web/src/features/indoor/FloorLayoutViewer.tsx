import { useEffect, useMemo, useState } from 'react';
import type {
  Floor,
  FloorCorridor,
  FloorPoi,
  IndoorRouteResponse,
  LocalVec2,
  Room,
} from '@campusar/shared';
import { FLOOR_PLAN_COORDINATE_SYSTEM } from '@campusar/shared';
import { api } from '../../lib/api';
import { ringToSvgPoints } from '../mapBuilder/indoorLayoutUtils';

type LayoutData = {
  buildingId: string;
  floors: Floor[];
  rooms: Room[];
  corridors: FloorCorridor[];
  pois: FloorPoi[];
};

export function FloorLayoutViewer({
  buildingId,
  token,
  route,
}: {
  buildingId: string;
  token?: string | null;
  route?: IndoorRouteResponse | null;
}) {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .indoorLayout(buildingId, floorId ?? undefined, token)
      .then((data) => {
        if (cancelled) return;
        setLayout(data);
        if (!floorId && data.floors.length > 0) setFloorId(data.floors[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load floor layout');
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId, floorId, token]);

  const rooms = useMemo(
    () => (layout?.rooms ?? []).filter((r) => r.floorId === floorId && r.localGeometry?.length),
    [layout, floorId],
  );
  const corridors = useMemo(
    () => (layout?.corridors ?? []).filter((c) => c.floorId === floorId),
    [layout, floorId],
  );
  const pois = useMemo(
    () => (layout?.pois ?? []).filter((p) => p.floorId === floorId),
    [layout, floorId],
  );
  const routePoints = useMemo(
    () =>
      (route?.nodes ?? [])
        .filter((node) => node.floorId === floorId)
        .map((node) => ({ x: node.localX, y: node.localY })),
    [route, floorId],
  );

  const rings: LocalVec2[][] = [
    ...rooms.map((r) => r.localGeometry!),
    ...corridors.map((c) => c.localGeometry),
  ];
  const pts = rings.flat();
  const minX = pts.length ? Math.min(...pts.map((p) => p.x)) - 1 : 0;
  const minY = pts.length ? Math.min(...pts.map((p) => p.y)) - 1 : 0;
  const maxX = pts.length ? Math.max(...pts.map((p) => p.x)) + 1 : 20;
  const maxY = pts.length ? Math.max(...pts.map((p) => p.y)) + 1 : 20;

  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!layout) return <p className="text-sm text-muted">Loading floor plan…</p>;

  if (layout.floors.length === 0 || (rooms.length === 0 && corridors.length === 0 && pois.length === 0)) {
    return (
      <p className="rounded-md border border-line bg-paper-raised px-3 py-4 text-sm text-muted">
        No indoor floor plan has been authored for this building yet. An administrator can create floors and
        rooms in Map Builder.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-ink" htmlFor="floor-layout-select">
          Floor
        </label>
        <select
          id="floor-layout-select"
          className="input text-sm"
          value={floorId ?? ''}
          onChange={(e) => setFloorId(e.target.value)}
        >
          {layout.floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.level}: {f.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">{FLOOR_PLAN_COORDINATE_SYSTEM}</span>
      </div>
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="h-64 w-full rounded-lg border border-line bg-paper"
      >
        {corridors.map((c) => (
          <polygon
            key={c.id}
            points={ringToSvgPoints(c.localGeometry)}
            fill="#e2e8f0"
            stroke="#64748b"
            strokeWidth={0.08}
          />
        ))}
        {rooms.map((r) => (
          <g key={r.id}>
            <polygon
              points={ringToSvgPoints(r.localGeometry!)}
              fill="#bfdbfe"
              stroke="#1d4ed8"
              strokeWidth={0.08}
            />
            <text x={r.localGeometry![0].x + 0.2} y={r.localGeometry![0].y + 0.6} fontSize={0.5} fill="#1e3a8a">
              {r.name}
            </text>
          </g>
        ))}
        {pois.map((p) => (
          <circle key={p.id} cx={p.localX} cy={p.localY} r={0.3} fill="#f97316" />
        ))}
        {routePoints.length > 1 && (
          <polyline
            points={ringToSvgPoints(routePoints)}
            fill="none"
            stroke="#0f6b63"
            strokeWidth={0.22}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="0.45 0.2"
          />
        )}
        {routePoints.map((point, index) => (
          <circle
            key={`route-${point.x}-${point.y}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === routePoints.length - 1 ? 0.32 : 0.18}
            fill={index === routePoints.length - 1 ? '#c47a12' : '#0f6b63'}
            stroke="#ffffff"
            strokeWidth={0.06}
          />
        ))}
      </svg>
    </div>
  );
}
