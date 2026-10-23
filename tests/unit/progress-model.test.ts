import { describe, expect, it } from 'vitest';
import {
  progressFromRecipe,
  progressLabel,
  resetProgress,
  trackerSlotCount,
} from '../../src/origami/progressModel.ts';
import { HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { FISH_RECIPE } from '../../src/origami/recipes/fish.recipe.ts';
import { PINK_RECIPE } from '../../src/origami/recipes/fish-pink-reference.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';

describe('progress model', () => {
  it('tracks the 1-step fixture', () => {
    const model = progressFromRecipe(HALF_FOLD_RECIPE);
    expect(model.totalSteps).toBe(1);
    expect(progressLabel(model)).toBe('0/1');
    expect(progressLabel({ ...model, committedCount: 1, activeIndex: null })).toBe('1/1');
  });

  it('tracks the 8 Seda-diagram fish folds, not an invented 12', () => {
    expect(FISH_RECIPE.id).toBe('seda-fish');
    expect(FISH_RECIPE.steps).toHaveLength(8);
    const model = progressFromRecipe(FISH_RECIPE);
    expect(trackerSlotCount(model)).toBe(8);
    expect(progressLabel(model)).toBe('0/8');
    expect(progressLabel({ ...model, committedCount: 8, activeIndex: null })).toBe('8/8');
    expect(progressLabel(model)).not.toContain('12');
  });

  it('tracks the pink-paper candidate from its authored action count, not 12', () => {
    expect(PINK_RECIPE.id).toBe('fish-pink-reference');
    const model = progressFromRecipe(PINK_RECIPE);
    expect(model.totalSteps).toBe(PINK_RECIPE.steps.length);
    expect(progressLabel(model)).toBe(`0/${PINK_RECIPE.steps.length}`);
    expect(progressLabel(model)).not.toContain('12');
  });

  it('tracks the whale as 6 stages, not 8 pinch actions', () => {
    expect(WHALE_RECIPE.steps).toHaveLength(8);
    const model = progressFromRecipe(WHALE_RECIPE);
    expect(trackerSlotCount(model)).toBe(6);
    expect(progressLabel(model)).toBe('0/6');
    expect(progressFromRecipe(WHALE_RECIPE, 1).committedCount).toBe(1);
    expect(progressFromRecipe(WHALE_RECIPE, 3).committedCount).toBe(1);
    expect(progressFromRecipe(WHALE_RECIPE, 4).committedCount).toBe(2);
  });

  it('resets committed folds without inventing a step count', () => {
    const reset = resetProgress({
      recipeId: 'seda-fish',
      totalSteps: 8,
      committedCount: 8,
      activeIndex: null,
    });
    expect(reset.committedCount).toBe(0);
    expect(reset.totalSteps).toBe(8);
    expect(reset.activeIndex).toBe(0);
    expect(progressLabel(reset)).toBe('0/8');
  });
});
