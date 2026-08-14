import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WALK_VISUAL_YAW_OFFSET_RAD,
  dollEffectiveYawRad,
  dollSteeringYawRad,
  poseFromRouteContext,
} from './GuideDoll';

describe('dollSteeringYawRad', () => {
  it('faces camera for greet and arrival poses', () => {
    expect(dollSteeringYawRad('waveRight', 45)).toBe(0);
    expect(dollSteeringYawRad('celebrate', -30)).toBe(0);
    expect(dollSteeringYawRad('idle', 0)).toBe(0);
  });

  it('steers from relative path bearing while walking', () => {
    expect(dollSteeringYawRad('walk', 0)).toBeCloseTo(0, 5);
    expect(dollSteeringYawRad('walk', 85)).toBeCloseTo(-THREE.MathUtils.degToRad(85), 5);
    expect(dollSteeringYawRad('walk', -85)).toBeCloseTo(THREE.MathUtils.degToRad(85), 5);
  });
});

describe('dollEffectiveYawRad', () => {
  it('adds π rad walk offset so the doll leads away from the camera', () => {
    expect(dollEffectiveYawRad('walk', 0)).toBeCloseTo(WALK_VISUAL_YAW_OFFSET_RAD, 5);
    expect(dollEffectiveYawRad('walk', 85)).toBeCloseTo(
      WALK_VISUAL_YAW_OFFSET_RAD - THREE.MathUtils.degToRad(85),
      5,
    );
  });

  it('keeps greet poses facing the user without walk offset', () => {
    expect(dollEffectiveYawRad('waveLeft', 0)).toBe(0);
    expect(dollEffectiveYawRad('celebrate', 0)).toBe(0);
  });
});

describe('poseFromRouteContext', () => {
  it('preserves walk/idle/arrival selection independent of doll yaw', () => {
    expect(poseFromRouteContext({ arrived: true, isMoving: true })).toBe('celebrate');
    expect(poseFromRouteContext({ arrived: false, atRouteStart: true, isMoving: true })).toBe(
      'waveRight',
    );
    expect(poseFromRouteContext({ arrived: false, isMoving: false })).toBe('idle');
    expect(poseFromRouteContext({ arrived: false, isMoving: true })).toBe('walk');
  });
});
