import type { GrabRegion, Vec2, Vec3 } from '../origami/types.ts';

export const GRAB_DEPTH_TOLERANCE_M = 0.035;

export const PHASE2_MOVING_REGION: GrabRegion = {
  id: 'moving-right-half',
  faceIds: ['right'],
  polygonUV: [
    [0.5, 0],
    [1, 0],
    [1, 1],
    [0.5, 1],
  ],
  allowedHands: 'either',
};

export const PHASE2_HOLD_REGION: GrabRegion = {
  id: 'hold-left-half',
  faceIds: ['left'],
  polygonUV: [
    [0, 0],
    [0.5, 0],
    [0.5, 1],
    [0, 1],
  ],
  allowedHands: 'either',
};

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]?.[0] ?? 0;
    const yi = polygon[i]?.[1] ?? 0;
    const xj = polygon[j]?.[0] ?? 0;
    const yj = polygon[j]?.[1] ?? 0;
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

export function paperLocalToUv(local: Vec3, sheetSizeM: number): Vec2 {
  const u = local[0] / sheetSizeM + 0.5;
  const v = local[1] / sheetSizeM + 0.5;
  return [u, v];
}

export function sampleHitsRegion(
  local: Vec3,
  region: GrabRegion,
  sheetSizeM: number,
  depthToleranceM = GRAB_DEPTH_TOLERANCE_M,
): boolean {
  if (!Number.isFinite(local[0]) || !Number.isFinite(local[1]) || !Number.isFinite(local[2])) {
    return false;
  }
  if (Math.abs(local[2]) > depthToleranceM) {
    return false;
  }
  return pointInPolygon(paperLocalToUv(local, sheetSizeM), region.polygonUV);
}

export function classifyGrab(
  local: Vec3,
  sheetSizeM: number,
  movingRegion: GrabRegion = PHASE2_MOVING_REGION,
  holdRegion: GrabRegion = PHASE2_HOLD_REGION,
  depthToleranceM = GRAB_DEPTH_TOLERANCE_M,
): 'moving' | 'hold' | 'none' {
  return classifyGrabMany(local, sheetSizeM, [movingRegion], holdRegion, depthToleranceM);
}

export function classifyGrabMany(
  local: Vec3,
  sheetSizeM: number,
  movingRegions: GrabRegion[],
  holdRegion?: GrabRegion,
  depthToleranceM = GRAB_DEPTH_TOLERANCE_M,
): 'moving' | 'hold' | 'none' {
  for (const region of movingRegions) {
    if (sampleHitsRegion(local, region, sheetSizeM, depthToleranceM)) {
      return 'moving';
    }
  }
  if (holdRegion && sampleHitsRegion(local, holdRegion, sheetSizeM, depthToleranceM)) {
    return 'hold';
  }
  return 'none';
}

export function hitMovingRegion(
  local: Vec3,
  sheetSizeM: number,
  movingRegions: GrabRegion[],
  depthToleranceM = GRAB_DEPTH_TOLERANCE_M,
): GrabRegion | null {
  return movingRegions.find((region) => sampleHitsRegion(local, region, sheetSizeM, depthToleranceM)) ?? null;
}
