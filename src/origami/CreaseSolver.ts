import { clamp, radToDeg } from '../utils/math.ts';
import { applyFoldAssist, foldProgress } from './foldAssist.ts';
import type { HingeDefinition, Vec3 } from './types.ts';

export const MAGNETIC_WINDOW_DEG = 20;
export const MAGNETIC_PULL = 0.12;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return !Number.isFinite(len) || len === 0 ? [0, 1, 0] : scale(a, 1 / len);
}

function defaultHinge(halfExtentM: number): HingeDefinition {
  return {
    id: 'center-vertical',
    p0: [0, -halfExtentM, 0],
    p1: [0, halfExtentM, 0],
    fixedFaces: [],
    movingFaces: [],
  };
}

function hingeRest(hinge: HingeDefinition, movingHint?: Vec3): Vec3 {
  const axis = normalize(sub(hinge.p1, hinge.p0));
  let rest = cross(axis, [0, 0, 1]);
  if (length(rest) < 1e-6) {
    rest = [1, 0, 0];
  }
  rest = normalize(rest);
  if (!movingHint) {
    return rest;
  }
  const rel = sub(movingHint, hinge.p0);
  const planar = sub(rel, scale(axis, dot(rel, axis)));
  if (dot(planar, rest) < 0) {
    return scale(rest, -1);
  }
  return rest;
}

function flapRadius(hinge: HingeDefinition, rest: Vec3, movingHint: Vec3 | undefined, halfExtentM: number): number {
  if (!movingHint) {
    return halfExtentM;
  }
  const rel = sub(movingHint, hinge.p0);
  return Math.max(Math.abs(dot(rel, rest)), halfExtentM * 0.15);
}

export function hingeAngleDeg(
  local: Vec3,
  halfExtentM: number,
  hinge: HingeDefinition = defaultHinge(halfExtentM),
  movingHint?: Vec3,
): number {
  if (!Number.isFinite(local[0]) || !Number.isFinite(local[1]) || !Number.isFinite(local[2])) {
    return 0;
  }
  const rest = hingeRest(hinge, movingHint);
  const radius = flapRadius(hinge, rest, movingHint, halfExtentM);
  const rel = sub(local, hinge.p0);
  const x = dot(rel, rest);
  const z = rel[2];
  if (Math.abs(z) < 0.008) {
    return clamp(((radius - x) / (2 * radius)) * 180, 0, 180);
  }
  const around = radToDeg(Math.atan2(z, x));
  if (around < 0) {
    return 0;
  }
  return clamp(around, 0, 180);
}

export function grabAdjustedAngle(
  local: Vec3,
  grabLocal: Vec3,
  startAngleDeg: number,
  minAngleDeg: number,
  maxAngleDeg: number,
  halfExtentM: number,
  hinge?: HingeDefinition,
): number {
  const resolved = hinge ?? defaultHinge(halfExtentM);
  const now = hingeAngleDeg(local, halfExtentM, resolved, grabLocal);
  const atGrab = hingeAngleDeg(grabLocal, halfExtentM, resolved, grabLocal);
  const span = Math.max(maxAngleDeg - atGrab, 0.0001);
  const t = (now - atGrab) / span;
  return clamp(startAngleDeg + t * (maxAngleDeg - startAngleDeg), minAngleDeg, maxAngleDeg);
}

export function arrowAdjustedAngle(
  local: Vec3,
  grabLocal: Vec3,
  arrowPath: Vec3[],
  startAngleDeg: number,
  minAngleDeg: number,
  maxAngleDeg: number,
): number {
  const from = arrowPath[0];
  const to = arrowPath.at(-1);
  if (!from || !to) {
    return startAngleDeg;
  }
  const dir = sub(to, from);
  const len = length(dir);
  if (len < 1e-6) {
    return startAngleDeg;
  }
  const unit = scale(dir, 1 / len);
  const remaining = Math.max(dot(sub(to, grabLocal), unit), 0.025);
  const traveled = dot(sub(local, grabLocal), unit);
  const t = clamp(traveled / remaining, 0, 1);
  return clamp(startAngleDeg + t * (maxAngleDeg - startAngleDeg), minAngleDeg, maxAngleDeg);
}

export function magneticAssist(angleDeg: number, targetDeg: number, startAngleDeg = 0): number {
  const progress = foldProgress(startAngleDeg, targetDeg, angleDeg);
  return applyFoldAssist(angleDeg, targetDeg, progress, 16);
}

export function rotateAroundY(point: Vec3, angleDeg: number): Vec3 {
  return rotateAroundHinge(point, [0, 0, 0], [0, 1, 0], angleDeg);
}

export function rotateAroundHinge(point: Vec3, p0: Vec3, p1: Vec3, angleDeg: number): Vec3 {
  const axis = normalize(sub(p1, p0));
  const v = sub(point, p0);
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const kxv = cross(axis, v);
  const kdotv = dot(axis, v);
  return add(p0, add(add(scale(v, c), scale(kxv, s)), scale(axis, kdotv * (1 - c))));
}

export function landmarkAfterFold(source: Vec3, foldAngleDeg: number): Vec3 {
  return rotateAroundY(source, -foldAngleDeg);
}

export function landmarkAfterHinge(source: Vec3, hinge: HingeDefinition, foldAngleDeg: number, direction: 'valley' | 'mountain'): Vec3 {
  const signed = direction === 'valley' ? -foldAngleDeg : foldAngleDeg;
  return rotateAroundHinge(source, hinge.p0, hinge.p1, signed);
}
