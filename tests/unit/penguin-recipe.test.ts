import { describe, expect, it } from 'vitest';
import { PenguinCreature } from '../../src/animation/PenguinCreature.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import {
  PENGUIN_BACK_COLOR,
  PENGUIN_BEAK_FRAC,
  PENGUIN_BOTTOM_CREASE_FRAC,
  PENGUIN_EDGE_COLOR,
  PENGUIN_EYE_COLOR,
  PENGUIN_NAMED,
  PENGUIN_PAPER_COLOR,
  PENGUIN_R,
  PENGUIN_RECIPE,
  PENGUIN_STEPS,
} from '../../src/origami/recipes/penguin.recipe.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  for (let frame = 0; frame < 50; frame += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function named(snapshot: MeshSnapshot, key: string): Vec3 {
  const point = snapshot.named?.[key];
  expect(point, key).toBeTruthy();
  return point!;
}

function contains(poly: Vec3[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index, index += 1) {
    const current = poly[index];
    const prior = poly[previous];
    if (!current || !prior) {
      continue;
    }
    const crosses =
      current[1] > y !== prior[1] > y &&
      x < ((prior[0] - current[0]) * (y - current[1])) / (prior[1] - current[1] + 1e-12) + current[0];
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function topFaceAt(snapshot: MeshSnapshot, x: number, y: number): { tone: 'front' | 'back'; materialId: string } | null {
  let best = -1;
  let found: { tone: 'front' | 'back'; materialId: string } | null = null;
  for (const face of snapshot.faces) {
    const poly = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [point] : [];
    });
    if (poly.length < 3 || !contains(poly, x, y) || face.layer < best) {
      continue;
    }
    const a = poly[0]!;
    const b = poly[1]!;
    const c = poly[2]!;
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    best = face.layer;
    found = { tone: nz >= 0 ? 'front' : 'back', materialId: face.materialId };
  }
  return found;
}

