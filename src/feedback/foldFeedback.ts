import type { Vec3 } from '../origami/types.ts';

export const FOLD_FEEDBACK = {
  enabled: true,
  volume: 0.55,
  highlight: true,
  settle: true,
  haptics: true,
  debugAssist: false,
  hapticIntensity: 0.2,
  hapticDurationMs: 40,
  settleMs: 100,
};

export const FOLD_FEEDBACK_DEFAULTS = { ...FOLD_FEEDBACK };

export type FoldFeedbackName = 'fold:snap-start' | 'fold:snap-complete' | 'fold:snap-cancelled';

export interface FoldFeedbackPayload {
  recipeId: string;
  stepId: string;
  crease: [Vec3, Vec3];
  assist: boolean;
}

type Listener = (name: FoldFeedbackName, payload: FoldFeedbackPayload) => void;

export class FoldFeedbackBus {
  private readonly listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(name: FoldFeedbackName, payload: FoldFeedbackPayload): void {
    for (const listener of this.listeners) {
      listener(name, payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const foldFeedbackBus = new FoldFeedbackBus();

export function shouldPlayFeedback(
  name: FoldFeedbackName,
  payload: FoldFeedbackPayload,
  config = FOLD_FEEDBACK,
): boolean {
  if (!config.enabled) {
    return false;
  }
  if (name === 'fold:snap-cancelled') {
    return true;
  }
  if (payload.assist && !config.debugAssist) {
    return false;
  }
  return name === 'fold:snap-start' || name === 'fold:snap-complete';
}

export function resetFoldFeedbackConfig(): void {
  Object.assign(FOLD_FEEDBACK, FOLD_FEEDBACK_DEFAULTS);
}
