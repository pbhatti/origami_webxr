import { distance3, lerp3 } from '../utils/math.ts';
import { landmarkAfterHinge } from './CreaseSolver.ts';
import { silhouetteErrorM } from './FoldValidator.ts';
import { PAPER_SIZE_M } from './placement.ts';
import type { FaceDefinition, HingeDefinition, MeshSnapshot, Vec2, Vec3 } from './types.ts';

const RAD = (PAPER_SIZE_M / 2) * Math.SQRT2;

/** Outer corners of the diamond face, on the horizontal brow fold. */
export const FOX_FACE_LEFT: Vec3 = [-RAD / 2, RAD / 2, 0];
export const FOX_FACE_RIGHT: Vec3 = [RAD / 2, RAD / 2, 0];
export const FOX_NOSE: Vec3 = [0, 0, 0];
export const FOX_BROW_MID: Vec3 = [0, RAD / 2, 0];

const SIDE_LEFT: Vec3 = [-RAD, 0, 0];
const SIDE_RIGHT: Vec3 = [RAD, 0, 0];

/**
 * Ear creases cut the left/right kite wings off the stationary diamond TL–TR–O.
 * Inner ends sit on L–O / O–RIGHT so L and the nose fall on opposite sides of the
 * hinge. Outer ends sit on TL–L / TR–RIGHT, just below the brow corners, so the
 * remaining head corners stay put. An interior inner-base above L–O leaves the
 * cheek on the moving half-plane and the ear fold stretches it away.
 */
export const FOX_EAR_OUTER_T = 0.2;
export const FOX_EAR_INNER_X = 0.018;
export const FOX_EAR_INNER_Y = 0;
export const FOX_EAR_HINGE_LEFT: Vec3 = lerp3(FOX_FACE_LEFT, SIDE_LEFT, FOX_EAR_OUTER_T);
export const FOX_EAR_HINGE_RIGHT: Vec3 = lerp3(FOX_FACE_RIGHT, SIDE_RIGHT, FOX_EAR_OUTER_T);
export const FOX_EAR_INNER_LEFT: Vec3 = [-FOX_EAR_INNER_X, FOX_EAR_INNER_Y, 0];
export const FOX_EAR_INNER_RIGHT: Vec3 = [FOX_EAR_INNER_X, FOX_EAR_INNER_Y, 0];

const LEFT_EAR_HINGE: HingeDefinition = {
  id: 'ear-left',
  p0: FOX_EAR_HINGE_LEFT,
  p1: FOX_EAR_INNER_LEFT,
  fixedFaces: [],
  movingFaces: [],
};
const RIGHT_EAR_HINGE: HingeDefinition = {
  id: 'ear-right',
  p0: FOX_EAR_INNER_RIGHT,
  p1: FOX_EAR_HINGE_RIGHT,
  fixedFaces: [],
  movingFaces: [],
};

export const FOX_EAR_TIP_LEFT: Vec3 = landmarkAfterHinge(SIDE_LEFT, LEFT_EAR_HINGE, 180, 'valley');
export const FOX_EAR_TIP_RIGHT: Vec3 = landmarkAfterHinge(SIDE_RIGHT, RIGHT_EAR_HINGE, 180, 'valley');

export const FOX_EYE_X = 0.02;
export const FOX_EYE_Y = 0.038;
export const FOX_NOSE_MARK_Y = 0.013;
/** Local −Z faces the viewer after the sheet turns over. */
export const FOX_FEATURE_Z = -0.0032;

export type FoxSilhouetteId =
  | 'left-outer'
  | 'left-ear-tip'
  | 'left-inner'
  | 'right-inner'
  | 'right-ear-tip'
  | 'right-outer'
  | 'nose';

export interface FoxSilhouettePoint {
  id: FoxSilhouetteId;
  local: Vec3;
  normalized: Vec2;
}

export interface FoxFinalShape {
  points: FoxSilhouettePoint[];
  local: Vec3[];
  earHingeLeft: [Vec3, Vec3];
  earHingeRight: [Vec3, Vec3];
}

function normalize(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M, point[1] / PAPER_SIZE_M];
}

function point(id: FoxSilhouetteId, local: Vec3): FoxSilhouettePoint {
  return { id, local: [local[0], local[1], local[2]], normalized: normalize(local) };
}

function nearestUsed(snapshot: MeshSnapshot, target: Vec3): number {
  const used = new Set(snapshot.faces.flatMap((face) => face.vertices));
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of used) {
    const vertex = snapshot.vertices[index];
    if (!vertex) {
      continue;
    }
    const gap = distance3(vertex, target);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = index;
    }
  }
  return best;
}

