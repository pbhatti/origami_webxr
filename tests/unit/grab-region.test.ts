import { describe, expect, it } from 'vitest';
import {
  PHASE2_HOLD_REGION,
  PHASE2_MOVING_REGION,
  classifyGrab,
  classifyGrabMany,
  paperLocalToUv,
  pointInPolygon,
  sampleHitsRegion,
} from '../../src/input/GrabRegionMath.ts';
import { intersectLocalZ0 } from '../../src/input/rayPaper.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';

describe('grab regions', () => {
  it('maps paper local coordinates into 0..1 UV', () => {
    expect(paperLocalToUv([0.1, 0.1, 0], PAPER_SIZE_M)).toEqual([1, 1]);
    expect(paperLocalToUv([-0.1, -0.1, 0], PAPER_SIZE_M)).toEqual([0, 0]);
    expect(paperLocalToUv([0, 0, 0], PAPER_SIZE_M)).toEqual([0.5, 0.5]);
  });

  it('treats the right half as the moving grab region', () => {
    expect(sampleHitsRegion([0.06, 0, 0], PHASE2_MOVING_REGION, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([-0.06, 0, 0], PHASE2_MOVING_REGION, PAPER_SIZE_M)).toBe(false);
    expect(classifyGrab([0.06, 0, 0], PAPER_SIZE_M)).toBe('moving');
    expect(classifyGrab([-0.06, 0, 0], PAPER_SIZE_M)).toBe('hold');
  });

  it('rejects samples that are too far from the sheet along the normal', () => {
    expect(sampleHitsRegion([0.06, 0, 0.04], PHASE2_MOVING_REGION, PAPER_SIZE_M)).toBe(false);
    expect(classifyGrab([0.06, 0, 0.04], PAPER_SIZE_M)).toBe('none');
  });

  it('rejects non-finite samples and prefers moving on the centerline', () => {
    expect(sampleHitsRegion([Number.NaN, 0, 0], PHASE2_MOVING_REGION, PAPER_SIZE_M)).toBe(false);
    expect(classifyGrab([0, 0, 0], PAPER_SIZE_M)).toBe('moving');
    expect(pointInPolygon([0.2, 0.5], PHASE2_HOLD_REGION.polygonUV)).toBe(true);
  });

  it('treats any listed moving region as a valid pinch target', () => {
    const left = {
      ...PHASE2_HOLD_REGION,
      id: 'moving-left',
      polygonUV: PHASE2_HOLD_REGION.polygonUV,
    };
    expect(classifyGrabMany([0.06, 0, 0], PAPER_SIZE_M, [left, PHASE2_MOVING_REGION], PHASE2_HOLD_REGION)).toBe(
      'moving',
    );
    expect(classifyGrabMany([-0.06, 0, 0], PAPER_SIZE_M, [left, PHASE2_MOVING_REGION], PHASE2_HOLD_REGION)).toBe(
      'moving',
    );
  });

  it('intersects a controller ray with the paper plane in local space', () => {
    const hit = intersectLocalZ0([0.06, 0, 0.2], [0, 0, -1]);
    expect(hit?.[0]).toBeCloseTo(0.06);
    expect(hit?.[2]).toBe(0);
    expect(intersectLocalZ0([0.4, 0, 0.2], [0, 0, -1])).toBeNull();
  });
});
