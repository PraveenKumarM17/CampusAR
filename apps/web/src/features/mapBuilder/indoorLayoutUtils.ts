import type { LocalVec2 } from '@campusar/shared';

export type IndoorTool = 'select' | 'room' | 'corridor' | 'poi';

export type UnsavedChoice = 'save' | 'discard' | 'stay';

export function cloneRing(ring: LocalVec2[]): LocalVec2[] {
  return ring.map((p) => ({ x: p.x, y: p.y }));
}

export function ringsEqual(a: LocalVec2[], b: LocalVec2[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

export function rectFromDrag(a: LocalVec2, b: LocalVec2): LocalVec2[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (Math.abs(maxX - minX) < 0.5 || Math.abs(maxY - minY) < 0.5) return [];
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function ringCentroid(ring: LocalVec2[]): LocalVec2 {
  if (ring.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p.x;
    y += p.y;
  }
  return { x: x / ring.length, y: y / ring.length };
}

export function boundsFromRings(rings: LocalVec2[][]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = 0;
  let minY = 0;
  let maxX = 20;
  let maxY = 20;
  const pts = rings.flat();
  if (pts.length === 0) return { minX, minY, maxX, maxY };
  minX = Math.min(...pts.map((p) => p.x));
  minY = Math.min(...pts.map((p) => p.y));
  maxX = Math.max(...pts.map((p) => p.x));
  maxY = Math.max(...pts.map((p) => p.y));
  const pad = 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function ringToSvgPoints(ring: LocalVec2[]): string {
  return ring.map((p) => `${p.x},${p.y}`).join(' ');
}

export interface LayoutEditSession {
  kind: 'room' | 'corridor';
  id: string;
  originalGeometry: LocalVec2[];
  draftGeometry: LocalVec2[];
  expectedUpdatedAt?: string;
}
