import { clamp, distance3, lerp3 } from '../utils/math.ts';
import { landmarkAfterHinge } from './CreaseSolver.ts';
import { interpolatesMesh, stepActionType, type FoldStep, type Vec3 } from './types.ts';

export const DEFAULT_CREASE_PRESS_HOLD_MS = 650;
export const DEFAULT_SILHOUETTE_TOLERANCE_M = 0.03;

export interface FoldValidation {
  ok: boolean;
  angleErrorDeg: number;
  landmarkErrorM: number;
  reason: 'ok' | 'angle' | 'landmark' | 'both';
}

export interface FoldValidationOptions {
  holdMs?: number;
}

export function silhouetteErrorM(current: Vec3[], reference: Vec3[]): number {
  if (reference.length === 0) {
    return 0;
  }
  let worst = 0;
  for (const target of reference) {
    let best = Number.POSITIVE_INFINITY;
    for (const point of current) {
      best = Math.min(best, distance3(point, target));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

export function validateFold(
  step: FoldStep,
  angleDeg: number,
  vertices: Record<string, Vec3>,
  options: FoldValidationOptions = {},
): FoldValidation {
  const angleErrorDeg = Math.abs(angleDeg - step.targetAngleDeg);
  const holdTarget = step.creasePressHoldMs ?? DEFAULT_CREASE_PRESS_HOLD_MS;
  const holdOk =
    stepActionType(step) === 'crease-press' && (options.holdMs ?? 0) >= holdTarget;
  const angleOk = angleErrorDeg <= step.angleToleranceDeg || holdOk;

  let landmarkErrorM = 0;
  let landmarkOk = true;
  const t = holdOk ? 1 : clamp(angleDeg / Math.max(step.targetAngleDeg, 1e-6), 0, 1);
  if (holdOk) {
    landmarkOk = true;
    landmarkErrorM = 0;
  } else {
    for (const landmark of step.targetLandmarks) {
      const source = vertices[landmark.sourceVertexId];
      if (!source) {
        landmarkOk = false;
        landmarkErrorM = Number.POSITIVE_INFINITY;
        break;
      }
      const folded = interpolatesMesh(step)
        ? lerp3(source, landmark.target, t)
        : landmarkAfterHinge(source, step.hinge, angleDeg, step.direction);
      landmarkErrorM = Math.max(landmarkErrorM, distance3(folded, landmark.target));
      if (landmarkErrorM > step.targetPointToleranceM) {
        landmarkOk = false;
      }
    }
  }

  const ok = angleOk && landmarkOk;
  let reason: FoldValidation['reason'] = 'ok';
  if (!angleOk && !landmarkOk) {
    reason = 'both';
  } else if (!angleOk) {
    reason = 'angle';
  } else if (!landmarkOk) {
    reason = 'landmark';
  }
  return { ok, angleErrorDeg, landmarkErrorM, reason };
}