/** The ear's inner corner is the face vertex next to the tip, closest to the hinge end. */
function notchVertex(snapshot: MeshSnapshot, tip: Vec3, hingeEnd: Vec3, corner: Vec3): Vec3 {
  const tipIndex = nearestUsed(snapshot, tip);
  const cornerIndex = nearestUsed(snapshot, corner);
  let best: Vec3 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const face of snapshot.faces) {
    if (!face.vertices.includes(tipIndex)) {
      continue;
    }
    for (const index of face.vertices) {
      if (index === tipIndex || index === cornerIndex) {
        continue;
      }
      const vertex = snapshot.vertices[index];
      if (!vertex) {
        continue;
      }
      const gap = distance3(vertex, hingeEnd);
      if (gap < bestDistance) {
        bestDistance = gap;
        best = vertex;
      }
    }
  }
  return best ? [best[0], best[1], best[2]] : [hingeEnd[0], hingeEnd[1], hingeEnd[2]];
}

/** Reads the folded paper. It does not move any vertex. */
export function installFoxFinalShape(snapshot: MeshSnapshot): void {
  const leftInner = notchVertex(snapshot, FOX_EAR_TIP_LEFT, FOX_EAR_INNER_LEFT, FOX_FACE_LEFT);
  const rightInner = notchVertex(snapshot, FOX_EAR_TIP_RIGHT, FOX_EAR_INNER_RIGHT, FOX_FACE_RIGHT);
  const locals: Array<[FoxSilhouetteId, Vec3]> = [
    ['left-outer', FOX_FACE_LEFT],
    ['left-ear-tip', FOX_EAR_TIP_LEFT],
    ['left-inner', leftInner],
    ['right-inner', rightInner],
    ['right-ear-tip', FOX_EAR_TIP_RIGHT],
    ['right-outer', FOX_FACE_RIGHT],
    ['nose', FOX_NOSE],
  ];
  FOX_FINAL_SHAPE.points = locals.map(([id, local]) => point(id, local));
  FOX_FINAL_SHAPE.local = FOX_FINAL_SHAPE.points.map((entry) => entry.local);
}

/** Canonical fox outline in the final paper plane. Measurements only — it does not replace the mesh. */
export const FOX_FINAL_SHAPE: FoxFinalShape = {
  points: [
    point('left-outer', FOX_FACE_LEFT),
    point('left-ear-tip', FOX_EAR_TIP_LEFT),
    point('left-inner', FOX_EAR_INNER_LEFT),
    point('right-inner', FOX_EAR_INNER_RIGHT),
    point('right-ear-tip', FOX_EAR_TIP_RIGHT),
    point('right-outer', FOX_FACE_RIGHT),
    point('nose', FOX_NOSE),
  ],
  local: [],
  earHingeLeft: [FOX_EAR_HINGE_LEFT, FOX_EAR_INNER_LEFT],
  earHingeRight: [FOX_EAR_INNER_RIGHT, FOX_EAR_HINGE_RIGHT],
};
FOX_FINAL_SHAPE.local = FOX_FINAL_SHAPE.points.map((entry) => entry.local);

export const FOX_SHAPE_TOLERANCE_M = 0.012;
export const FOX_MAX_EDGE_M = 0.165;

export const FOX_SHAPE_INSPECTOR = {
  enabled: true,
  expectedSilhouette: true,
  actualSilhouette: true,
  layerBoundaries: true,
  earHinges: true,
  vertices: true,
  symmetryAxis: true,
  faceOrientation: true,
  validationErrors: true,
  faceIds: false,
  highlightLowerLeft: true,
  highlightLowerRight: true,
  stationaryGroups: true,
  movingEarGroups: true,
  triangleNormals: false,
  disableBackfaceCulling: true,
  wireframe: false,
};

export const FOX_SHAPE_INSPECTOR_DEFAULTS = { ...FOX_SHAPE_INSPECTOR };

export function resetFoxShapeInspector(): void {
  Object.assign(FOX_SHAPE_INSPECTOR, FOX_SHAPE_INSPECTOR_DEFAULTS);
}

export interface FoxShapeReport {
  ok: boolean;
  errors: string[];
  earSymmetryM: number;
  earHeightM: number;
  gapM: number;
  headRatio: number;
  cornerDeltaY: number;
  noseOffsetX: number;
  degenerateTriangles: number;
  components: number;
  silhouetteErrorM: number;
  maxEdgeM: number;
  lowerLeftAreaM2: number;
  lowerRightAreaM2: number;
  projectedLeftOk: boolean;
  projectedRightOk: boolean;
}

