import { useCallback, useRef, useState } from 'react';
import type { FloorCorridor, FloorPoi, IndoorEdge, IndoorNode, LocalVec2, Room } from '@campusar/shared';
import {
  boundsFromRings,
  localVec3ToPlan,
  nodeKindColor,
  rectFromDrag,
  ringToSvgPoints,
  type IndoorTool,
} from './indoorLayoutUtils';
import { distance2D, formatMeasureDistance, segmentMidpoint2D } from './indoorArMeasure';

const GRID = 1;

function clientToLocal(svg: SVGSVGElement, clientX: number, clientY: number, fine = false): LocalVec2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(svg.getScreenCTM()?.inverse());
  const step = fine ? 0.1 : GRID;
  return { x: Math.round(local.x / step) * step, y: Math.round(local.y / step) * step };
}

type Props = {
  tool: IndoorTool;
  rooms: Room[];
  corridors: FloorCorridor[];
  pois: FloorPoi[];
  nodes?: IndoorNode[];
  edges?: IndoorEdge[];
  connectFromId?: string | null;
  roomLinks?: Record<string, string | null>;
  selectedId: string | null;
  selectedKind: 'room' | 'corridor' | 'poi' | 'node' | 'edge' | null;
  draftRect: LocalVec2[] | null;
  measurePoints?: LocalVec2[];
  onDraftRect: (ring: LocalVec2[] | null) => void;
  onMeasurePoint?: (point: LocalVec2) => void;
  onSelect: (kind: 'room' | 'corridor' | 'poi' | 'node' | 'edge', id: string) => void;
  onClearSelect: () => void;
  onPoiPlace: (point: LocalVec2) => void;
  onGraphPoint?: (point: LocalVec2) => void;
  onNodeDragEnd?: (nodeId: string, point: LocalVec2) => void;
};

export function FloorCanvas({
  tool,
  rooms,
  corridors,
  pois,
  nodes = [],
  edges = [],
  connectFromId,
  roomLinks = {},
  selectedId,
  selectedKind,
  draftRect,
  measurePoints = [],
  onDraftRect,
  onMeasurePoint,
  onSelect,
  onClearSelect,
  onPoiPlace,
  onGraphPoint,
  onNodeDragEnd,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<LocalVec2 | null>(null);
  const nodeDragId = useRef<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(28);
  const panning = useRef(false);
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const nodePoints = new Map(nodes.map((n) => [n.id, localVec3ToPlan({ x: n.localX, y: n.localY, z: n.localZ })]));

  const rings = [
    ...rooms.map((r) => r.localGeometry ?? []),
    ...corridors.map((c) => c.localGeometry),
    ...(draftRect ? [draftRect] : []),
  ].filter((r) => r.length >= 3);
  const bounds = boundsFromRings(rings);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const isGraphTool = ['node', 'connect', 'entrance', 'stairs', 'elevator', 'room_entrance', 'handoff'].includes(tool);

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
    const pt = clientToLocal(svg, e.clientX, e.clientY, tool === 'measure');
    if (tool === 'measure') {
      onMeasurePoint?.(pt);
      return;
    }
    if (tool === 'select') {
      const target = (e.target as SVGElement).dataset;
      if (target.nodeId) {
        nodeDragId.current = target.nodeId;
        return;
      }
      onClearSelect();
      return;
    }
    if (tool === 'poi') {
      onPoiPlace(pt);
      return;
    }
    if (isGraphTool && onGraphPoint) {
      onGraphPoint(pt);
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
    if (nodeDragId.current && tool === 'select') return;
    if (!dragStart.current || (tool !== 'room' && tool !== 'corridor')) return;
    const pt = clientToLocal(svg, e.clientX, e.clientY);
    const rect = rectFromDrag(dragStart.current, pt);
    if (rect.length) onDraftRect(rect);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (nodeDragId.current && svg && onNodeDragEnd) {
      const pt = clientToLocal(svg, e.clientX, e.clientY);
      onNodeDragEnd(nodeDragId.current, pt);
      nodeDragId.current = null;
    }
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
                stroke={roomLinks[r.id] ? '#7c3aed' : '#1d4ed8'}
                strokeWidth={roomLinks[r.id] ? 0.12 : 0.08}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tool === 'select' || tool === 'room_entrance' || tool === 'handoff') onSelect('room', r.id);
                }}
              />
              <text x={r.localGeometry[0].x + 0.3} y={r.localGeometry[0].y + 0.8} fontSize={0.6} fill="#1e3a8a">
                {r.name}
              </text>
            </g>
          ) : null,
        )}

        {edges.map((edge) => {
          const from = nodePoints.get(edge.fromNodeId);
          const to = nodePoints.get(edge.toNodeId);
          if (!from || !to) return null;
          const selected = selectedKind === 'edge' && selectedId === edge.id;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={selected ? '#dc2626' : edge.kind === 'elevator' ? '#0891b2' : '#475569'}
              strokeWidth={selected ? 0.14 : 0.1}
              strokeDasharray={edge.kind === 'stairs' ? '0.2 0.15' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (tool === 'select') onSelect('edge', edge.id);
              }}
            />
          );
        })}

        {nodes.map((n) => {
          const pt = localVec3ToPlan({ x: n.localX, y: n.localY, z: n.localZ });
          const colors = nodeKindColor(n.kind);
          const selected = selectedKind === 'node' && selectedId === n.id;
          const pending = connectFromId === n.id;
          return (
            <g key={n.id}>
              <circle
                data-node-id={n.id}
                cx={pt.x}
                cy={pt.y}
                r={selected || pending ? 0.45 : 0.32}
                fill={colors.fill}
                stroke={pending ? '#dc2626' : colors.stroke}
                strokeWidth={selected || pending ? 0.1 : 0.06}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tool === 'select' || tool === 'connect' || tool === 'handoff') onSelect('node', n.id);
                }}
              />
              {n.name ? (
                <text x={pt.x + 0.4} y={pt.y + 0.15} fontSize={0.45} fill={colors.stroke}>
                  {n.name}
                </text>
              ) : null}
            </g>
          );
        })}

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

        {measurePoints.length > 0 && (
          <g>
            {measurePoints.length > 1 &&
              measurePoints.slice(1).map((p, i) => {
                const a = measurePoints[i];
                const mid = segmentMidpoint2D(a, p);
                const dist = distance2D(a, p);
                return (
                  <g key={`seg-${i}`}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={p.x}
                      y2={p.y}
                      stroke="#10b981"
                      strokeWidth={0.12}
                    />
                    <text x={mid.x} y={mid.y - 0.25} fontSize={0.45} fill="#047857" textAnchor="middle">
                      {formatMeasureDistance(dist)}
                    </text>
                  </g>
                );
              })}
            {measurePoints.map((p, i) => (
              <circle key={`mp-${i}`} cx={p.x} cy={p.y} r={0.25} fill="#10b981" stroke="#065f46" strokeWidth={0.06} />
            ))}
          </g>
        )}
      </svg>
      <p className="absolute bottom-2 left-2 text-xs text-muted">
        {tool === 'measure'
          ? 'Measure — tap corners; distances shown like AR-Measure'
          : 'Local meters — Alt+drag to pan, wheel to zoom'}
      </p>
    </div>
  );
}
