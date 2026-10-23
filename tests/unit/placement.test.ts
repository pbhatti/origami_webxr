import { describe, expect, it } from 'vitest';
import {
  MIN_UI_SEPARATION_M,
  MOVE_HANDLE_HIT_RADIUS_M,
  PAPER_SIZE_M,
  SPAWN_OFFSET_LOCAL,
  MOVE_HANDLE_OFFSET_LOCAL,
  TOOLBAR_OFFSET_LOCAL,
  TRACKER_OFFSET_LOCAL,
  isComfortableReach,
  offsetInViewerSpace,
  spawnDistanceM,
  uiClearanceFromPaper,
} from '../../src/origami/placement.ts';

describe('paper placement', () => {
  it('spawns inside the comfortable reach band and below eye height', () => {
    const distance = spawnDistanceM();
    expect(isComfortableReach(distance)).toBe(true);
    expect(-SPAWN_OFFSET_LOCAL[1]).toBeGreaterThanOrEqual(0.1);
    expect(-SPAWN_OFFSET_LOCAL[1]).toBeLessThanOrEqual(0.2);
  });

  it('places the sheet in front of the viewer, not head-locked to origin', () => {
    const pos = offsetInViewerSpace([0, 1.6, 0], [0, 0, -1], [0, 1, 0]);
    expect(pos[0]).toBeCloseTo(0);
    expect(pos[1]).toBeCloseTo(1.45);
    expect(pos[2]).toBeCloseTo(-0.65);
  });

  it('keeps tracker and toolbar clear of the paper face', () => {
    expect(uiClearanceFromPaper(TRACKER_OFFSET_LOCAL)).toBeGreaterThanOrEqual(MIN_UI_SEPARATION_M);
    expect(uiClearanceFromPaper(TOOLBAR_OFFSET_LOCAL)).toBeGreaterThanOrEqual(MIN_UI_SEPARATION_M);
    expect(uiClearanceFromPaper(MOVE_HANDLE_OFFSET_LOCAL)).toBeGreaterThanOrEqual(MIN_UI_SEPARATION_M);
  });

  it('keeps the Move tab below the diamond tip so it cannot steal the stage-1 pinch', () => {
    const diamondTipY = (PAPER_SIZE_M / 2) * Math.SQRT2;
    const gap = Math.abs(MOVE_HANDLE_OFFSET_LOCAL[1]) - diamondTipY;
    expect(gap).toBeGreaterThan(MOVE_HANDLE_HIT_RADIUS_M);
  });

  it('applies viewer yaw so spawn follows facing, then stays at that world point', () => {
    const lookingLeft = offsetInViewerSpace([0, 1.6, 0], [-1, 0, 0], [0, 1, 0]);
    expect(lookingLeft[0]).toBeCloseTo(-0.65);
    expect(lookingLeft[2]).toBeCloseTo(0);
  });
});