export type FoxFaceRole = 'lower-left' | 'lower-right' | 'ear-left' | 'ear-right' | 'stationary-head' | 'other';

export interface FoxFoldGroups {
  movingFaceIds: string[];
  stationaryFaceIds: string[];
}

/** Interior samples of the left/right diamond cheeks, in the paper plane. */
export const FOX_LOWER_LEFT_SAMPLES: Vec3[] = [
  [-RAD / 6, RAD / 3, 0],
  [-0.018, 0.028, 0],
];
export const FOX_LOWER_RIGHT_SAMPLES: Vec3[] = [
  [RAD / 6, RAD / 3, 0],
  [0.018, 0.028, 0],
];

export function triangleContainsXY(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const v0: Vec2 = [c[0] - a[0], c[1] - a[1]];
  const v1: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const v2: Vec2 = [point[0] - a[0], point[1] - a[1]];
  const dot00 = v0[0] * v0[0] + v0[1] * v0[1];
  const dot01 = v0[0] * v1[0] + v0[1] * v1[1];
  const dot02 = v0[0] * v2[0] + v0[1] * v2[1];
  const dot11 = v1[0] * v1[0] + v1[1] * v1[1];
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1];
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-18) {
    return false;
  }
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6;
}

export function faceCoversPoint(snapshot: MeshSnapshot, face: FaceDefinition, point: Vec3): boolean {
  const verts = face.vertices.map((index) => snapshot.vertices[index]);
  if (verts.length < 3 || verts.some((vertex) => !vertex)) {
    return false;
  }
  const [a, b, c] = verts as [Vec3, Vec3, Vec3];
  return triangleArea(a, b, c) > 1e-7 && triangleContainsXY(point, a, b, c);
}

export function facesCoveringPoint(snapshot: MeshSnapshot, point: Vec3): FaceDefinition[] {
  return snapshot.faces.filter((face) => faceCoversPoint(snapshot, face, point));
}

export function foxPointCovered(snapshot: MeshSnapshot, point: Vec3): boolean {
  return facesCoveringPoint(snapshot, point).length > 0;
}

function coveringArea(snapshot: MeshSnapshot, samples: Vec3[]): number {
  const seen = new Set<string>();
  let area = 0;
  for (const sample of samples) {
    for (const face of facesCoveringPoint(snapshot, sample)) {
      if (seen.has(face.id)) {
        continue;
      }
      seen.add(face.id);
      const verts = face.vertices.map((index) => snapshot.vertices[index]);
      const [a, b, c] = verts as [Vec3, Vec3, Vec3];
      if (a && b && c) {
        area += triangleArea(a, b, c);
      }
    }
  }
  return area;
}

function samplesCovered(snapshot: MeshSnapshot, samples: Vec3[]): boolean {
  return samples.every((sample) => foxPointCovered(snapshot, sample));
}

export function foxFaceCentroid(snapshot: MeshSnapshot, face: FaceDefinition): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (const index of face.vertices) {
    const vertex = snapshot.vertices[index];
    if (!vertex) {
      continue;
    }
    x += vertex[0];
    y += vertex[1];
    z += vertex[2];
    count += 1;
  }
  return count === 0 ? [0, 0, 0] : [x / count, y / count, z / count];
}

export function foxFaceRole(snapshot: MeshSnapshot, face: FaceDefinition): FoxFaceRole {
  const leftTip = vertexNear(snapshot, FOX_EAR_TIP_LEFT);
  const rightTip = vertexNear(snapshot, FOX_EAR_TIP_RIGHT);
  if (leftTip >= 0 && face.vertices.includes(leftTip)) {
    return 'ear-left';
  }
  if (rightTip >= 0 && face.vertices.includes(rightTip)) {
    return 'ear-right';
  }
  const centroid = foxFaceCentroid(snapshot, face);
  if (triangleContainsXY(centroid, FOX_FACE_LEFT, FOX_NOSE, FOX_BROW_MID)) {
    return 'lower-left';
  }
  if (triangleContainsXY(centroid, FOX_FACE_RIGHT, FOX_BROW_MID, FOX_NOSE)) {
    return 'lower-right';
  }
  if (
    triangleContainsXY(centroid, FOX_FACE_LEFT, FOX_FACE_RIGHT, FOX_NOSE) ||
    (centroid[1] >= -0.002 && centroid[1] <= FOX_FACE_LEFT[1] + 0.002)
  ) {
    return 'stationary-head';
  }
  return 'other';
}

