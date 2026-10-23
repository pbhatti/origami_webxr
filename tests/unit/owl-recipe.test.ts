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
  it('is a valid five-step recipe and leaves the other animals alone', () => {
    expect(OWL_PAPER_COLOR).toBe('#4E9A4A');
    expect(validateRecipe(OWL_RECIPE)).toEqual([]);
    expect(OWL_STEPS).toEqual([
      'center-crease',
      'bottom-corner-up',
      'top-corner-down',
      'side-folds-inward',
      'owl-decoration',
    ]);
    expect(progressFromRecipe(OWL_RECIPE).totalSteps).toBe(5);
    expect(OWL_RECIPE.steps.filter((step) => step.progressStage === 4).map((step) => step.id)).toEqual([
      'owl-side-left',
      'owl-side-right',
    ]);
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    for (const step of OWL_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
    }
  });

  it('folds the center, reopens the diamond, then builds the owl body', () => {
    const engine = new OrigamiEngine(OWL_RECIPE, OWL_NAMED);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-center-open');
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 5, activeIndex: 0 });
    expect(engine.isStepCommitted('owl-center-fold')).toBe(true);

    commitCurrent(engine);
    const reopened = OWL_RECIPE.snapshots.diamond;
    expect(reopened?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(engine.currentStep?.id).toBe('owl-bottom');
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 5, activeIndex: 1 });

    commitCurrent(engine);
    const bottom = OWL_RECIPE.snapshots.bottom;
    expect(bottom?.named?.B?.[1]).toBeGreaterThan(0);

    commitCurrent(engine);
    const topped = OWL_RECIPE.snapshots.topped;
    expect(topped?.named?.T?.[1]).toBeGreaterThan((bottom?.named?.B?.[1] ?? 0) + 0.02);
    expect(topped?.named?.T?.[1]).toBeLessThan(0.08);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-side-right');
    expect(engine.progress()).toMatchObject({ committedCount: 3, totalSteps: 5, activeIndex: 3 });

    commitCurrent(engine);
    const body = OWL_RECIPE.snapshots.body;
    expect(body?.named?.L?.[0]).toBeGreaterThan(0);
    expect(body?.named?.RIGHT?.[0]).toBeLessThan(0);
    expect(snapshotArea(body!)).toBeGreaterThan(0.006);
    const bounds = snapshotBounds(body!);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(0.05);
    expect(engine.currentStep?.id).toBe('owl-decorate');
    expect(engine.progress()).toMatchObject({ committedCount: 4, totalSteps: 5, activeIndex: 4 });
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
