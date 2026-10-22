import { describe, expect, it, vi } from 'vitest';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import {
  BAT_FOLD_ASSUMPTIONS,
  snapshotArea,
  snapshotBounds,
  validateBatGeometry,
} from '../../src/origami/batFinalShape.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_NAMED, BAT_PAPER_COLOR, BAT_RECIPE, BAT_STEPS, batFinalPhase } from '../../src/origami/recipes/bat.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import { BAT_EYE_Y, BAT_FACE_Z } from '../../src/origami/batFinalShape.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine): void {
  for (let i = 0; i < 50; i += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  drain(engine);
}

describe('origami bat recipe', () => {
  it('is a valid 7-stage crease-driven recipe', () => {
    expect(BAT_PAPER_COLOR).toBe('#9564AD');
    expect(validateRecipe(BAT_RECIPE)).toEqual([]);
    expect(BAT_FOLD_ASSUMPTIONS.length).toBeGreaterThan(3);
    expect(BAT_STEPS).toEqual([
      'triangle-fold',
      'upper-band',
      'right-wing-down',
      'left-wing-down',
      'right-wing-open',
      'left-wing-open',
      'head-and-face',
    ]);
    expect(BAT_RECIPE.steps.map((step) => step.id)).toEqual([
      'bat-triangle',
      'bat-band',
      'bat-right-wing-down',
      'bat-left-wing-down',
      'bat-right-wing-open',
      'bat-left-wing-open',
      'bat-head',
      'bat-notch',
      'bat-face',
    ]);
    expect(BAT_RECIPE.steps.filter((step) => step.progressStage === 7).map((step) => step.id)).toEqual([
      'bat-head',
      'bat-notch',
      'bat-face',
    ]);
    const progress = progressFromRecipe(BAT_RECIPE);
    expect(progress.totalSteps).toBe(7);
    expect(batFinalPhase('bat-head', false)).toBe('head-fold');
    expect(batFinalPhase('bat-notch', false)).toBe('ear-cut');
    expect(batFinalPhase('bat-face', false)).toBe('face-attachment');
    expect(batFinalPhase('bat-face', true)).toBe('complete');
    expect(batFinalPhase('bat-left-wing-open', false)).toBeNull();
  });

  it('keeps every displayed crease on its hinge', () => {
    for (const step of BAT_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
    }
  });

  it('reconstructs each fold from the previous snapshot without collapsing area', () => {
    const engine = new OrigamiEngine(BAT_RECIPE, BAT_NAMED);
    const reports: string[] = [];
    const start = BAT_RECIPE.snapshots.diamond;
    expect(start).toBeTruthy();
    reports.push(`diamond area=${snapshotArea(start!).toFixed(4)} bounds=${JSON.stringify(snapshotBounds(start!))}`);

    for (const step of BAT_RECIPE.steps) {
      expect(engine.currentStep?.id).toBe(step.id);
      const before = engine.fromSnapshot;
      expect(before).toBeTruthy();
      commitCurrent(engine);
      const after = BAT_RECIPE.snapshots[step.toSnapshotId];
      expect(after).toBeTruthy();
      const bounds = snapshotBounds(after!);
      reports.push(
        `${step.id} → ${step.toSnapshotId} area=${snapshotArea(after!).toFixed(4)} x=${bounds.minX.toFixed(3)}..${bounds.maxX.toFixed(3)} y=${bounds.minY.toFixed(3)}..${bounds.maxY.toFixed(3)} faces=${after!.faces.length}`,
      );
      expect(snapshotArea(after!), step.id).toBeGreaterThan(0.006);
    }

    expect(engine.isComplete()).toBe(true);
    expect(engine.canStartCreature()).toBe(true);
    const finalSnap = BAT_RECIPE.snapshots.faced;
    const bounds = snapshotBounds(finalSnap!);
    expect(bounds.maxX - bounds.minX, reports.join('\n')).toBeGreaterThan(0.12);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(0.05);
    expect(snapshotArea(finalSnap!)).toBeGreaterThan(0.008);
    expect(validateBatGeometry(finalSnap!, finalSnap!.vertices)).toEqual([]);
    expect(reports.length).toBe(BAT_RECIPE.steps.length + 1);
  });

  it('keeps the head, the ear cut, and the face on step 7', () => {
    const engine = new OrigamiEngine(BAT_RECIPE, BAT_NAMED);
    for (let i = 0; i < 6; i += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('bat-head');
    expect(engine.progress()).toMatchObject({ committedCount: 6, totalSteps: 7, activeIndex: 6 });
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('bat-notch');
    expect(engine.progress()).toMatchObject({ committedCount: 6, totalSteps: 7, activeIndex: 6 });
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('bat-face');
    expect(engine.isComplete()).toBe(false);
    expect(engine.canStartCreature()).toBe(false);
    expect(engine.progress()).toMatchObject({ committedCount: 6, totalSteps: 7, activeIndex: 6 });
    expect(engine.commitEventCount).toBe(8);
    commitCurrent(engine);
    expect(engine.isComplete()).toBe(true);
    expect(engine.canStartCreature()).toBe(true);
    expect(engine.commitEventCount).toBe(9);
    commitCurrent(engine);
    expect(engine.commitEventCount).toBe(9);
  });

  it('cuts a V into the folded head without restoring the wings or the pre-fold edge', () => {
    const open = BAT_RECIPE.snapshots['both-wings-open'];
    const headed = BAT_RECIPE.snapshots.headed;
    const eared = BAT_RECIPE.snapshots.eared;
    expect(open && headed && eared).toBeTruthy();
    expect(headed!.named?.L?.[0]).toBeLessThan(-0.12);
    expect(headed!.named?.RIGHT?.[0]).toBeGreaterThan(0.12);
    expect(snapshotBounds(headed!).maxY).toBeLessThan(snapshotBounds(open!).maxY - 0.01);
    const ears = snapshotBounds(eared!);
    expect(ears.maxY).toBeLessThan(-0.05);
    expect(ears.maxX).toBeGreaterThan(0.12);
    expect(ears.minX).toBeLessThan(-0.12);
    const notch = eared!.vertices.filter((vertex) => Math.abs(vertex[0]) < 0.004 && vertex[1] < ears.maxY - 0.01);
    expect(notch.length).toBeGreaterThan(0);
    expect(snapshotArea(eared!)).toBeLessThan(snapshotArea(headed!));
    expect(BAT_EYE_Y).toBeLessThan(ears.maxY);
    expect(BAT_EYE_Y).toBeGreaterThan(ears.minY);
    expect(BAT_FACE_Z).toBeGreaterThan(0.002);
    expect(validateBatGeometry(eared!, eared!.vertices)).toEqual([]);
  });

  it('opens each wing around the hinge that folded it down', () => {
    const rightDown = BAT_RECIPE.steps.find((step) => step.id === 'bat-right-wing-down');
    const leftDown = BAT_RECIPE.steps.find((step) => step.id === 'bat-left-wing-down');
    const rightOpen = BAT_RECIPE.steps.find((step) => step.id === 'bat-right-wing-open');
    const leftOpen = BAT_RECIPE.steps.find((step) => step.id === 'bat-left-wing-open');
    expect(rightOpen?.fromSnapshotId).toBe('both-wings-down');
    expect(leftOpen?.fromSnapshotId).toBe('right-wing-open');
    expect(rightOpen?.hinge.p0).toEqual(rightDown?.hinge.p0);
    expect(rightOpen?.hinge.p1).toEqual(rightDown?.hinge.p1);
    expect(leftOpen?.hinge.p0).toEqual(leftDown?.hinge.p0);
    expect(leftOpen?.hinge.p1).toEqual(leftDown?.hinge.p1);
    expect(rightOpen?.movingRegion.faceIds).toEqual(rightDown?.movingRegion.faceIds);
    expect(leftOpen?.movingRegion.faceIds).toEqual(leftDown?.movingRegion.faceIds);

    const tucked = BAT_RECIPE.snapshots['both-wings-down'];
    const extended = BAT_RECIPE.snapshots['both-wings-open'];
    expect(tucked).toBeTruthy();
    expect(extended).toBeTruthy();
    const tuckedBounds = snapshotBounds(tucked!);
    const extendedBounds = snapshotBounds(extended!);
    expect(tuckedBounds.maxX).toBeLessThan(0.11);
    expect(tuckedBounds.minX).toBeGreaterThan(-0.11);
    expect(tuckedBounds.minY).toBeLessThan(-0.11);
    expect(extendedBounds.maxX).toBeGreaterThan(0.12);
    expect(extendedBounds.minX).toBeLessThan(-0.12);
    expect(tucked?.named?.RIGHT?.[1]).toBeLessThan(-0.11);
    expect(tucked?.named?.L?.[1]).toBeLessThan(-0.11);
    expect(extended?.named?.RIGHT?.[0]).toBeGreaterThan(0.12);
    expect(extended?.named?.L?.[0]).toBeLessThan(-0.12);
    expect(extended?.named?.RIGHT?.[2] ?? 0).toBeGreaterThan(0.002);
    expect(extended?.named?.L?.[2] ?? 0).toBeGreaterThan(0.002);
    const rightOnly = BAT_RECIPE.snapshots['right-wing-open'];
    expect(rightOnly?.named?.L?.[0]).toBeLessThan(-0.03);
    expect(rightOnly?.named?.L?.[1]).toBeLessThan(-0.11);
    expect(rightOnly?.named?.RIGHT?.[0]).toBeGreaterThan(0.12);
    expect(Math.abs(rightOnly?.named?.L?.[2] ?? 1)).toBeLessThan(0.001);
  });

  it('forms a downward triangle then a wide upper band', () => {
    const triangle = BAT_RECIPE.snapshots.triangle;
    const band = BAT_RECIPE.snapshots.band;
    expect(triangle).toBeTruthy();
    expect(band).toBeTruthy();
    const tri = snapshotBounds(triangle!);
    const house = snapshotBounds(band!);
    expect(tri.maxY).toBeLessThan(0.02);
    expect(tri.minY).toBeLessThan(-0.12);
    expect(house.maxY).toBeLessThan(tri.maxY + 0.002);
    expect(house.maxX - house.minX).toBeGreaterThan(0.1);
  });

  it('leaves whale and fox recipes untouched', () => {
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(OWL_RECIPE.steps[0]?.id).toBe('owl-center-fold');
    expect(validateRecipe(WHALE_RECIPE)).toEqual([]);
    expect(validateRecipe(FOX_RECIPE)).toEqual([]);
    expect(validateRecipe(OWL_RECIPE)).toEqual([]);
  });
});