function nearest(snapshot: MeshSnapshot, target: Vec3): Vec3 | null {
  let best: Vec3 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const vertex of snapshot.vertices) {
    if (!vertex || !vertex.every(Number.isFinite)) {
      continue;
    }
    const gap = distance3(vertex, target);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = vertex;
    }
  }
  return best;
}

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
}

function componentCount(faces: FaceDefinition[]): number {
  const parent = new Map<number, number>();
  const find = (index: number): number => {
    const current = parent.get(index) ?? index;
    if (current === index) {
      parent.set(index, index);
      return index;
    }
    const root = find(current);
    parent.set(index, root);
    return root;
  };
  const unite = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(ra, rb);
    }
  };
  for (const face of faces) {
    const [first, ...rest] = face.vertices;
    if (first === undefined) {
      continue;
    }
    find(first);
    for (const index of rest) {
      unite(first, index);
    }
  }
  const roots = new Set<number>();
  for (const index of parent.keys()) {
    roots.add(find(index));
  }
  return roots.size;
}

function vertexNear(snapshot: MeshSnapshot, target: Vec3, tolerance = FOX_SHAPE_TOLERANCE_M): number {
  return snapshot.vertices.findIndex((vertex) => distance3(vertex, target) <= tolerance);
}

function edgeNeighbors(snapshot: MeshSnapshot): Map<number, number[]> {
  const neighbors = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const list = neighbors.get(a) ?? [];
    list.push(b);
    neighbors.set(a, list);
  };
  for (const face of snapshot.faces) {
    const indices = face.vertices;
    for (let i = 0; i < indices.length; i += 1) {
      const a = indices[i];
      const b = indices[(i + 1) % indices.length];
      if (a === undefined || b === undefined) {
        continue;
      }
      link(a, b);
      link(b, a);
    }
  }
  return neighbors;
}

