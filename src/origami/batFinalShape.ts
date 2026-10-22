import { distance3 } from '../utils/math.ts';
import { splitSnapshotAlongCrease } from './MeshSplitter.ts';
import { add, copy3, scale, sub } from './creaseMath.ts';
import type { FaceDefinition, MeshSnapshot, Vec3 } from './types.ts';

/**
 * Reconstructed origami-bat sequence from the common purple kids' tutorial
 * (square → downward triangle → upper band / house → wing flaps → opened wings
 * → head + scissor notch → face).
 *
 * Ambiguous / reconstructed transitions (not silently approximated):
 * 1. The sheet starts as a diamond so the first crease is the true paper
 *    diagonal and lands as a downward triangle without a post-fold rotation.
 * 2. The upper band is a valley fold parallel to that diagonal, about 32% of
 *    the triangle height, folding the wide base down over the body.
 * 3. Each wing crease is the diagonal that sends that side tip downward.
 *    The right wing folds first, then the left. That pair is the last
 *    downward configuration.
 * 4. Opening a wing rotates that same flap around the same crease until the
 *    tip is extended and flat. It does not cut a second flap.
 * 5. The reference uses scissors for the ear notch. That cut is an assisted
 *    crease-press that splits only the head-flap faces and drops the V scrap,
 *    so infinite creases cannot eat the wings.
 */
export const BAT_FOLD_ASSUMPTIONS = [
  'diamond-start-is-square-diagonal',
  'upper-band-is-parallel-valley',
  'wings-fold-down-right-then-left',
  'wing-open-reuses-downward-hinge',
  'ear-notch-is-assisted-head-cut',
] as const;

export const BAT_SHAPE_INSPECTOR = {
  enabled: false,
  allCreases: false,
  activeCrease: true,
  movingBounds: false,
  hingeAxis: false,
  layerOrder: false,
  targetFold: false,
  normals: false,
};

export const BAT_SHAPE_TOLERANCE_M = 0.04;
export const BAT_HEAD_Y_MIN = -0.055;
export const BAT_FACE_Y = -0.028;
export const BAT_FACE_Z = 0.0042;
export const BAT_EYE_X = 0.016;
export const BAT_EYE_Y = -0.022;

function centroid(face: FaceDefinition, vertices: Vec3[]): Vec3 {
  let acc: Vec3 = [0, 0, 0];
  let count = 0;
  for (const index of face.vertices) {
    const vertex = vertices[index];
    if (!vertex) {
      continue;
    }
    acc = add(acc, vertex);
    count += 1;
  }
  return count === 0 ? acc : scale(acc, 1 / count);
}

function triangleContains(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const v0 = sub(c, a);
  const v1 = sub(b, a);
  const v2 = sub(point, a);
  const dot00 = v0[0] * v0[0] + v0[1] * v0[1];
  const dot01 = v0[0] * v1[0] + v0[1] * v1[1];
  const dot02 = v0[0] * v2[0] + v0[1] * v2[1];
  const dot11 = v1[0] * v1[0] + v1[1] * v1[1];
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1];
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) {
    return false;
  }
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  return u >= -1e-4 && v >= -1e-4 && u + v <= 1 + 1e-4;
}

/** Assisted cut used only on the head flap so wing faces stay intact. */
export function cutHeadNotch(
  snapshot: MeshSnapshot,
  left: Vec3,
  tip: Vec3,
  right: Vec3,
  headMinY: number,
): MeshSnapshot {
  const headFaces = snapshot.faces.filter((face) => centroid(face, snapshot.vertices)[1] >= headMinY - 0.004);
  const bodyFaces = snapshot.faces.filter((face) => centroid(face, snapshot.vertices)[1] < headMinY - 0.004);
  const headOnly: MeshSnapshot = { ...snapshot, faces: headFaces };
  const split = splitSnapshotAlongCrease(
    splitSnapshotAlongCrease(splitSnapshotAlongCrease(headOnly, left, tip), tip, right),
    right,
    left,
  );
  const kept = split.faces.filter((face) => !triangleContains(centroid(face, split.vertices), left, tip, right));
  return {
    ...split,
    vertices: split.vertices.map((vertex) => copy3(vertex)),
    faces: [...bodyFaces.map((face) => ({ ...face, vertices: [...face.vertices] })), ...kept],
  };
}

export function extremaOf(snapshot: MeshSnapshot): Vec3[] {
  const verts = snapshot.vertices;
  if (verts.length === 0) {
    return [];
  }
  const left = verts.reduce((best, vertex) => (vertex[0] < best[0] ? vertex : best));
  const right = verts.reduce((best, vertex) => (vertex[0] > best[0] ? vertex : best));
  const top = verts.reduce((best, vertex) => (vertex[1] > best[1] ? vertex : best));
  const bottom = verts.reduce((best, vertex) => (vertex[1] < best[1] ? vertex : best));
  return [copy3(left), copy3(top), copy3(right), copy3(bottom)];
}

export function snapshotBounds(snapshot: MeshSnapshot): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vertex of snapshot.vertices) {
    minX = Math.min(minX, vertex[0]);
    maxX = Math.max(maxX, vertex[0]);
    minY = Math.min(minY, vertex[1]);
    maxY = Math.max(maxY, vertex[1]);
  }
  return { minX, maxX, minY, maxY };
}

export function snapshotArea(snapshot: MeshSnapshot): number {
  let area = 0;
  for (const face of snapshot.faces) {
    const pts = face.vertices.map((index) => snapshot.vertices[index]).filter(Boolean) as Vec3[];
    if (pts.length < 3) {
      continue;
    }
    const origin = pts[0]!;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const b = pts[i]!;
      const c = pts[i + 1]!;
      area += Math.abs((b[0] - origin[0]) * (c[1] - origin[1]) - (c[0] - origin[0]) * (b[1] - origin[1])) * 0.5;
    }
  }
  return area;
}

export function outlineErrorM(current: Vec3[], reference: Vec3[]): number {
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

export function validateBatGeometry(snapshot: MeshSnapshot, silhouette: Vec3[]): string[] {
  const errors: string[] = [];
  if (snapshot.faces.length === 0) {
    errors.push('no faces');
  }
  if (snapshotArea(snapshot) < 0.008) {
    errors.push('paper area collapsed');
  }
  const bounds = snapshotBounds(snapshot);
  if (bounds.maxX - bounds.minX < 0.12) {
    errors.push('wingspan too narrow');
  }
  if (bounds.maxY - bounds.minY < 0.05) {
    errors.push('body height too small');
  }
  const error = outlineErrorM(snapshot.vertices, silhouette);
  if (error > BAT_SHAPE_TOLERANCE_M) {
    errors.push(`silhouette miss ${error.toFixed(3)}m`);
  }
  return errors;
}
