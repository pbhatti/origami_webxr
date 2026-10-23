import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrigamiEngine, twoStepMockRecipe } from '../../src/origami/OrigamiEngine.ts';
import { FOLD_ASSIST, resetFoldGuideConfig } from '../../src/origami/foldAssist.ts';
import { FIXTURE_VERTICES, HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

afterEach(() => {
  resetFoldGuideConfig();
});

const half = PAPER_SIZE_M / 2;

function drain(engine: OrigamiEngine, durationMs: number): { finished: boolean; committed: boolean } {
  let last = { finished: false, committed: false };
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    last = engine.tick(16);
    if (last.finished) {
      return last;
    }
  }
  return last;
}

describe('origami engine', () => {
  it('snaps a live 180° half-fold once and reports 1/1', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([-half, 0, 0]);
    const released = engine.release();
    expect(released.ok).toBe(true);
    expect(engine.enginePhase).toBe('snapping');
    const done = drain(engine, 400);
    expect(done.committed).toBe(true);
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 1 });
    expect(drain(engine, 300).committed).toBe(false);
  });

  it('rolls back an early release without committing', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0.04, 0, 0]);
    const released = engine.release();
    expect(released.ok).toBe(false);
    expect(engine.enginePhase).toBe('returning');
    drain(engine, 400);
    expect(engine.isComplete()).toBe(false);
    expect(engine.angle).toBeCloseTo(0);
    expect(engine.progress().committedCount).toBe(0);
  });

  it('cancels a tracking-loss fold back to the start angle', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0, 0, 0]);
    engine.cancelActive();
    drain(engine, 400);
    expect(engine.enginePhase).toBe('idle');
    expect(engine.progress().committedCount).toBe(0);
  });

  it('marks debug assist so it is not counted as a gesture', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.assistToTarget();
    expect(engine.usedAssist).toBe(true);
    drain(engine, 400);
    expect(engine.isComplete()).toBe(true);
  });

  it('auto-snaps after the fold passes 58% and stays there', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    const local: [number, number, number] = [-0.016, 0, 0];
    engine.updateFold(local, false, 16);
    expect(engine.foldCompletion).toBeGreaterThan(0.55);
    expect(engine.enginePhase).toBe('folding');
    for (let i = 0; i < 8; i += 1) {
      engine.updateFold(local, false, 16);
    }
    expect(engine.enginePhase).toBe('snapping');
    expect(engine.progress().committedCount).toBe(0);
    const done = drain(engine, 400);
    expect(done.committed).toBe(true);
    expect(engine.isComplete()).toBe(true);
  });

  it('completes the snap if the pinch is released after the threshold', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([-0.016, 0, 0], false, 16);
    const released = engine.release();
    expect(released.ok).toBe(true);
    expect(engine.enginePhase).toBe('snapping');
    expect(drain(engine, 400).committed).toBe(true);
  });

  it('does not snap when tracking is lost before the threshold', () => {
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0.04, 0, 0], false, 16);
    expect(engine.foldCompletion).toBeLessThan(0.5);
    expect(engine.cancelActive()).toBe('returning');
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(0);
    expect(engine.angle).toBeCloseTo(0);
  });

  it('skips early snap when magnetic assist is disabled', () => {
    FOLD_ASSIST.enabled = false;
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    const local: [number, number, number] = [-0.016, 0, 0];
    for (let i = 0; i < 10; i += 1) {
      engine.updateFold(local, false, 16);
    }
    expect(engine.enginePhase).toBe('folding');
    expect(engine.release().ok).toBe(false);
    drain(engine, 400);
    expect(engine.isComplete()).toBe(false);
  });

  it('walks two consecutive mock folds without visual-state corruption in the engine', () => {
    const recipe = twoStepMockRecipe(HALF_FOLD_RECIPE);
    const engine = new OrigamiEngine(recipe, FIXTURE_VERTICES);
    expect(recipe.steps).toHaveLength(2);

    engine.beginGrab([half, 0, 0]);
    engine.updateFold([-half, 0, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(1);
    expect(engine.currentStep?.id).toBe('second-fold');
    expect(engine.angle).toBeCloseTo(0);

    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0, 0, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(2);
  });
});
