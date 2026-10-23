import { describe, expect, it } from 'vitest';
import {
  axesToPinchDistance,
  CONTROLLER_PINCH_CLOSED_M,
  CONTROLLER_PINCH_OPEN_M,
  poseToVec3,
} from '../../src/input/HandTrackingAdapter.ts';

describe('HandTrackingAdapter helpers', () => {
  it('maps trigger/squeeze onto pinch distances that cross the hysteresis band', () => {
    expect(axesToPinchDistance(0, 0)).toBeCloseTo(CONTROLLER_PINCH_OPEN_M);
    expect(axesToPinchDistance(1, 0)).toBeCloseTo(CONTROLLER_PINCH_CLOSED_M);
    expect(axesToPinchDistance(0.9, 0)).toBeLessThan(0.025);
    expect(axesToPinchDistance(0.2, 0)).toBeGreaterThan(0.04);
  });

  it('drops non-finite poses instead of propagating NaN', () => {
    expect(poseToVec3(undefined)).toBeNull();
    expect(
      poseToVec3({
        transform: { position: { x: Number.NaN, y: 0, z: 0 } },
      } as XRPose),
    ).toBeNull();
    expect(
      poseToVec3({
        transform: { position: { x: 0.1, y: 1.2, z: -0.4 } },
      } as XRPose),
    ).toEqual([0.1, 1.2, -0.4]);
  });
});
