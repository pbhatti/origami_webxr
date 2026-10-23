import { afterEach, describe, expect, it } from 'vitest';
import {
  applyFoldAssist,
  CREASE_GUIDE,
  foldProgress,
  magneticPullStrength,
  passedAutoSnap,
  resetFoldGuideConfig,
} from '../../src/origami/foldAssist.ts';
import { dashedRibbonGeometry, pointOnPolyline } from '../../src/ui/creaseRibbon.ts';

afterEach(() => {
  resetFoldGuideConfig();
});

describe('fold assist', () => {
  it('normalizes progress from start to target, including reverse and negative folds', () => {
    expect(foldProgress(0, 180, 90)).toBeCloseTo(0.5);
    expect(foldProgress(0, 180, 104.4)).toBeCloseTo(0.58);
    expect(foldProgress(180, 0, 75.6)).toBeCloseTo(0.58);
    expect(foldProgress(0, -90, -52.2)).toBeCloseTo(0.58);
    expect(foldProgress(-20, -100, -68)).toBeCloseTo(0.6);
  });

  it('starts magnetic pull after 50% and auto-snap after 58%', () => {
    expect(magneticPullStrength(0.4)).toBe(0);
    expect(magneticPullStrength(0.5)).toBeGreaterThan(0);
    expect(magneticPullStrength(0.58)).toBe(1);
    expect(passedAutoSnap(0.5)).toBe(false);
    expect(passedAutoSnap(0.58)).toBe(true);
    const nudged = applyFoldAssist(90, 180, 0.5, 16);
    expect(nudged).toBeGreaterThan(90);
    expect(nudged).toBeLessThan(100);
  });
});

describe('crease ribbons', () => {
  it('builds a dashed ribbon along the crease with charcoal contrast geometry', () => {
    const geometry = dashedRibbonGeometry(
      [
        [0, -0.1, 0],
        [0, 0.1, 0],
      ],
      CREASE_GUIDE.widthM,
      CREASE_GUIDE.dashM,
      CREASE_GUIDE.gapM,
    );
    const positions = geometry.getAttribute('position');
    expect(positions?.count ?? 0).toBeGreaterThan(12);
    expect(CREASE_GUIDE.color).toBe('#55351f');
    expect(CREASE_GUIDE.widthM).toBeGreaterThanOrEqual(0.0025);
    expect(CREASE_GUIDE.widthM).toBeLessThanOrEqual(0.0035);
  });

  it('samples the arrow path so the head can travel 8–12% along it', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [0, 0.05, 0.02],
      [0, 0.1, 0],
    ];
    const rest = pointOnPolyline(path, 0.9);
    const tip = pointOnPolyline(path, 1);
    expect(rest.position.distanceTo(tip.position)).toBeGreaterThan(0.005);
    expect(rest.tangent.length()).toBeGreaterThan(0.5);
  });
});
