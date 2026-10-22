import { clamp } from '../utils/math.ts';

export const FOLD_ASSIST = {
  activationThreshold: 0.5,
  autoSnapThreshold: 0.58,
  stabilityDurationMs: 100,
  snapDurationMs: 320,
  easing: 'easeOutCubic' as const,
  enabled: true,
};

export const CREASE_GUIDE = {
  visible: true,
  color: '#55351f',
  widthM: 0.003,
  dashM: 0.006,
  gapM: 0.004,
  liftM: 0.0024,
};

export const ARROW_GUIDE = {
  visible: true,
  animate: true,
  cycleSec: 1.75,
  travel: 0.1,
  color: '#3A2E28',
  widthM: 0.0018,
};

export function foldProgress(startAngleDeg: number, targetAngleDeg: number, angleDeg: number): number {
  const span = targetAngleDeg - startAngleDeg;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-6) {
    return 1;
  }
  return clamp((angleDeg - startAngleDeg) / span, 0, 1);
}

const ASSIST_DEG_PER_SEC = 32;

export function magneticPullStrength(progress: number, config = FOLD_ASSIST): number {
  if (!config.enabled || progress < config.activationThreshold) {
    return 0;
  }
  const span = Math.max(config.autoSnapThreshold - config.activationThreshold, 0.001);
  const t = clamp((progress - config.activationThreshold) / span, 0, 1);
  return 0.2 + t * 0.8;
}

export function fartherAlong(startAngleDeg: number, targetAngleDeg: number, a: number, b: number): number {
  return foldProgress(startAngleDeg, targetAngleDeg, a) >= foldProgress(startAngleDeg, targetAngleDeg, b) ? a : b;
}

export function applyFoldAssist(
  angleDeg: number,
  targetAngleDeg: number,
  progress: number,
  dtMs = 16,
  config = FOLD_ASSIST,
): number {
  const pull = magneticPullStrength(progress, config);
  if (pull <= 0) {
    return angleDeg;
  }
  const error = targetAngleDeg - angleDeg;
  const maxStep = ASSIST_DEG_PER_SEC * (0.45 + pull * 0.55) * (dtMs / 1000);
  const delta = Math.sign(error) * Math.min(Math.abs(error), maxStep);
  return angleDeg + delta;
}

export function passedAutoSnap(progress: number, config = FOLD_ASSIST): boolean {
  return config.enabled && progress >= config.autoSnapThreshold;
}

export function snapDurationMs(config = FOLD_ASSIST): number {
  return config.snapDurationMs;
}

export const FOLD_ASSIST_DEFAULTS = { ...FOLD_ASSIST };
export const CREASE_GUIDE_DEFAULTS = { ...CREASE_GUIDE };
export const ARROW_GUIDE_DEFAULTS = { ...ARROW_GUIDE };

export function resetFoldGuideConfig(): void {
  Object.assign(FOLD_ASSIST, FOLD_ASSIST_DEFAULTS);
  Object.assign(CREASE_GUIDE, CREASE_GUIDE_DEFAULTS);
  Object.assign(ARROW_GUIDE, ARROW_GUIDE_DEFAULTS);
}

export function nudgeConfig(value: number, delta: number, min: number, max: number): number {
  return clamp(value + delta, min, max);
}
