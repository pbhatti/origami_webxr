import type { Vec3 } from '../origami/types.ts';
import { PAPER_SIZE_M } from '../origami/placement.ts';

export function intersectLocalZ0(
  origin: Vec3,
  direction: Vec3,
  half = PAPER_SIZE_M / 2,
  maxDistanceM = 0.8,
): Vec3 | null {
  const dz = direction[2];
  if (!Number.isFinite(dz) || Math.abs(dz) < 1e-6) {
    return null;
  }
  const t = -origin[2] / dz;
  if (!Number.isFinite(t) || t < 0 || t > maxDistanceM) {
    return null;
  }
  const x = origin[0] + direction[0] * t;
  const y = origin[1] + direction[1] * t;
  if (Math.abs(x) > half + 0.02 || Math.abs(y) > half + 0.02) {
    return null;
  }
  return [x, y, 0];
}
