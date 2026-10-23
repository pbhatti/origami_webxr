import { describe, expect, it } from 'vitest';
import {
  arrowAdjustedAngle,
  grabAdjustedAngle,
  hingeAngleDeg,
  landmarkAfterFold,
  magneticAssist,
} from '../../src/origami/CreaseSolver.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';

const half = PAPER_SIZE_M / 2;

describe('crease solver', () => {
  it('maps on-plane x from the right edge to 0° and the left edge to 180°', () => {
    expect(hingeAngleDeg([half, 0, 0], half)).toBeCloseTo(0);
    expect(hingeAngleDeg([0, 0, 0], half)).toBeCloseTo(90);
    expect(hingeAngleDeg([-half, 0, 0], half)).toBeCloseTo(180);
  });

  it('maps a horizontal crease so the bottom edge is 0° and the top is 180°', () => {
    const hinge = {
      id: 'h',
      p0: [-half, 0, 0] as [number, number, number],
      p1: [0, 0, 0] as [number, number, number],
      fixedFaces: [],
      movingFaces: [],
    };
    expect(hingeAngleDeg([-0.05, -half, 0], half, hinge)).toBeCloseTo(0);
    expect(hingeAngleDeg([-0.05, half, 0], half, hinge)).toBeCloseTo(180);
  });

  it('treats a fold away from the user as the wrong direction', () => {
    expect(hingeAngleDeg([half / 2, 0, -0.04], half)).toBe(0);
  });

  it('clamps NaN poses to 0 instead of exploding the mesh', () => {
    expect(hingeAngleDeg([Number.NaN, 0, 0], half)).toBe(0);
  });

  it('reports the delta from the grab pose so a pinch does not jump', () => {
    expect(grabAdjustedAngle([-half, 0, 0], [half, 0, 0], 0, 0, 180, half)).toBeCloseTo(180);
    expect(grabAdjustedAngle([0, 0, 0], [half, 0, 0], 0, 0, 180, half)).toBeCloseTo(90);
    expect(grabAdjustedAngle([-half, 0, 0], [half / 2, 0, 0], 0, 0, 180, half)).toBeCloseTo(180);
  });

  it('magnetically assists after 50% completion without auto-completing in one frame', () => {
    const assisted = magneticAssist(165, 180);
    expect(assisted).toBeGreaterThan(165);
    expect(assisted).toBeLessThan(180);
    expect(magneticAssist(90, 180)).toBeGreaterThan(90);
    expect(magneticAssist(40, 180)).toBe(40);
  });

  it('lets a left-side packet reach 180° when the grab hint orients the hinge', () => {
    const hinge = {
      id: 'square-right',
      p0: [0, 0, 0] as [number, number, number],
      p1: [0, half, 0] as [number, number, number],
      fixedFaces: [],
      movingFaces: [],
    };
    const grab: [number, number, number] = [-0.05, 0.05, 0];
    expect(grabAdjustedAngle(grab, grab, 0, 0, 180, half, hinge)).toBeCloseTo(0);
    expect(grabAdjustedAngle([0.05, 0.05, 0], grab, 0, 0, 180, half, hinge)).toBeCloseTo(180);
  });

  it('lets a small flap complete a flip by dragging across the packet', () => {
    const hinge = {
      id: 'flip-x',
      p0: [-half, 0.05, 0] as [number, number, number],
      p1: [0, 0.05, 0] as [number, number, number],
      fixedFaces: [],
      movingFaces: [],
    };
    const grab: [number, number, number] = [-0.05, 0.02, 0];
    expect(grabAdjustedAngle([-0.05, 0.08, 0], grab, 0, 0, 180, half, hinge)).toBeCloseTo(180);
  });

  it('maps a squash drag along the fold arrow to 180°', () => {
    const grab: [number, number, number] = [-0.03, 0.05, 0];
    const arrow: [number, number, number][] = [
      [-0.03, 0.05, 0.002],
      [-0.11, 0.05, 0.002],
    ];
    expect(arrowAdjustedAngle(grab, grab, arrow, 0, 0, 180)).toBeCloseTo(0);
    expect(arrowAdjustedAngle([-0.11, 0.05, 0], grab, arrow, 0, 0, 180)).toBeCloseTo(180);
  });

  it('rotates the right-front corner onto the left edge at 180°', () => {
    const folded = landmarkAfterFold([half, -half, 0], 180);
    expect(folded[0]).toBeCloseTo(-half);
    expect(folded[1]).toBeCloseTo(-half);
    expect(folded[2]).toBeCloseTo(0);
  });
});
