import { describe, expect, it } from 'vitest';
import { clamp, distance3, easeOutCubic, finiteOr, lerp } from '../../src/utils/math.ts';

describe('math helpers', () => {
  it('clamps inclusive bounds', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  it('keeps easeOutCubic finite and in 0..1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(Number.isFinite(easeOutCubic(2))).toBe(true);
  });

  it('rejects NaN coordinates in finiteOr', () => {
    expect(finiteOr(Number.NaN, 0)).toBe(0);
    expect(finiteOr(1.5)).toBe(1.5);
  });

  it('measures landmark distance', () => {
    expect(distance3([0, 0, 0], [0.03, 0, 0.04])).toBeCloseTo(0.05);
    expect(lerp(0, 180, 0.5)).toBe(90);
  });
});
