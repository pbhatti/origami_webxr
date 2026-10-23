import { describe, expect, it, vi } from 'vitest';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { FISH_NAMED, FISH_RECIPE } from '../../src/origami/recipes/fish.recipe.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

describe('Seda fish recipe', () => {
  it('is a valid 8-step recipe matching the diagram count', () => {
    expect(validateRecipe(FISH_RECIPE)).toEqual([]);
    expect(FISH_RECIPE.steps.map((step) => step.id)).toEqual([
      'book-fold',
      'packet-square',
      'squash-front',
      'flip-packet',
      'squash-back',
      'tuck-bottom',
      'tuck-top',
      'tail-back',
    ]);
  });

  it('keeps interpolation snapshot vertex counts aligned', () => {
    for (const step of FISH_RECIPE.steps) {
      if (step.meshStrategy !== 'authored-interpolation') {
        continue;
      }
      const from = FISH_RECIPE.snapshots[step.fromSnapshotId];
      const to = FISH_RECIPE.snapshots[step.toSnapshotId];
      expect(from?.vertices.length, step.id).toBe(to?.vertices.length);
    }
  });

  it('completes the triangle squash and flip from in-plane drags, not assist', () => {
    const engine = new OrigamiEngine(FISH_RECIPE, FISH_NAMED);
    FISH_RECIPE.steps.slice(0, 2).forEach(() => {
      engine.assistToTarget();
      drain(engine, 400);
    });
    expect(engine.currentStep?.id).toBe('squash-front');

    engine.beginGrab([-0.03, 0.05, 0]);
    engine.updateFold([-0.12, 0.05, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.currentStep?.id).toBe('flip-packet');

    engine.beginGrab([-0.05, 0.02, 0]);
    engine.updateFold([-0.05, 0.09, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.currentStep?.id).toBe('squash-back');
  });

  it('walks every step with assist and finishes 8/8', () => {
    const engine = new OrigamiEngine(FISH_RECIPE, FISH_NAMED);
    FISH_RECIPE.steps.forEach((_, index) => {
      expect(engine.isComplete()).toBe(false);
      engine.assistToTarget();
      drain(engine, 400);
      expect(engine.progress().committedCount).toBe(index + 1);
    });
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(8);
    expect(engine.canStartCreature()).toBe(true);
  });
});