function reaches(snapshot: MeshSnapshot, from: Vec3, to: Vec3): boolean {
  const start = vertexNear(snapshot, from);
  const goal = vertexNear(snapshot, to);
  if (start < 0 || goal < 0) {
    return false;
  }
  const neighbors = edgeNeighbors(snapshot);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    if (current === goal) {
      return true;
    }
    for (const next of neighbors.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function validateFoxGeometry(snapshot: MeshSnapshot): FoxShapeReport {
  const errors: string[] = [];
  const leftTip = nearest(snapshot, FOX_EAR_TIP_LEFT);
  const rightTip = nearest(snapshot, FOX_EAR_TIP_RIGHT);
  const leftCorner = nearest(snapshot, FOX_FACE_LEFT);
  const rightCorner = nearest(snapshot, FOX_FACE_RIGHT);
  const leftInner = nearest(snapshot, FOX_EAR_INNER_LEFT);
  const rightInner = nearest(snapshot, FOX_EAR_INNER_RIGHT);
  const nose = nearest(snapshot, FOX_NOSE);

  const earSymmetryM =
    leftTip && rightTip ? Math.hypot(leftTip[0] + rightTip[0], leftTip[1] - rightTip[1]) : Number.POSITIVE_INFINITY;
  const earHeightM = leftTip && leftCorner ? leftTip[1] - leftCorner[1] : 0;
  const gapM = leftInner && rightInner ? rightInner[0] - leftInner[0] : 0;
  const cornerDeltaY = leftCorner && rightCorner ? Math.abs(leftCorner[1] - rightCorner[1]) : Number.POSITIVE_INFINITY;
  const noseOffsetX = nose ? Math.abs(nose[0]) : Number.POSITIVE_INFINITY;
  const faceWidth = leftCorner && rightCorner ? rightCorner[0] - leftCorner[0] : 0;
  const faceHeight = leftCorner && nose ? leftCorner[1] - nose[1] : 0;
  const headRatio = faceHeight > 1e-6 ? faceWidth / faceHeight : 0;

  if (earSymmetryM > 0.004) {
    errors.push('ears are not symmetrical');
  }
  if (!leftTip || !rightTip || leftTip[1] <= FOX_FACE_LEFT[1] + 0.04 || rightTip[1] <= FOX_FACE_RIGHT[1] + 0.04) {
    errors.push('ear tips are not above the face fold');
  }
  if (noseOffsetX > 0.004) {
    errors.push('nose is off the center axis');
  }
  if (cornerDeltaY > 0.004) {
    errors.push('face corners are not level');
  }
  if (gapM < 0.02 || gapM > 0.08) {
    errors.push('gap between the ears is outside the narrow range');
  }
  if (headRatio < 1.6 || headRatio > 2.4) {
    errors.push('head width-to-height ratio is off');
  }

  let degenerateTriangles = 0;
  let maxEdgeM = 0;
  for (const face of snapshot.faces) {
    const verts = face.vertices.map((index) => snapshot.vertices[index]);
    if (verts.length < 3 || verts.some((vertex) => !vertex || !vertex.every(Number.isFinite))) {
      degenerateTriangles += 1;
      errors.push(`invalid face ${face.id}`);
      continue;
    }
    const [a, b, c] = verts as [Vec3, Vec3, Vec3];
    if (triangleArea(a, b, c) < 1e-7) {
      degenerateTriangles += 1;
    }
    for (let i = 0; i < verts.length; i += 1) {
      const from = verts[i];
      const to = verts[(i + 1) % verts.length];
      if (from && to) {
        maxEdgeM = Math.max(maxEdgeM, distance3(from, to));
      }
    }
  }
  if (degenerateTriangles > 0) {
    errors.push('degenerate triangles');
  }
  if (maxEdgeM > FOX_MAX_EDGE_M) {
    errors.push('a folded edge is stretched');
  }

  const components = snapshot.faces.length === 0 ? 0 : componentCount(snapshot.faces);
  if (components !== 1) {
    errors.push('paper is disconnected');
  }
  const leftInnerPoint = FOX_FINAL_SHAPE.points.find((entry) => entry.id === 'left-inner')?.local ?? FOX_EAR_INNER_LEFT;
  const rightInnerPoint = FOX_FINAL_SHAPE.points.find((entry) => entry.id === 'right-inner')?.local ?? FOX_EAR_INNER_RIGHT;
  if (!reaches(snapshot, FOX_EAR_TIP_LEFT, leftInnerPoint) || !reaches(snapshot, FOX_EAR_TIP_LEFT, FOX_FACE_LEFT)) {
    errors.push('left ear is not attached to the head');
  }
  if (!reaches(snapshot, FOX_EAR_TIP_RIGHT, rightInnerPoint) || !reaches(snapshot, FOX_EAR_TIP_RIGHT, FOX_FACE_RIGHT)) {
    errors.push('right ear is not attached to the head');
  }
  const leftTipIndex = vertexNear(snapshot, FOX_EAR_TIP_LEFT);
  const rightTipIndex = vertexNear(snapshot, FOX_EAR_TIP_RIGHT);
  const earsShareFace = snapshot.faces.some(
    (face) => face.vertices.includes(leftTipIndex) && face.vertices.includes(rightTipIndex),
  );
  if (leftTipIndex >= 0 && rightTipIndex >= 0 && earsShareFace) {
    errors.push('the ears share a triangle');
  }

  const earTipIndex = leftTipIndex;
  const noseIndex = vertexNear(snapshot, FOX_NOSE, 0.004);
  const earLayer = Math.max(
    0,
    ...snapshot.faces.filter((face) => face.vertices.includes(earTipIndex)).map((face) => face.layer),
  );
  const centerLayer = Math.min(
    ...snapshot.faces
      .filter((face) => face.vertices.includes(noseIndex) && !face.vertices.includes(earTipIndex))
      .map((face) => face.layer),
  );
  if (!Number.isFinite(centerLayer) || earLayer < centerLayer) {
    errors.push('ear layer is behind the face');
  }

  const silhouetteError = silhouetteErrorM(snapshot.vertices, FOX_FINAL_SHAPE.local);
  if (silhouetteError > FOX_SHAPE_TOLERANCE_M) {
    errors.push('silhouette misses the canonical fox');
  }

  const lowerLeftAreaM2 = coveringArea(snapshot, FOX_LOWER_LEFT_SAMPLES);
  const lowerRightAreaM2 = coveringArea(snapshot, FOX_LOWER_RIGHT_SAMPLES);
  const projectedLeftOk = samplesCovered(snapshot, FOX_LOWER_LEFT_SAMPLES);
  const projectedRightOk = samplesCovered(snapshot, FOX_LOWER_RIGHT_SAMPLES);
  if (!projectedLeftOk || lowerLeftAreaM2 < 1e-5) {
    errors.push('lower-left face is missing');
  }
  if (!projectedRightOk || lowerRightAreaM2 < 1e-5) {
    errors.push('lower-right face is missing');
  }

  return {
    ok: errors.length === 0,
    errors,
    earSymmetryM,
    earHeightM,
    gapM,
    headRatio,
    cornerDeltaY,
    noseOffsetX,
    degenerateTriangles,
    components,
    silhouetteErrorM: silhouetteError,
    maxEdgeM,
    lowerLeftAreaM2,
    lowerRightAreaM2,
    projectedLeftOk,
    projectedRightOk,
  };
}
