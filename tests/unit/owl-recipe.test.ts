import { describe, expect, it, vi } from 'vitest';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotArea, snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_NAMED, OWL_PAPER_COLOR, OWL_RECIPE, OWL_STEPS } from '../../src/origami/recipes/owl.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { OwlPinch } from '../../src/origami/OwlPinch.ts';
import { Group, Vector3 } from 'three';

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

describe('origami owl recipe', () => {
  it('is a valid six-step recipe and leaves the other animals alone', () => {
    expect(OWL_PAPER_COLOR).toBe('#4E9A4A');
    expect(validateRecipe(OWL_RECIPE)).toEqual([]);
    expect(OWL_STEPS).toEqual([
      'guide-creases',
      'top-corner-down',
      'bottom-corner-up',
      'side-folds-inward',
      'body-shape',
      'owl-decoration',
    ]);
    expect(progressFromRecipe(OWL_RECIPE).totalSteps).toBe(6);
    expect(OWL_RECIPE.steps.filter((step) => step.progressStage === 1).map((step) => step.id)).toEqual([
      'owl-vertical-fold',
      'owl-vertical-open',
      'owl-horizontal-fold',
      'owl-horizontal-open',
    ]);
    expect(OWL_RECIPE.steps.filter((step) => step.progressStage === 4).map((step) => step.id)).toEqual([
      'owl-side-left',
      'owl-side-right',
    ]);
    expect(OWL_RECIPE.steps.at(-1)?.id).toBe('owl-decorate');
    expect(OWL_RECIPE.steps.at(-1)?.actionType).toBe('crease-press');
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    for (const step of OWL_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
      expect(step.hinge.p0).not.toEqual(step.hinge.p1);
    }
  });

  it('creases the diamond, then builds a compact layered owl', () => {
    const engine = new OrigamiEngine(OWL_RECIPE, OWL_NAMED);
    expect(engine.currentStep?.id).toBe('owl-vertical-fold');
    expect(engine.currentStep?.extraCreaseLines?.length).toBe(1);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-vertical-open');
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(true);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 6, activeIndex: 0 });

    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-horizontal-open');
    commitCurrent(engine);

    const reopened = OWL_RECIPE.snapshots.diamond;
    expect(reopened?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(reopened?.named?.T?.[1]).toBeGreaterThan(0.1);
    expect(engine.currentStep?.id).toBe('owl-top');
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 6, activeIndex: 1 });
    expect(engine.lockedCreases.map((crease) => crease.id).sort()).toEqual(['owl-horizontal', 'owl-vertical']);

    commitCurrent(engine);
    const topped = OWL_RECIPE.snapshots.topped;
    const forehead = topped?.named?.T?.[1] ?? 0;
    expect(forehead).toBeGreaterThan(0.08);
    expect(forehead).toBeLessThan(0.11);
    expect(topped?.faces.some((face) => face.layer >= 1)).toBe(true);

    commitCurrent(engine);
    const raised = OWL_RECIPE.snapshots.raised;
    const belly = raised?.named?.B?.[1] ?? 0;
    expect(belly).toBeGreaterThan(forehead);
    expect(belly).toBeLessThan(0.12);
    expect(engine.currentStep?.id).toBe('owl-side-left');

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-side-right');
    expect(engine.progress()).toMatchObject({ committedCount: 3, totalSteps: 6, activeIndex: 3 });
    expect(OWL_RECIPE.steps.find((step) => step.id === 'owl-side-left')?.hinge.id).toBe('owl-side-left');
    expect(OWL_RECIPE.steps.find((step) => step.id === 'owl-side-right')?.hinge.id).toBe('owl-side-right');

    commitCurrent(engine);
    const sided = OWL_RECIPE.snapshots.sided;
    expect(sided?.named?.L?.[0]).toBeGreaterThan(0);
    expect(sided?.named?.RIGHT?.[0]).toBeLessThan(0);
    const sidedBounds = snapshotBounds(sided!);
    expect(sidedBounds.maxY - sidedBounds.minY).toBeLessThan(sidedBounds.maxX - sidedBounds.minX + 0.03);

    commitCurrent(engine);
    const body = OWL_RECIPE.snapshots.body;
    expect(body?.named?.L?.[0]).toBeGreaterThan(0);
    expect(body?.named?.RIGHT?.[0]).toBeLessThan(0);
    expect(snapshotArea(body!)).toBeGreaterThan(0.006);
    const bounds = snapshotBounds(body!);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    expect(width).toBeGreaterThan(0.1);
    expect(width).toBeLessThan(0.16);
    expect(height / width).toBeLessThan(1.15);
    expect(height / width).toBeGreaterThan(0.7);
    expect(new Set(body?.faces.map((face) => face.layer)).size).toBeGreaterThan(2);
    expect(engine.currentStep?.id).toBe('owl-decorate');
    expect(engine.progress()).toMatchObject({ committedCount: 5, totalSteps: 6, activeIndex: 5 });
  });

  it('resets every fold when the owl starts over', () => {
    const engine = new OrigamiEngine(OWL_RECIPE, OWL_NAMED);
    for (let step = 0; step < 8; step += 1) {
      commitCurrent(engine);
    }
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(true);
    expect(engine.isStepCommitted('owl-side-right')).toBe(true);
    expect(engine.currentStep?.id).toBe('owl-hem');

    engine.reset(OWL_RECIPE, OWL_NAMED);
    expect(engine.currentStep?.id).toBe('owl-vertical-fold');
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(false);
    expect(engine.isStepCommitted('owl-hem')).toBe(false);
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 6, activeIndex: 0 });
    expect(engine.fromSnapshot?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(0.1);
  });

  it('plays the decoration once from a single pinch', () => {
    const pinch = new OwlPinch();
    const host = new Group();
    pinch.attach(host);
    pinch.sync('owl-decorate');
    pinch.tick(300);
    expect(pinch.begin()).toBe(true);
    expect(pinch.begin()).toBe(false);
    pinch.tick(400);
    expect(pinch.progress).toBeGreaterThan(0.2);
    expect(pinch.progress).toBeLessThan(1);
    expect(pinch.consumeCommit()).toBe(false);
    pinch.tick(800);
    expect(pinch.visualState).toBe('done');
    expect(pinch.consumeCommit()).toBe(true);
    expect(pinch.consumeCommit()).toBe(false);
    expect(pinch.contains(new Vector3())).toBe(false);
  });
});
