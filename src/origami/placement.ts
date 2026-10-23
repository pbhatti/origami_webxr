export type Vec3 = [number, number, number];

export const PAPER_SIZE_M = 0.2;
export const SPAWN_OFFSET_LOCAL: Vec3 = [0, -0.15, -0.65];
export const PAPER_TILT_RAD = (20 * Math.PI) / 180;
export const TRACKER_OFFSET_LOCAL: Vec3 = [0.16, 0.1, 0.015];
export const TOOLBAR_OFFSET_LOCAL: Vec3 = [-0.22, 0.14, 0.02];
export const MOVE_HANDLE_OFFSET_LOCAL: Vec3 = [0, -0.22, 0.012];
export const MOVE_HANDLE_HIT_RADIUS_M = 0.048;
export const PAPER_SCALE_MIN = 0.65;
export const PAPER_SCALE_MAX = 1.5;
export const PAPER_MOVE_MIN_DISTANCE_M = 0.28;
export const PAPER_MOVE_MAX_DISTANCE_M = 1.4;
export const MIN_UI_SEPARATION_M = 0.05;
export const COMFORTABLE_REACH_MIN_M = 0.55;
export const COMFORTABLE_REACH_MAX_M = 0.8;
export const EYE_DROP_MIN_M = 0.1;
export const EYE_DROP_MAX_M = 0.2;

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize3(a: Vec3): Vec3 {
  const length = length3(a);
  if (!Number.isFinite(length) || length === 0) {
    return [0, 1, 0];
  }
  return scale3(a, 1 / length);
}

export function viewerBasis(
  forward: Vec3,
  upHint: Vec3 = [0, 1, 0],
): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forwardN = normalize3(forward);
  let right = cross3(forwardN, upHint);
  if (length3(right) < 1e-5) {
    right = cross3(forwardN, [1, 0, 0]);
  }
  right = normalize3(right);
  const up = normalize3(cross3(right, forwardN));
  return { forward: forwardN, right, up };
}

export function offsetInViewerSpace(
  viewerPos: Vec3,
  forward: Vec3,
  upHint: Vec3,
  localOffset: Vec3 = SPAWN_OFFSET_LOCAL,
): Vec3 {
  const { forward: fwd, right, up } = viewerBasis(forward, upHint);
  const worldOffset = add3(
    add3(scale3(right, localOffset[0]), scale3(up, localOffset[1])),
    scale3(fwd, -localOffset[2]),
  );
  return add3(viewerPos, worldOffset);
}

export function spawnDistanceM(offset: Vec3 = SPAWN_OFFSET_LOCAL): number {
  return length3(offset);
}

export function isComfortableReach(distanceM: number): boolean {
  return distanceM >= COMFORTABLE_REACH_MIN_M && distanceM <= COMFORTABLE_REACH_MAX_M;
}

export function uiClearanceFromPaper(offset: Vec3): number {
  return Math.hypot(offset[0], offset[1]) - PAPER_SIZE_M / 2;
}

export function allFinite(values: number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}
