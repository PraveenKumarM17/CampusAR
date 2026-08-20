import { useCallback, useRef, useState } from 'react';
import type { FloorCorridor, FloorPoi, LocalVec2, Room } from '@campusar/shared';
import {
  boundsFromRings,
  rectFromDrag,
  ringToSvgPoints,
  type IndoorTool,
} from './indoorLayoutUtils';

const GRID = 1;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function clientToLocal(svg: SVGSVGElement, clientX: number, clientY: number): LocalVec2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(svg.getScreenCTM()?.inverse());
  return { x: snap(local.x), y: snap(local.y) };
}

type Props = {
  tool: IndoorTool;
  rooms: Room[];
  corridors: FloorCorridor[];
  pois: FloorPoi[];
  selectedId: string | null;
  selectedKind: 'room' | 'corridor' | 'poi' | null;
  draftRect: LocalVec2[] | null;
  onDraftRect: (ring: LocalVec2[] | null) => void;
  onSelect: (kind: 'room' | 'corridor' | 'poi', id: string) => void;
  onClearSelect: () => void;
  onPoiPlace: (point: LocalVec2) => void;
};

export function FloorCanvas({
  tool,
  rooms,
  corridors,
  pois,
  selectedId,
  selectedKind,
  draftRect,
  onDraftRect,
  onSelect,
  onClearSelect,
  onPoiPlace,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<LocalVec2 | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(28);
  const panning = useRef(false);
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const rings = [
    ...rooms.map((r) => r.localGeometry ?? []),
    ...corridors.map((c) => c.localGeometry),
    ...(draftRect ? [draftRect] : []),
  ].filter((r) => r.length >= 3);
  const bounds = boundsFromRings(rings);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(80, Math.max(8, s - e.deltaY * 0.05)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning.current = true;
      panOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (tool === 'select') {
      onClearSelect();
      return;
    }
    const pt = clientToLocal(svg, e.clientX, e.clientY);
    if (tool === 'poi') {
      onPoiPlace(pt);
      return;
    }
    dragStart.current = pt;
    onDraftRect([pt, pt, pt, pt]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (panning.current) {
      setPan({
        x: panOrigin.current.panX + (e.clientX - panOrigin.current.x),
        y: panOrigin.current.panY + (e.clientY - panOrigin.current.y),
      });
      return;
    }
    if (!dragStart.current || (tool !== 'room' && tool !== 'corridor')) return;
    const pt = clientToLocal(svg, e.clientX, e.clientY);
    const rect = rectFromDrag(dragStart.current, pt);
    if (rect.length) onDraftRect(rect);
  };

  const onPointerUp = () => {
    panning.current = false;
    dragStart.current = null;
  };

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg border border-line bg-paper">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button type="button" className="btn-secondary text-xs" onClick={() => setScale((s) => s + 4)}>
          Zoom +
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => setScale((s) => Math.max(8, s - 4))}
        >
          Zoom −
        </button>
      </div>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        viewBox={`${bounds.minX} ${bounds.minY} ${width || 20} ${height || 20}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale / 28})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e5e7eb" strokeWidth="0.05" />
          </pattern>
        </defs>
        <rect x={bounds.minX} y={bounds.minY} width={width || 20} height={height || 20} fill="url(#grid)" />

        {corridors.map((c) => (
          <polygon
            key={c.id}
            points={ringToSvgPoints(c.localGeometry)}
            fill={selectedKind === 'corridor' && selectedId === c.id ? '#94a3b8' : '#cbd5e1'}
            fillOpacity={0.55}
            stroke="#64748b"
            strokeWidth={0.08}
            onClick={(e) => {
              e.stopPropagation();
              if (tool === 'select') onSelect('corridor', c.id);
            }}
          />
        ))}

        {rooms.map((r) =>
          r.localGeometry?.length ? (
            <g key={r.id}>
              <polygon
                points={ringToSvgPoints(r.localGeometry)}
                fill={selectedKind === 'room' && selectedId === r.id ? '#60a5fa' : '#3b82f6'}
                fillOpacity={0.35}
                stroke="#1d4ed8"
                strokeWidth={0.08}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tool === 'select') onSelect('room', r.id);
                }}
              />
              <text x={r.localGeometry[0].x + 0.3} y={r.localGeometry[0].y + 0.8} fontSize={0.6} fill="#1e3a8a">
                {r.name}
              </text>
            </g>
          ) : null,
        )}

        {pois.map((p) => (
          <g
            key={p.id}
            onClick={(e) => {
              e.stopPropagation();
              if (tool === 'select') onSelect('poi', p.id);
            }}
          >
            <circle
              cx={p.localX}
              cy={p.localY}
              r={0.35}
              fill={selectedKind === 'poi' && selectedId === p.id ? '#fb923c' : '#f97316'}
              stroke="#c2410c"
              strokeWidth={0.06}
            />
            <text x={p.localX + 0.5} y={p.localY + 0.2} fontSize={0.5} fill="#9a3412">
              {p.name}
            </text>
          </g>
        ))}

        {draftRect && draftRect.length >= 3 ? (
          <polygon
            points={ringToSvgPoints(draftRect)}
            fill={tool === 'corridor' ? '#cbd5e1' : '#93c5fd'}
            fillOpacity={0.4}
            stroke="#2563eb"
            strokeWidth={0.1}
            strokeDasharray="0.3 0.2"
          />
        ) : null}
      </svg>
      <p className="absolute bottom-2 left-2 text-xs text-muted">
        Local meters — Alt+drag to pan, wheel to zoom
      </p>
    </div>
  );
}
