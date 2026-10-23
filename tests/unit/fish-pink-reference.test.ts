import { describe, expect, it, vi } from 'vitest';
import { classifyGrab } from '../../src/input/GrabRegionMath.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { deformFoldMesh } from '../../src/origami/FoldPaper.ts';
import { DEFAULT_CREASE_PRESS_HOLD_MS, validateFold } from '../../src/origami/FoldValidator.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import {
  PINK_NAMED,
  PINK_RECIPE,
} from '../../src/origami/recipes/fish-pink-reference.recipe.ts';
import { interpolatesMesh } from '../../src/origami/types.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function walkTo(engine: OrigamiEngine, stepId: string): void {
  while (engine.currentStep && engine.currentStep.id !== stepId) {
    engine.assistToTarget();
    drain(engine, 400);
  }
}

describe('pink-paper fish candidate', () => {
  it('is a valid 8-action recipe separate from seda-fish', () => {
    expect(PINK_RECIPE.id).toBe('fish-pink-reference');
    expect(validateRecipe(PINK_RECIPE)).toEqual([]);
    expect(PINK_RECIPE.steps.map((step) => step.id)).toEqual([
      'diag-ac',
      'unfold-ac',
      'diag-bd',
      'unfold-bd',
      'book-horizontal',
      'triangle-collapse',
      'tail-flaps',
      'flatten-body',
    ]);
    expect(PINK_RECIPE.steps.map((step) => step.actionType)).toEqual([
      'fold',
      'unfold',
      'fold',
      'unfold',
      'fold',
      'collapse',
      'flap-fold',
      'crease-press',
    ]);
  });

  it('keeps interpolation snapshot vertex counts aligned', () => {
    for (const step of PINK_RECIPE.steps) {
      if (!interpolatesMesh(step)) {
        continue;
      }
      const from = PINK_RECIPE.snapshots[step.fromSnapshotId];
      const to = PINK_RECIPE.snapshots[step.toSnapshotId];
      expect(from?.vertices.length, step.id).toBe(to?.vertices.length);
    }
  });

  it('preserves locked diagonal creases across unfolds', () => {
    const engine = new OrigamiEngine(PINK_RECIPE, PINK_NAMED);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['ac']);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.currentStep?.id).toBe('diag-bd');
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['ac']);
    engine.assistToTarget();
    drain(engine, 400);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['ac', 'bd']);
    expect(engine.fromSnapshot?.outline).toEqual([
      PINK_NAMED.A,
      PINK_NAMED.B,
      PINK_NAMED.C,
      PINK_NAMED.D,
    ]);
  });

  it('collapses the rectangle toward a triangle at 0/25/50/75/100%', () => {
    const step = PINK_RECIPE.steps.find((item) => item.id === 'triangle-collapse')!;
    const from = PINK_RECIPE.snapshots[step.fromSnapshotId]!;
    const to = PINK_RECIPE.snapshots[step.toSnapshotId]!;
    const mb = PINK_NAMED.MB;
    const startA = from.vertices[0] ?? [0, 0, 0];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const verts = deformFoldMesh(step, from, to, t * 180);
      expect(verts.length).toBe(from.vertices.length);
      for (const vertex of verts) {
        expect(vertex.every(Number.isFinite)).toBe(true);
      }
      const a = verts[0]!;
      const dist = Math.hypot(a[0] - mb[0], a[1] - mb[1], a[2] - mb[2]);
      const startDist = Math.hypot(startA[0] - mb[0], startA[1] - mb[1], startA[2] - mb[2]);
      expect(dist).toBeCloseTo((1 - t) * startDist, 5);
    }
    expect(step.coupledHinges).toHaveLength(2);
  });

  it('lets only the highlighted tail flap be grabbed', () => {
    const step = PINK_RECIPE.steps.find((item) => item.id === 'tail-flaps')!;
    const left = classifyGrab(
      [-0.03, -0.02, 0],
      PAPER_SIZE_M,
      step.movingRegion,
      step.optionalHoldRegion,
    );
    const right = classifyGrab(
      [0.03, -0.02, 0],
      PAPER_SIZE_M,
      step.movingRegion,
      step.optionalHoldRegion,
    );
    expect(left).toBe('moving');
    expect(right).toBe('hold');
  });

  it('rejects crease-press hover and accepts pinch-and-hold', () => {
    const step = PINK_RECIPE.steps.find((item) => item.id === 'flatten-body')!;
    expect(validateFold(step, 0, { MR: PINK_NAMED.MR }, { holdMs: 0 }).ok).toBe(false);
    expect(validateFold(step, 0, { MR: PINK_NAMED.MR }, { holdMs: 80 }).ok).toBe(false);

    const engine = new OrigamiEngine(PINK_RECIPE, PINK_NAMED);
    walkTo(engine, 'flatten-body');
    engine.beginGrab([0, -0.04, 0]);
    engine.updateFold([0, -0.04, 0], false, 16);
    expect(engine.release().ok).toBe(false);
    drain(engine, 400);

    engine.beginGrab([0, -0.04, 0]);
    for (let elapsed = 0; elapsed <= DEFAULT_CREASE_PRESS_HOLD_MS + 32; elapsed += 16) {
      engine.updateFold([0, -0.04, 0], false, 16);
    }
    expect(engine.release().ok).toBe(true);
  });

  it('walks every action with assist, matches silhouette, and allows swim', () => {
    const engine = new OrigamiEngine(PINK_RECIPE, PINK_NAMED);
    PINK_RECIPE.steps.forEach((_, index) => {
      expect(engine.isComplete()).toBe(false);
      engine.assistToTarget();
      drain(engine, 400);
      expect(engine.progress().committedCount).toBe(index + 1);
    });
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(8);
    expect(engine.progress().totalSteps).not.toBe(12);
    expect(engine.canStartCreature()).toBe(true);
    expect(engine.silhouetteOk).toBe(true);
  });
});
