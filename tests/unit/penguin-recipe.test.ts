import { describe, expect, it } from 'vitest';
import { PenguinCreature } from '../../src/animation/PenguinCreature.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { turnSnapshot } from '../../src/origami/FoldPaper.ts';
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
  it('is a valid nine-stage blue penguin', () => {
    expect(validateRecipe(PENGUIN_RECIPE)).toEqual([]);
    expect(progressFromRecipe(PENGUIN_RECIPE).totalSteps).toBe(9);
    expect(PENGUIN_STEPS).toEqual([
      'center-creases',
      'bottom-corner',
      'lower-body',
      'center-tip',
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
      'Fold the center tip',
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

  it('folds only the nested tip in steps 3 and 4', () => {
    const diamond = PENGUIN_RECIPE.snapshots.diamond!;
    const lowered = PENGUIN_RECIPE.snapshots.lowered!;
    const tipped = PENGUIN_RECIPE.snapshots.tipped!;
    for (const key of ['T', 'L', 'RIGHT'] as const) {
      expect(named(lowered, key)[0]).toBeCloseTo(named(diamond, key)[0], 5);
      expect(named(lowered, key)[1]).toBeCloseTo(named(diamond, key)[1], 5);
      expect(named(tipped, key)[0]).toBeCloseTo(named(diamond, key)[0], 5);
      expect(named(tipped, key)[1]).toBeCloseTo(named(diamond, key)[1], 5);
    }
    const upper = topFaceAt(tipped, 0, PENGUIN_R * 0.75);
    expect(upper?.tone).toBe('front');
    expect(upper?.materialId).toBe('front');
    const tipBefore = lowered.vertices.reduce((min, point) => Math.min(min, point[1]), 0);
    const nested = tipped.vertices.filter((point) => Math.abs(point[0]) < 0.02 && point[1] < 0.02 && point[1] > -0.03);
    expect(nested.length).toBeGreaterThan(0);
    expect(Math.min(...nested.map((point) => point[1]))).toBeLessThan(tipBefore + 0.02);
    const lower = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-lower');
    const center = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-center-tip');
    expect(lower?.hinge.minMovingLayer).toBeGreaterThan(0);
    expect(center?.hinge.minMovingLayer).toBeGreaterThan(lower?.hinge.maxMovingLayer ?? 0);
  });

  it('turns the sheet over before either side fold, and waits for both sides', () => {
    const turn = PENGUIN_RECIPE.steps.findIndex((step) => step.id === 'penguin-turn-open');
    const left = PENGUIN_RECIPE.steps.findIndex((step) => step.id === 'penguin-side-left');
    const right = PENGUIN_RECIPE.steps.findIndex((step) => step.id === 'penguin-side-right');
    expect(turn).toBeGreaterThan(-1);
    expect(left).toBeGreaterThan(turn);
    expect(right).toBeGreaterThan(turn);
    expect(PENGUIN_RECIPE.steps[turn]?.meshStrategy).toBe('turn');
    expect(PENGUIN_RECIPE.steps[left]?.progressStage).toBe(5);
    expect(PENGUIN_RECIPE.steps[right]?.progressStage).toBe(5);
    expect(PENGUIN_RECIPE.steps[left]?.parallelGroup).toBe('penguin-sides');
    expect(PENGUIN_RECIPE.steps[right]?.parallelGroup).toBe('penguin-sides');
    expect(PENGUIN_RECIPE.steps[left]?.fromSnapshotId).toBe('turned');
    expect(PENGUIN_RECIPE.steps[right]?.fromSnapshotId).toBe('turned');
    const tipped = PENGUIN_RECIPE.snapshots.tipped!;
    const turned = PENGUIN_RECIPE.snapshots.turned!;
    expect(named(turned, 'L')[0]).toBeCloseTo(-named(tipped, 'L')[0], 5);
    expect(named(turned, 'T')[1]).toBeCloseTo(named(tipped, 'T')[1], 5);
    expect(topFaceAt(tipped, 0, PENGUIN_R * 0.8)?.tone).toBe('front');
    expect(topFaceAt(turned, 0, PENGUIN_R * 0.8)?.tone).toBe('back');
    const mirrored = turnSnapshot(tipped, 180);
    expect(mirrored.vertices[0]?.[0]).toBeCloseTo(-(tipped.vertices[0]?.[0] ?? 0));

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 12 && engine.currentStep?.id !== 'penguin-side-left'; guard += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('penguin-side-left');
    expect(engine.progress().activeIndex).toBe(4);
    commitCurrent(engine);
    expect(engine.currentStep?.progressStage).toBe(5);
    expect(engine.currentStep?.id).not.toBe('penguin-flap-left');
    expect(engine.isStepCommitted('penguin-side-left')).toBe(true);
    expect(engine.isStepCommitted('penguin-side-right')).toBe(false);
  });

  it('shapes the beak from the small top flap and shows eyes only at the last step', () => {
    const beak = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-beak');
    expect(beak?.progressStage).toBe(8);
    expect(beak?.hinge.p0[1]).toBeCloseTo(PENGUIN_BEAK_FRAC * PENGUIN_R);
    expect(beak?.hinge.p0[1]).toBeGreaterThan(0.7 * PENGUIN_R);
    expect(Math.abs(beak?.hinge.p0[0] ?? 1)).toBeLessThan(0.05);
    const winged = PENGUIN_RECIPE.snapshots.winged!;
    const beaked = PENGUIN_RECIPE.snapshots.beaked!;
    expect(named(beaked, 'T')[1]).toBeLessThan(named(winged, 'T')[1] - 0.03);
    expect(named(beaked, 'T')[1]).toBeGreaterThan(0.4 * PENGUIN_R);
    const decor = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-decorate');
    expect(decor?.progressStage).toBe(9);
    expect(decor?.actionType).toBe('crease-press');
    expect(PENGUIN_RECIPE.steps.filter((step) => step.progressStage === 9)).toHaveLength(1);
    expect(PENGUIN_RECIPE.steps.every((step) => step.progressStage !== 9 || step.id === 'penguin-decorate')).toBe(true);

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
