import {describe, expect, it} from '@jest/globals';
import {distanceMeters, totalPathLengthM} from './measurementMath';

describe('measurementMath', () => {
  it('computes 3D distance', () => {
    expect(
      distanceMeters(
        {id: 'a', x: 0, y: 0, z: 0},
        {id: 'b', x: 3, y: 0, z: 4},
      ),
    ).toBeCloseTo(5, 5);
  });

  it('sums segment lengths', () => {
    const points = [
      {id: '1', x: 0, y: 0, z: 0},
      {id: '2', x: 1, y: 0, z: 0},
      {id: '3', x: 1, y: 0, z: 2},
    ];
    expect(totalPathLengthM(points)).toBeCloseTo(3, 5);
  });
});
