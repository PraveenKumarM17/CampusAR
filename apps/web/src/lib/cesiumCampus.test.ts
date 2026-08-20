import { describe, expect, it } from 'vitest';
import {
  buildCrowdByEdge,
  campusCameraTarget,
  crowdColor,
} from './cesiumCampus';

describe('cesiumCampus', () => {
  it('maps crowd intensity to path colors', () => {
    expect(crowdColor(0.1)).toBe('#0f6b63');
    expect(crowdColor(0.5)).toBe('#c47a12');
    expect(crowdColor(0.9)).toBe('#b42318');
  });

  it('merges live crowd with edge defaults', () => {
    const map = buildCrowdByEdge(
      [{ id: '1', edgeId: 'e1', nodeId: null, intensity: 0.8, label: null, updatedAt: '' }],
      [
        {
          id: 'e1',
          fromNodeId: 'a',
          toNodeId: 'b',
          distanceM: 10,
          kind: 'walkway',
          bidirectional: true,
          blocked: false,
          safetyScore: 1,
          crowdScore: 0.2,
          accessibilityScore: 1,
        },
        {
          id: 'e2',
          fromNodeId: 'b',
          toNodeId: 'c',
          distanceM: 10,
          kind: 'walkway',
          bidirectional: true,
          blocked: false,
          safetyScore: 1,
          crowdScore: 0.4,
          accessibilityScore: 1,
        },
      ],
    );
    expect(map.get('e1')).toBe(0.8);
    expect(map.get('e2')).toBe(0.4);
  });

  it('centers camera on campus data', () => {
    const target = campusCameraTarget(
      [{ id: 'b1', name: 'A', code: 'A', description: null, latitude: 12.901, longitude: 77.518, floorsCount: 4 }],
      [],
    );
    expect(target.latitude).toBeCloseTo(12.901, 3);
    expect(target.longitude).toBeCloseTo(77.518, 3);
    expect(target.heightM).toBeGreaterThan(0);
  });
});
