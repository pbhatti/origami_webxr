import { describe, expect, it } from 'vitest';
import { silhouetteErrorM, validateFold } from '../../src/origami/FoldValidator.ts';
import { FIXTURE_VERTICES, HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { PINK_RECIPE } from '../../src/origami/recipes/fish-pink-reference.recipe.ts';

const step = HALF_FOLD_RECIPE.steps[0]!;

describe('fold validator', () => {
  it('accepts a 180° half-fold within angle and landmark tolerances', () => {
    const result = validateFold(step, 180, FIXTURE_VERTICES);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.angleErrorDeg).toBe(0);
    expect(result.landmarkErrorM).toBeLessThanOrEqual(step.targetPointToleranceM);
  });

  it('rejects an early release that is far from the target', () => {
    const result = validateFold(step, 40, FIXTURE_VERTICES);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('both');
  });

  it('rejects a missing landmark vertex instead of committing', () => {
    const result = validateFold(step, 180, { A: FIXTURE_VERTICES.A });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('landmark');
  });

  it('completes crease-press by hold, not by hovering at angle 0', () => {
    const press = PINK_RECIPE.steps.find((item) => item.id === 'flatten-body')!;
    const named = PINK_RECIPE.snapshots.fish!.named!;
    expect(validateFold(press, 0, named, { holdMs: 0 }).ok).toBe(false);
    expect(validateFold(press, 0, named, { holdMs: 650 }).ok).toBe(true);
  });

  it('measures one-way silhouette error against reference points', () => {
    expect(silhouetteErrorM([[0, 0, 0]], [[0, 0, 0]])).toBe(0);
    expect(silhouetteErrorM([[0, 0, 0]], [[0.03, 0, 0]])).toBeCloseTo(0.03);
  });
});
