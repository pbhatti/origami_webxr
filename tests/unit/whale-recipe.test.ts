import { describe, expect, it, vi } from 'vitest';
import { classifyGrab } from '../../src/input/GrabRegionMath.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { deformFoldMesh } from '../../src/origami/FoldPaper.ts';
import { grabAdjustedAngle, landmarkAfterHinge } from '../../src/origami/CreaseSolver.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { interpolatesMesh } from '../../src/origami/types.ts';
import { WHALE_NAMED, WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import type { FoldStep, Vec3 } from '../../src/origami/types.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

describe('origami whale recipe', () => {
  it('is a valid 6-stage recipe with two stage-2 sub-folds', () => {
    expect(WHALE_RECIPE.id).toBe('origami-whale');
    expect(validateRecipe(WHALE_RECIPE)).toEqual([]);
    expect(WHALE_RECIPE.steps.map((step) => step.id)).toEqual([
      'diag-fold',
      'unfold-diag',
      'kite-upper',
      'kite-lower',
      'body-center',
      'head-in',
      'tail-up',
      'complete-whale',
    ]);
    const progress = progressFromRecipe(WHALE_RECIPE);
    expect(progress.totalSteps).toBe(6);
    expect(progress.committedCount).toBe(0);
    expect(progressLabelish(progress)).toBe('0/6');
  });

  it('does not advance the stage-2 tracker until both kite folds commit', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 6, activeIndex: 1 });

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(1);
    expect(engine.currentStep?.id).toBe('kite-upper');

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(1);
    expect(engine.currentStep?.id).toBe('kite-lower');

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 2, totalSteps: 6, activeIndex: 2 });
  });

  it('keeps interpolation snapshot vertex counts aligned', () => {
    for (const step of WHALE_RECIPE.steps) {
      if (!interpolatesMesh(step)) {
        continue;
      }
      const from = WHALE_RECIPE.snapshots[step.fromSnapshotId];
      const to = WHALE_RECIPE.snapshots[step.toSnapshotId];
      expect(from?.vertices.length, step.id).toBe(to?.vertices.length);
    }
  });

  it('completes the first diamond fold from a bottom-to-top drag', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    engine.beginGrab([0, -0.1, 0]);
    engine.updateFold([0, 0.1, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 6, activeIndex: 1 });
    expect(engine.currentStep?.id).toBe('unfold-diag');
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['horizontal']);
  });

  it('rolls back an early stage-1 release without advancing the tracker', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    engine.beginGrab([0, -0.12, 0]);
    engine.updateFold([0, -0.04, 0]);
    expect(engine.release().ok).toBe(false);
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(0);
    expect(engine.currentStep?.id).toBe('diag-fold');
    expect(engine.angle).toBeCloseTo(0);
  });

  it('rotates the bottom corner onto the top corner about the horizontal crease', () => {
    const step = WHALE_RECIPE.steps[0]!;
    const folded = landmarkAfterHinge(WHALE_NAMED.B, step.hinge, 180, 'valley');
    expect(folded[0]).toBeCloseTo(WHALE_NAMED.T[0], 5);
    expect(folded[1]).toBeCloseTo(WHALE_NAMED.T[1], 5);
    expect(folded[2]).toBeCloseTo(WHALE_NAMED.T[2], 5);

    const from = WHALE_RECIPE.snapshots.diamond!;
    const to = WHALE_RECIPE.snapshots.triangle!;
    const live = deformFoldMesh(step, from, to, 180);
    const b = live[3]!;
    expect(b[0]).toBeCloseTo(WHALE_NAMED.T[0], 5);
    expect(b[1]).toBeCloseTo(WHALE_NAMED.T[1], 5);
  });

  it('authors a diamond, a horizontal crease, and a two-layer triangle target', () => {
    const step = WHALE_RECIPE.steps[0]!;
    const diamond = WHALE_RECIPE.snapshots.diamond!;
    const triangle = WHALE_RECIPE.snapshots.triangle!;
    expect(diamond.outline).toHaveLength(4);
    expect(triangle.outline).toHaveLength(3);
    expect(step.meshStrategy).toBe('hinge');
    expect(step.creaseLineLocal[0]?.[1]).toBeCloseTo(0);
    expect(step.creaseLineLocal[1]?.[1]).toBeCloseTo(0);
    expect(step.hinge.p0).toEqual(WHALE_NAMED.L);
    expect(step.hinge.p1).toEqual(WHALE_NAMED.RIGHT);
    expect(triangle.named?.B?.[1]).toBeCloseTo(WHALE_NAMED.T[1], 5);
    expect(triangle.faces.some((face) => face.layer >= 1)).toBe(true);
  });

  it('maps a bottom-to-top pinch on the diamond hinge to 180°', () => {
    const hinge = WHALE_RECIPE.steps[0]!.hinge;
    const grab = WHALE_NAMED.B;
    expect(grabAdjustedAngle(grab, grab, 0, 0, 180, PAPER_SIZE_M / 2, hinge)).toBeCloseTo(0);
    expect(grabAdjustedAngle(WHALE_NAMED.T, grab, 0, 0, 180, PAPER_SIZE_M / 2, hinge)).toBeCloseTo(180);
  });

  it('grabs only the lower diamond half for stage 1', () => {
    const step = WHALE_RECIPE.steps[0]!;
    expect(
      classifyGrab([0, -0.08, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('moving');
    expect(
      classifyGrab([0, 0.08, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('hold');
  });

  it('walks every action with assist, matches silhouette, and allows swim', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    WHALE_RECIPE.steps.forEach(() => {
      expect(engine.isComplete()).toBe(false);
      engine.assistToTarget();
      drain(engine, 400);
    });
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(6);
    expect(engine.canStartCreature()).toBe(true);
  });

  it('early-snaps every whale fold and sub-fold from ~58% angular progress', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    for (const step of WHALE_RECIPE.steps) {
      expect(engine.currentStep?.id).toBe(step.id);
      const committed = engine.progress().committedCount;
      driveToAutoSnap(engine, step);
      expect(engine.enginePhase, step.id).toBe('snapping');
      expect(engine.progress().committedCount, `${step.id} before snap`).toBe(committed);
      drain(engine, 400);
    }
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(6);
  });
});

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function driveToAutoSnap(engine: OrigamiEngine, step: FoldStep): void {
  const grab = step.arrowPathLocal[0];
  const end = step.arrowPathLocal.at(-1);
  if (!grab || !end) {
    throw new Error(`${step.id} is missing an arrow path`);
  }
  engine.beginGrab(grab);
  if (step.actionType === 'crease-press') {
    for (let i = 0; i < 40; i += 1) {
      engine.updateFold(grab, false, 16);
      if (`${engine.enginePhase}` === 'snapping') {
        return;
      }
    }
    return;
  }
  for (let t = 0.2; t <= 1.001; t += 0.04) {
    const local = mix(grab, end, t);
    engine.updateFold(local, false, 16);
    if (`${engine.enginePhase}` === 'snapping') {
      return;
    }
    if (engine.foldCompletion >= 0.58) {
      for (let i = 0; i < 10; i += 1) {
        engine.updateFold(local, false, 16);
        if (`${engine.enginePhase}` === 'snapping') {
          return;
        }
      }
    }
  }
}

function progressLabelish(model: { committedCount: number; totalSteps: number }): string {
  return `${model.committedCount}/${model.totalSteps}`;
}
