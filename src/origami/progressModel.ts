import type { FoldStep, OrigamiRecipe } from './types.ts';

export interface ProgressModel {
  recipeId: string;
  totalSteps: number;
  committedCount: number;
  activeIndex: number | null;
  committedActions?: number;
  totalActions?: number;
  subFold?: number;
  subFoldTotal?: number;
}

export function stepProgressStage(step: FoldStep, index: number): number {
  return step.progressStage ?? index + 1;
}

function stageSizes(recipe: OrigamiRecipe): number[] {
  const sizes: number[] = [];
  const indexByStage = new Map<number, number>();
  recipe.steps.forEach((step, index) => {
    const stage = stepProgressStage(step, index);
    const existing = indexByStage.get(stage);
    if (existing === undefined) {
      indexByStage.set(stage, sizes.length);
      sizes.push(1);
    } else {
      sizes[existing] = (sizes[existing] ?? 0) + 1;
    }
  });
  return sizes;
}

export function progressFromRecipe(recipe: OrigamiRecipe, committedActions = 0): ProgressModel {
  const sizes = stageSizes(recipe);
  const totalSteps = sizes.length;
  let consumed = 0;
  let completed = 0;
  for (const size of sizes) {
    if (committedActions >= consumed + size) {
      completed += 1;
      consumed += size;
    } else {
      return {
        recipeId: recipe.id,
        totalSteps,
        committedCount: completed,
        activeIndex: completed,
        committedActions,
        totalActions: recipe.steps.length,
        subFold: committedActions - consumed + 1,
        subFoldTotal: size,
      };
    }
  }
  return {
    recipeId: recipe.id,
    totalSteps,
    committedCount: completed,
    activeIndex: null,
    committedActions,
    totalActions: recipe.steps.length,
  };
}

export function resetProgress(model: ProgressModel): ProgressModel {
  return {
    recipeId: model.recipeId,
    totalSteps: model.totalSteps,
    committedCount: 0,
    activeIndex: model.totalSteps > 0 ? 0 : null,
    committedActions: 0,
    totalActions: model.totalActions,
  };
}

export function progressLabel(model: ProgressModel): string {
  if (model.totalSteps <= 0) {
    return '0/0 · folds not authored yet';
  }
  return `${model.committedCount}/${model.totalSteps}`;
}

export function trackerSlotCount(model: ProgressModel): number {
  return Math.max(0, model.totalSteps);
}
