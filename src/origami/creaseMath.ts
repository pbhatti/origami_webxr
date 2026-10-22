import { clamp, distance3 } from '../utils/math.ts';
import type { FoldStep, Vec3 } from './types.ts';

export const CREASE_ALIGN_TOL_M = 0.0005;
export const STATIONARY_TOL_M = 0.0001;
export const EDGE_LENGTH_REL_TOL = 0.001;
export const STACKED_FACE_TOL_M = 0.0005;
export const GUIDE_LIFT_M = 0.0004;

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function mid(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return !Number.isFinite(len) || len === 0 ? [0, 1, 0] : scale(a, 1 / len);
}

export function copy3(a: Vec3): Vec3 {
  return [a[0], a[1], a[2]];
}

export function liftForDisplay(point: Vec3, liftM = GUIDE_LIFT_M): Vec3 {
  return [point[0], point[1], point[2] + liftM];
}

export function stepCreaseLine(step: FoldStep): [Vec3, Vec3] {
  return [step.hinge.p0, step.hinge.p1];
}

export function creaseAlignmentErrorM(step: FoldStep): number {
  const [visual0, visual1] = step.creaseLineLocal;
  const hinge0 = step.hinge.p0;
  const hinge1 = step.hinge.p1;
  const aligned = Math.max(distance3(visual0, hinge0), distance3(visual1, hinge1));
  const swapped = Math.max(distance3(visual0, hinge1), distance3(visual1, hinge0));
  return Math.min(aligned, swapped);
}

export function closestPointOnSegment(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const denom = dot(ab, ab);
  if (denom < 1e-16) {
    return copy3(a);
  }
  const t = clamp(dot(sub(point, a), ab) / denom, 0, 1);
  return add(a, scale(ab, t));
}

export function distanceToSegment(point: Vec3, a: Vec3, b: Vec3): number {
  return distance3(point, closestPointOnSegment(point, a, b));
}

export function distanceToLine(point: Vec3, p0: Vec3, p1: Vec3): number {
  const axis = creaseAxis(p0, p1);
  const planar = sub(sub(point, p0), scale(axis, dot(sub(point, p0), axis)));
  return length(planar);
}

export function pointOnCrease(point: Vec3, p0: Vec3, p1: Vec3, tolM = CREASE_ALIGN_TOL_M): boolean {
  return distanceToSegment(point, p0, p1) <= tolM;
}

export function pointOnHingeAxis(point: Vec3, p0: Vec3, p1: Vec3, tolM = CREASE_ALIGN_TOL_M): boolean {
  return distanceToLine(point, p0, p1) <= tolM;
}

export function creaseAxis(p0: Vec3, p1: Vec3): Vec3 {
  return normalize(sub(p1, p0));
}

export function creaseRest(p0: Vec3, p1: Vec3, movingHint?: Vec3): Vec3 {
  const axis = creaseAxis(p0, p1);
  let rest = cross(axis, [0, 0, 1]);
  if (length(rest) < 1e-6) {
    rest = cross(axis, [0, 1, 0]);
  }
  rest = normalize(rest);
  if (!movingHint) {
    return rest;
  }
  const planar = sub(sub(movingHint, p0), scale(axis, dot(sub(movingHint, p0), axis)));
  if (dot(planar, rest) < 0) {
    return scale(rest, -1);
  }
  return rest;
}

export function sideOfCrease(point: Vec3, p0: Vec3, p1: Vec3, movingHint?: Vec3): number {
  if (pointOnHingeAxis(point, p0, p1)) {
    return 0;
  }
  const rest = creaseRest(p0, p1, movingHint);
  const axis = creaseAxis(p0, p1);
  const planar = sub(sub(point, p0), scale(axis, dot(sub(point, p0), axis)));
  const value = dot(planar, rest);
  if (Math.abs(value) <= CREASE_ALIGN_TOL_M) {
    return 0;
  }
  return value > 0 ? 1 : -1;
}

export function segmentIntersection(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3, tolM = 0.002): Vec3 | null {
  const dA = sub(a1, a0);
  const dB = sub(b1, b0);
  const r = sub(a0, b0);
  const a = dot(dA, dA);
  const b = dot(dA, dB);
  const c = dot(dB, dB);
  const d = dot(dA, r);
  const e = dot(dB, r);
  const denom = a * c - b * b;
  let t = 0;
  let s = 0;
  if (Math.abs(denom) > 1e-14) {
    t = (b * e - c * d) / denom;
    s = (a * e - b * d) / denom;
  }
  t = clamp(t, 0, 1);
  s = clamp(s, 0, 1);
  const pa = add(a0, scale(dA, t));
  const pb = add(b0, scale(dB, s));
  if (length(sub(pa, pb)) > tolM) {
    return null;
  }
  return mid(pa, pb);
}

export function segmentHitsInfiniteLine(
  seg0: Vec3,
  seg1: Vec3,
  line0: Vec3,
  line1: Vec3,
  tolM = 0.002,
): Vec3 | null {
  const dS = sub(seg1, seg0);
  const dL = sub(line1, line0);
  const r = sub(seg0, line0);
  const a = dot(dS, dS);
  const b = dot(dS, dL);
  const c = dot(dL, dL);
  const d = dot(dS, r);
  const e = dot(dL, r);
  const denom = a * c - b * b;
  let s = 0;
  if (Math.abs(denom) > 1e-14) {
    s = (b * e - c * d) / denom;
  } else if (c > 1e-16) {
    s = 0;
  }
  s = clamp(s, 0, 1);
  const onSeg = add(seg0, scale(dS, s));
  if (distanceToLine(onSeg, line0, line1) > tolM) {
    return null;
  }
  return onSeg;
}

export function clipLineToEdges(origin: Vec3, direction: Vec3, edges: Array<[Vec3, Vec3]>): Vec3[] {
  const hits: Vec3[] = [];
  const extent = add(origin, scale(normalize(direction), 2));
  const back = add(origin, scale(normalize(direction), -2));
  for (const [a, b] of edges) {
    const hit = segmentIntersection(back, extent, a, b);
    if (!hit) {
      continue;
    }
    if (hits.some((existing) => distance3(existing, hit) < CREASE_ALIGN_TOL_M)) {
      continue;
    }
    hits.push(hit);
  }
  return hits;
}

export function perpBisectorClipped(from: Vec3, to: Vec3, edges: Array<[Vec3, Vec3]>): [Vec3, Vec3] {
  const origin = mid(from, to);
  const perp = creaseRest(from, to);
  const hits = clipLineToEdges(origin, perp, edges);
  if (hits.length >= 2) {
    hits.sort((a, b) => dot(sub(a, origin), perp) - dot(sub(b, origin), perp));
    return [hits[0]!, hits[hits.length - 1]!];
  }
  return [origin, add(origin, perp)];
}

export function edgeLength(a: Vec3, b: Vec3): number {
  return distance3(a, b);
}

export function faceEdgeLengths(vertices: Vec3[], indices: number[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < indices.length; i += 1) {
    const a = vertices[indices[i] ?? 0];
    const b = vertices[indices[(i + 1) % indices.length] ?? 0];
    if (a && b) {
      lengths.push(edgeLength(a, b));
    }
  }
  return lengths;
}
