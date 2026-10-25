import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import {
  TURTLE_BACK_COLOR,
  TURTLE_EDGE_COLOR,
  TURTLE_HEAD_TIP,
  TURTLE_NAMED,
  TURTLE_PAPER_COLOR,
  TURTLE_RECIPE,
  TURTLE_STEPS,
  turtleShellHexes,
} from '../../src/origami/recipes/turtle.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { TurtlePinch } from '../../src/origami/TurtlePinch.ts';

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

describe('origami turtle recipe', () => {
  it('is a valid six-step recipe and leaves the other animals alone', () => {
    expect(TURTLE_PAPER_COLOR).toBe('#91C943');
    const paper = origamiPaperMaterial(TURTLE_PAPER_COLOR);
    expect(paper.backColor).toBe(TURTLE_BACK_COLOR.toLowerCase());
    expect(paper.edgeColor).toBe(TURTLE_EDGE_COLOR.toLowerCase());
    expect(validateRecipe(TURTLE_RECIPE)).toEqual([]);
    expect(TURTLE_STEPS).toEqual([
      'diagonal-creases',
      'upper-right-corner',
      'shell-shape',
      'head-tip',
      'head-neck',
      'turtle-decoration',
    ]);
    expect(progressFromRecipe(TURTLE_RECIPE).totalSteps).toBe(6);
    expect(TURTLE_RECIPE.steps.map((step) => step.instruction)).toEqual([
      'Fold along both diagonals, then unfold.',
      'The paper opens. The first diagonal stays as a guide.',
      'Fold along the other diagonal.',
      'The paper opens into a square. Both diagonals are creased.',
      'Fold the upper-right corner inward.',
      'Fold the opposite corner inward to shape the shell.',
      'Fold the small tip upward to form the head.',
      "Complete the turtle's head.",
      'Pinch to bring your turtle to life!',
    ]);
    expect(TURTLE_RECIPE.steps.some((step) => (step.lockCreaseIds?.length ?? 0) > 0)).toBe(false);
    expect(TURTLE_RECIPE.steps.at(-1)?.id).toBe('turtle-decorate');
    expect(TURTLE_RECIPE.steps.at(-1)?.actionType).toBe('crease-press');
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    expect(OWL_RECIPE.steps[0]?.id).toBe('owl-vertical-fold');
    for (const step of TURTLE_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
      expect(step.hinge.p0).not.toEqual(step.hinge.p1);
    }
  });

  it('creases both diagonals, then folds a triangular shell and a left-pointing head', () => {
    const engine = new OrigamiEngine(TURTLE_RECIPE, TURTLE_NAMED);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-fold');
    expect(engine.currentStep?.extraCreaseLines?.length).toBe(1);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-open');
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('turtle-diag-b-open');
    commitCurrent(engine);

    expect(engine.currentStep?.id).toBe('turtle-corner');
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 6, activeIndex: 1 });
    const square = TURTLE_RECIPE.snapshots.square;
    expect(square?.named?.TR?.[0]).toBeGreaterThan(0.09);
    expect(square?.named?.TL?.[1]).toBeGreaterThan(0.09);

    commitCurrent(engine);
    const flap = TURTLE_RECIPE.snapshots.flap;
    expect(flap?.named?.TR?.[0]).toBeLessThan(-0.09);
    expect(flap?.named?.TR?.[1]).toBeLessThan(-0.09);
    const flapBounds = snapshotBounds(flap!);
    expect(flapBounds.maxY - flapBounds.minY).toBeGreaterThan(0.18);

    commitCurrent(engine);
    const shell = TURTLE_RECIPE.snapshots.shell;
    const shellBounds = snapshotBounds(shell!);
    expect(shellBounds.maxY).toBeCloseTo(0, 2);
    expect(shellBounds.minY).toBeCloseTo(-0.1, 2);
    expect(shellBounds.maxX - shellBounds.minX).toBeCloseTo(0.2, 2);
    expect(shellBounds.maxY - shellBounds.minY).toBeCloseTo(0.1, 2);
    expect(shell?.faces.some((face) => face.layer >= 2)).toBe(true);

    commitCurrent(engine);
    const headed = TURTLE_RECIPE.snapshots.headed;
    expect(headed?.named?.BL?.[0]).toBeGreaterThan(-0.06);
    expect(headed?.named?.O?.[1]).toBeCloseTo(0, 3);
    const headedBounds = snapshotBounds(headed!);
    expect(headedBounds.minX).toBeGreaterThan(-0.09);

    commitCurrent(engine);
    const neck = TURTLE_RECIPE.snapshots.neck;
    const neckBounds = snapshotBounds(neck!);
    expect(TURTLE_HEAD_TIP[0]).toBeLessThan(-0.1);
    expect(TURTLE_HEAD_TIP[1]).toBeGreaterThan(-0.09);
    expect(TURTLE_HEAD_TIP[1]).toBeLessThan(-0.06);
    expect(neckBounds.minX).toBeLessThan(-0.1);
    expect(neckBounds.maxX).toBeCloseTo(0.1, 2);
    expect(neckBounds.maxY).toBeCloseTo(0, 2);
    expect(neckBounds.minY).toBeCloseTo(-0.1, 2);
    expect(neck?.named?.O).toEqual([0, 0, 0]);
    expect(neck?.named?.BR?.[0]).toBeCloseTo(0.1, 3);

    commitCurrent(engine);
    expect(engine.isComplete()).toBe(true);
    expect(engine.canStartCreature()).toBe(true);
    expect(engine.lockedCreases).toEqual([]);
    expect(turtleShellHexes().length).toBeGreaterThan(6);
  });

  it('resets every fold when the turtle starts over', () => {
    const engine = new OrigamiEngine(TURTLE_RECIPE, TURTLE_NAMED);
    for (let step = 0; step < 6; step += 1) {
      commitCurrent(engine);
    }
    expect(engine.isStepCommitted('turtle-corner')).toBe(true);
    expect(engine.currentStep?.id).toBe('turtle-head');

    engine.reset(TURTLE_RECIPE, TURTLE_NAMED);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-fold');
    expect(engine.isStepCommitted('turtle-corner')).toBe(false);
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.fromSnapshot?.named?.TL?.[0]).toBeLessThan(-0.09);
    expect(engine.fromSnapshot?.named?.TR?.[1]).toBeGreaterThan(0.09);
  });

  it('plays the decoration once from a single pinch', () => {
    const pinch = new TurtlePinch();
    const host = new Group();
    pinch.attach(host);
    pinch.sync('turtle-decorate');
    pinch.tick(300);
    expect(pinch.begin()).toBe(true);
    expect(pinch.begin()).toBe(false);
    pinch.tick(400);
    expect(pinch.progress).toBeGreaterThan(0.2);
    expect(pinch.consumeCommit()).toBe(false);
    pinch.tick(800);
    expect(pinch.visualState).toBe('done');
    expect(pinch.consumeCommit()).toBe(true);
    expect(pinch.consumeCommit()).toBe(false);
    expect(pinch.contains(new Vector3())).toBe(false);
  });
});