describe('origami penguin recipe', () => {
  it('is a valid eight-stage blue penguin', () => {
    expect(validateRecipe(PENGUIN_RECIPE)).toEqual([]);
    expect(progressFromRecipe(PENGUIN_RECIPE).totalSteps).toBe(8);
    expect(PENGUIN_STEPS).toEqual([
      'center-creases',
      'bottom-corner',
      'lower-body',
      'sides-inward',
      'side-flaps',
      'wings',
      'beak',
      'penguin-decoration',
    ]);
    const titles = [...new Set(PENGUIN_RECIPE.steps.map((step) => step.title))];
    expect(titles).toEqual([
      'Create center creases',
      'Fold the bottom corner',
      'Shape the lower body',
      'Fold both sides inward',
      'Open the side flaps',
      'Shape the wings',
      'Shape the beak',
      'Bring it to life',
    ]);
    expect(PENGUIN_PAPER_COLOR).toBe('#27B9EA');
    expect(origamiPaperMaterial(PENGUIN_PAPER_COLOR).backColor).toBe(PENGUIN_BACK_COLOR.toLowerCase());
    expect(PENGUIN_EDGE_COLOR).toBe('#1688B5');
    expect(PENGUIN_EYE_COLOR).toBe('#171717');
    expect(PENGUIN_NAMED.L?.[0] ?? 0).toBeLessThan(0);
    expect(PENGUIN_NAMED.T?.[1] ?? 0).toBeCloseTo(PENGUIN_R);
  });

  it('keeps both center creases on step 1 and places the bottom crease below center', () => {
    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.currentStep?.progressStage).toBe(1);
    expect(engine.currentStep?.lockCreaseIds).toEqual(['penguin-vertical']);
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('penguin-horizontal-fold');
    expect(engine.currentStep?.progressStage).toBe(1);
    expect(engine.currentStep?.lockCreaseIds).toEqual(['penguin-horizontal']);
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('penguin-bottom');
    expect(engine.currentStep?.progressStage).toBe(2);
    const bottom = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-bottom');
    expect(bottom?.hinge.p0[1]).toBeCloseTo(PENGUIN_BOTTOM_CREASE_FRAC * PENGUIN_R);
    expect(bottom?.hinge.p0[1]).toBeLessThan(-0.15 * PENGUIN_R);
    expect(bottom?.hinge.p0[1]).toBe(bottom?.hinge.p1[1]);
    expect(bottom?.hinge.p0[1]).not.toBe(0);
  });

  it('folds only the nested tip in step 3', () => {
    const diamond = PENGUIN_RECIPE.snapshots.diamond!;
    const lowered = PENGUIN_RECIPE.snapshots.lowered!;
    for (const key of ['T', 'L', 'RIGHT'] as const) {
      expect(named(lowered, key)[0]).toBeCloseTo(named(diamond, key)[0], 5);
      expect(named(lowered, key)[1]).toBeCloseTo(named(diamond, key)[1], 5);
    }
    const upper = topFaceAt(lowered, 0, PENGUIN_R * 0.75);
    expect(upper?.tone).toBe('front');
    expect(upper?.materialId).toBe('front');
    const lower = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-lower');
    expect(lower?.progressStage).toBe(3);
    expect(lower?.hinge.minMovingLayer).toBeGreaterThan(0);
    expect(PENGUIN_RECIPE.steps.some((step) => step.id === 'penguin-center-tip')).toBe(false);
  });

  it('goes from the lower body straight into the side folds', () => {
    expect(PENGUIN_RECIPE.steps.some((step) => step.id === 'penguin-center-tip' || step.meshStrategy === 'turn')).toBe(false);
    const lower = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-lower');
    const left = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-left');
    const right = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-right');
    expect(lower?.toSnapshotId).toBe('turned');
    expect(left?.fromSnapshotId).toBe('turned');
    expect(right?.fromSnapshotId).toBe('turned');
    expect(left?.progressStage).toBe(4);
    expect(right?.progressStage).toBe(4);
    expect(left?.parallelGroup).toBe('penguin-sides');
    expect(right?.parallelGroup).toBe('penguin-sides');
    expect(topFaceAt(PENGUIN_RECIPE.snapshots.turned!, 0, PENGUIN_R * 0.8)?.tone).toBe('back');

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 12 && engine.currentStep?.id !== 'penguin-side-left'; guard += 1) {
      expect(engine.currentStep?.id).not.toBe('penguin-center-tip');
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('penguin-side-left');
    expect(engine.progress().activeIndex).toBe(3);
    expect(engine.isStepCommitted('penguin-lower')).toBe(true);
    commitCurrent(engine);
    expect(engine.currentStep?.progressStage).toBe(4);
    expect(engine.currentStep?.id).not.toBe('penguin-flap-left');
    expect(engine.isStepCommitted('penguin-side-left')).toBe(true);
    expect(engine.isStepCommitted('penguin-side-right')).toBe(false);
  });

  it('shapes the beak from the small top flap and shows eyes only at the last step', () => {
    const beak = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-beak');
    expect(beak?.progressStage).toBe(7);
    expect(beak?.hinge.p0[1]).toBeCloseTo(PENGUIN_BEAK_FRAC * PENGUIN_R);
    expect(beak?.hinge.p0[1]).toBeGreaterThan(0.7 * PENGUIN_R);
    expect(Math.abs(beak?.hinge.p0[0] ?? 1)).toBeLessThan(0.05);
    const winged = PENGUIN_RECIPE.snapshots.winged!;
    const beaked = PENGUIN_RECIPE.snapshots.beaked!;
    expect(named(beaked, 'T')[1]).toBeLessThan(named(winged, 'T')[1] - 0.03);
    expect(named(beaked, 'T')[1]).toBeGreaterThan(0.4 * PENGUIN_R);
    const decor = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-decorate');
    expect(decor?.progressStage).toBe(8);
    expect(decor?.actionType).toBe('crease-press');
    expect(PENGUIN_RECIPE.steps.filter((step) => step.progressStage === 8)).toHaveLength(1);
    expect(PENGUIN_RECIPE.steps.every((step) => step.progressStage !== 8 || step.id === 'penguin-decorate')).toBe(true);

    const creature = new PenguinCreature();
    expect(creature.active).toBe(false);
    creature.setReveal(0);
    creature.present(creature.group, true);
    expect(creature.group.getObjectByName('penguin-features')?.visible).toBe(false);
    creature.setReveal(1);
    expect(creature.group.getObjectByName('penguin-eyes')).toBeTruthy();
    expect(creature.group.getObjectByName('penguin-features')?.visible).toBe(true);
  });

  it('shows the white belly as the paper back and clears the turn on restart', () => {
    const finished = PENGUIN_RECIPE.snapshots.penguin!;
    const belly = topFaceAt(finished, 0, 0.05);
    expect(belly?.tone).toBe('back');
    expect(belly?.materialId).toBe('front');
    expect(finished.faces.every((face) => face.materialId === 'front')).toBe(true);

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 12 && !engine.currentStep?.id.startsWith('penguin-side'); guard += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id.startsWith('penguin-side')).toBe(true);
    engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.currentStep?.fromSnapshotId).toBe('diamond');
    expect(PENGUIN_NAMED.L?.[0] ?? 0).toBeLessThan(0);
  });
});
