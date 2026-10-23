import { describe, expect, it } from 'vitest';
import {
  PoseSmoothingFilter,
  poseToSmoothed,
  resetPlaneLock,
  saveFloorPlane,
  slerpQuat,
  type AnchorMeasurePoint,
} from './arMeasureAnchors';

function mockPose(x: number, y: number, z: number): XRPose {
  const pos = { x, y, z, w: 1 };
  const ori = { x: 0, y: 0, z: 0, w: 1 };
  return {
    transform: {
      position: pos as DOMPointReadOnly,
      orientation: ori as DOMPointReadOnly,
      matrix: new Float32Array(16),
      inverse: {
        position: pos as DOMPointReadOnly,
        orientation: ori as DOMPointReadOnly,
        matrix: new Float32Array(16),
        inverse: {} as XRRigidTransform,
      },
    },
  } as XRPose;
}

describe('arMeasureAnchors', () => {
  it('PoseSmoothingFilter returns first pose unchanged', () => {
    const filter = new PoseSmoothingFilter(0.85);
    const pose = mockPose(1, 0, 2);
    const out = filter.update(pose);
    expect(out.position).toEqual({ x: 1, y: 0, z: 2 });
  });

  it('PoseSmoothingFilter smooths subsequent poses toward target', () => {
    const filter = new PoseSmoothingFilter(0.85);
    filter.update(mockPose(0, 0, 0));
    const out = filter.update(mockPose(1, 0, 0));
    expect(out.position.x).toBeGreaterThan(0);
    expect(out.position.x).toBeLessThan(1);
  });

  it('slerpQuat returns endpoints at t=0 and t=1', () => {
    const a = { x: 0, y: 0, z: 0, w: 1 };
    const b = { x: 0, y: 0.707, z: 0, w: 0.707 };
    expect(slerpQuat(a, b, 0).w).toBeCloseTo(1, 3);
    const end = slerpQuat(a, b, 1);
    expect(end.y).toBeCloseTo(b.y, 2);
  });

  it('saveFloorPlane converts anchor positions relative to origin', () => {
    resetPlaneLock();
    const points: AnchorMeasurePoint[] = [
      {
        id: 'a',
        xrAnchor: null,
        worldPose: null,
        smoothedPose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        sessionLocal: { x: 0, y: 0, z: 0 },
        sourceData: {
          planeId: 'p1',
          timestamp: 1,
          gps: null,
          confidence: 0.9,
          hitFallback: true,
        },
        smoothing: new PoseSmoothingFilter(),
        fallbackWorld: null,
      },
      {
        id: 'b',
        xrAnchor: null,
        worldPose: null,
        smoothedPose: { position: { x: 3, y: 0, z: 4 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        sessionLocal: { x: 3, y: 0, z: 4 },
        sourceData: {
          planeId: 'p1',
          timestamp: 2,
          gps: null,
          confidence: 0.9,
          hitFallback: true,
        },
        smoothing: new PoseSmoothingFilter(),
        fallbackWorld: null,
      },
    ];

    const saved = saveFloorPlane(points);
    expect(saved?.planPoints[1]).toEqual({ x: 3, y: 4 });
    expect(saved?.metadata.averageConfidence).toBeCloseTo(0.9);
  });

  it('poseToSmoothed extracts position from XRPose', () => {
    expect(poseToSmoothed(mockPose(2, 0, 5)).position).toEqual({ x: 2, y: 0, z: 5 });
  });
});
