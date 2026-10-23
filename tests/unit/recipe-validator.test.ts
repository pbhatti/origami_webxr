import { describe, expect, it } from 'vitest';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { twoStepMockRecipe } from '../../src/origami/OrigamiEngine.ts';
import { HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { FISH_RECIPE } from '../../src/origami/recipes/fish.recipe.ts';
import { PINK_RECIPE } from '../../src/origami/recipes/fish-pink-reference.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';

describe('recipe validator', () => {
  it('accepts the authored half-fold fixture', () => {
    expect(validateRecipe(HALF_FOLD_RECIPE)).toEqual([]);
  });

  it('accepts the Seda fish recipe', () => {
    expect(validateRecipe(FISH_RECIPE)).toEqual([]);
  });

  it('accepts the pink-paper candidate without mixing it into seda-fish', () => {
    expect(validateRecipe(PINK_RECIPE)).toEqual([]);
    expect(PINK_RECIPE.id).toBe('fish-pink-reference');
    expect(FISH_RECIPE.id).toBe('seda-fish');
  });

  it('accepts the live origami whale recipe', () => {
    expect(validateRecipe(WHALE_RECIPE)).toEqual([]);
    expect(WHALE_RECIPE.id).toBe('origami-whale');
  });

  it('accepts the two-step mock used by engine tests', () => {
    expect(validateRecipe(twoStepMockRecipe(HALF_FOLD_RECIPE))).toEqual([]);
  });

  it('rejects interpolation steps whose snapshots have different vertex counts', () => {
    const step = FISH_RECIPE.steps.find((item) => item.meshStrategy === 'authored-interpolation')!;
    const from = FISH_RECIPE.snapshots[step.fromSnapshotId]!;
    const broken = {
      ...FISH_RECIPE,
      steps: [
        {
          ...step,
          toSnapshotId: 'mismatched',
        },
      ],
      snapshots: {
        ...FISH_RECIPE.snapshots,
        mismatched: { vertices: from.vertices.slice(0, 1), faces: from.faces },
      },
    };
    expect(validateRecipe(broken).some((issue) => issue.path.includes('meshStrategy'))).toBe(true);
  });

  it('reports missing snapshots, collapsed hinges, and empty grab polygons', () => {
    const step = HALF_FOLD_RECIPE.steps[0]!;
    const broken = {
      ...HALF_FOLD_RECIPE,
      id: '',
      steps: [
        {
          ...step,
          fromSnapshotId: 'missing',
          hinge: { ...step.hinge, p1: step.hinge.p0 },
          movingRegion: { ...step.movingRegion, polygonUV: [] },
          startAngleDeg: 200,
          targetAngleDeg: 400,
          angleToleranceDeg: 0,
        },
      ],
    };
    const issues = validateRecipe(broken);
    expect(issues.some((issue) => issue.path === 'id')).toBe(true);
    expect(issues.some((issue) => issue.path.includes('fromSnapshotId'))).toBe(true);
    expect(issues.some((issue) => issue.path.includes('hinge'))).toBe(true);
    expect(issues.some((issue) => issue.path.includes('movingRegion'))).toBe(true);
    expect(issues.some((issue) => issue.path.includes('startAngleDeg'))).toBe(true);
    expect(issues.some((issue) => issue.path.includes('targetAngleDeg'))).toBe(true);
    expect(issues.some((issue) => issue.path.includes('angleToleranceDeg'))).toBe(true);
  });
});
