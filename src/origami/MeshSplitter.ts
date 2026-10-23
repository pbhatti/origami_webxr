import { distance3 } from '../utils/math.ts';
import { rotateAroundHinge } from './CreaseSolver.ts';
import {
  CREASE_ALIGN_TOL_M,
  STACKED_FACE_TOL_M,
  add,
  copy3,
  creaseAlignmentErrorM,
  creaseAxis,
  distanceToSegment,
  pointOnHingeAxis,
  scale,
  segmentHitsInfiniteLine,
  sideOfCrease,
  stepCreaseLine,
  sub,
} from './creaseMath.ts';
import {
  hingeLayerMode,
  originalFaceId,
  resolveFoldLayerGroup,
  type FoldLayerGroup,
} from './foldLayerGroup.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, Vec3 } from './types.ts';
import { interpolatesMesh, stepActionType } from './types.ts';

export interface HingeDeformResult {
  snapshot: MeshSnapshot;
  movingFaceIds: Set<string>;
  stationaryFaceIds: Set<string>;
  movingVertexIds: Set<number>;
  stationaryVertexIds: Set<number>;
  creaseVertexIds: Set<number>;
}

function triangulate(indices: number[]): number[][] {
  if (indices.length === 3) {
    return [[indices[0]!, indices[1]!, indices[2]!]];
  }
  const tris: number[][] = [];
  for (let i = 1; i < indices.length - 1; i += 1) {
    const a = indices[0];
    const b = indices[i];
    const c = indices[i + 1];
    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }
    tris.push([a, b, c]);
  }
  return tris;
}

export function findOrInsertVertex(vertices: Vec3[], point: Vec3, tolM = CREASE_ALIGN_TOL_M): number {
  const existing = vertices.findIndex((vertex) => distance3(vertex, point) <= tolM);
  if (existing >= 0) {
    return existing;
  }
  vertices.push(copy3(point));
  return vertices.length - 1;
}

function faceCentroid(face: FaceDefinition, vertices: Vec3[]): Vec3 {
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

function pushUnique(poly: number[], index: number): void {
  if (poly[poly.length - 1] !== index) {
    poly.push(index);
  }
}

function closePoly(poly: number[]): number[] {
  if (poly.length > 1 && poly[0] === poly[poly.length - 1]) {
    poly.pop();
  }
  return poly;
}

function hitOnEdge(
  from: number,
  to: number,
  sa: number,
  sb: number,
  vertices: Vec3[],
  p0: Vec3,
  p1: Vec3,
): number | null {
  if (sa * sb >= 0) {
    return null;
  }
  const a = vertices[from];
  const b = vertices[to];
  if (!a || !b) {
    return null;
  }
  const hit =
    segmentHitsInfiniteLine(a, b, p0, p1) ??
    add(a, scale(sub(b, a), Math.abs(sa) / (Math.abs(sa) + Math.abs(sb))));
  return findOrInsertVertex(vertices, hit);
}

function splitTriangle(
  ia: number,
  ib: number,
  ic: number,
  vertices: Vec3[],
  p0: Vec3,
  p1: Vec3,
  movingHint?: Vec3,
): number[][] {
  const corners = [ia, ib, ic];
  const sides = corners.map((index) => {
    const vertex = vertices[index];
    return vertex ? sideOfCrease(vertex, p0, p1, movingHint) : 0;
  });
  if (!sides.includes(1) || !sides.includes(-1)) {
    return [[ia, ib, ic]];
  }

  const next = [ib, ic, ia];
  const nextSides = [sides[1]!, sides[2]!, sides[0]!];
  const collect = (target: 1 | -1): number[] => {
    const poly: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const from = corners[k]!;
      const to = next[k]!;
      const sa = sides[k]!;
      const sb = nextSides[k]!;
      if (sa === target || sa === 0) {
        pushUnique(poly, from);
      }
      const hit = hitOnEdge(from, to, sa, sb, vertices, p0, p1);
      if (hit != null) {
        pushUnique(poly, hit);
      }
    }
    return closePoly(poly);
  };

  const faces: number[][] = [];
  for (const target of [1, -1] as const) {
    const poly = collect(target);
    if (poly.length < 3) {
      continue;
    }
    for (let i = 1; i < poly.length - 1; i += 1) {
      faces.push([poly[0]!, poly[i]!, poly[i + 1]!]);
    }
  }
  return faces.length > 0 ? faces : [[ia, ib, ic]];
}

function extendCrease(p0: Vec3, p1: Vec3): [Vec3, Vec3] {
  const axis = creaseAxis(p0, p1);
  return [add(p0, scale(axis, -1)), add(p1, scale(axis, 1))];
}

export function splitSnapshotAlongCrease(
  snapshot: MeshSnapshot,
  p0: Vec3,
  p1: Vec3,
  movingHint?: Vec3,
): MeshSnapshot {
  const [split0, split1] = extendCrease(p0, p1);
  const vertices = snapshot.vertices.map((vertex) => copy3(vertex));
  findOrInsertVertex(vertices, p0);
  findOrInsertVertex(vertices, p1);
  const faces: FaceDefinition[] = [];
  let splitIndex = 0;
  for (const face of snapshot.faces) {
    const tris = triangulate(face.vertices);
    const children: number[][] = [];
    for (const tri of tris) {
      children.push(...splitTriangle(tri[0]!, tri[1]!, tri[2]!, vertices, split0, split1, movingHint));
    }
    if (children.length <= 1) {
      faces.push({ ...face, vertices: [...face.vertices] });
      continue;
    }
    children.forEach((indices, index) => {
      faces.push({
        ...face,
        id: `${face.id}:${splitIndex + index}`,
        vertices: indices,
      });
    });
    splitIndex += children.length;
  }
  return { ...snapshot, vertices, faces };
}

function movingHintFromFaces(snapshot: MeshSnapshot, hinge: HingeDefinition): Vec3 | undefined {
  const moving = new Set(hinge.movingFaces);
  const listed = snapshot.faces.filter((face) => moving.has(face.id));
  let best: Vec3 | undefined;
  let bestDistance = 0;
  for (const face of listed) {
    for (const index of face.vertices) {
      const vertex = snapshot.vertices[index];
      if (!vertex) {
        continue;
      }
      const distance = distanceToSegment(vertex, hinge.p0, hinge.p1);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = vertex;
      }
    }
  }
  if (best) {
    return best;
  }
  if (listed.length === 0) {
    return undefined;
  }
  let acc: Vec3 = [0, 0, 0];
  for (const face of listed) {
    acc = add(acc, faceCentroid(face, snapshot.vertices));
  }
  return scale(acc, 1 / listed.length);
}

function movingLayer(snapshot: MeshSnapshot, hinge: HingeDefinition): number | null {
  const moving = new Set(hinge.movingFaces);
  const listed = snapshot.faces.filter((face) => moving.has(face.id));
  if (listed.length === 0) {
    return null;
  }
  return listed[0]?.layer ?? null;
}

export function classifyMovingFaces(
  split: MeshSnapshot,
  original: MeshSnapshot,
  hinge: HingeDefinition,
  movingHint?: Vec3,
): Set<string> {
  const hint = movingHint ?? movingHintFromFaces(original, hinge);
  const layer = movingLayer(original, hinge);
  const originalMoving = new Set(hinge.movingFaces);
  const centroids = split.faces.map((face) => ({
    id: face.id,
    centroid: faceCentroid(face, split.vertices),
    originalId: originalFaceId(face.id),
    layer: face.layer,
  }));

  const moving = new Set<string>();
  const originalFixed = new Set(hinge.fixedFaces);
  const packet = hingeLayerMode(hinge) === 'packet';
  for (const face of centroids) {
    const stacked = centroids.some(
      (other) => other.id !== face.id && distance3(other.centroid, face.centroid) <= STACKED_FACE_TOL_M,
    );
    const side = sideOfCrease(face.centroid, hinge.p0, hinge.p1, hint);
    if (side < 0) {
      continue;
    }
    if (packet && originalFixed.has(face.originalId)) {
      continue;
    }
    if (side === 0 && !originalMoving.has(face.originalId)) {
      continue;
    }
    if (
      !packet &&
      stacked &&
      !originalMoving.has(face.originalId) &&
      !(layer != null && face.layer === layer)
    ) {
      continue;
    }
    moving.add(face.id);
  }
  return moving;
}

export function deformByHinge(
  fromSnap: MeshSnapshot,
  hinge: HingeDefinition,
  signedAngleDeg: number,
  movingHint?: Vec3,
): HingeDeformResult {
  const split = splitSnapshotAlongCrease(fromSnap, hinge.p0, hinge.p1, movingHint);
  const movingFaceIds = classifyMovingFaces(split, fromSnap, hinge, movingHint);
  const stationaryFaceIds = new Set(split.faces.filter((face) => !movingFaceIds.has(face.id)).map((face) => face.id));
  const creaseVertexIds = new Set<number>();
  const movingVertexIds = new Set<number>();
  const stationaryVertexIds = new Set<number>();

  split.vertices.forEach((vertex, index) => {
    if (pointOnHingeAxis(vertex, hinge.p0, hinge.p1)) {
      creaseVertexIds.add(index);
    }
  });

  for (const face of split.faces) {
    if (movingFaceIds.has(face.id)) {
      continue;
    }
    for (const index of face.vertices) {
      if (!creaseVertexIds.has(index)) {
        stationaryVertexIds.add(index);
      }
    }
  }
  for (const face of split.faces) {
    if (!movingFaceIds.has(face.id)) {
      continue;
    }
    for (const index of face.vertices) {
      if (!creaseVertexIds.has(index) && !stationaryVertexIds.has(index)) {
        movingVertexIds.add(index);
      }
    }
  }

  const vertices = split.vertices.map((vertex, index) =>
    movingVertexIds.has(index) ? rotateAroundHinge(vertex, hinge.p0, hinge.p1, signedAngleDeg) : copy3(vertex),
  );

  return {
    snapshot: { ...split, vertices },
    movingFaceIds,
    stationaryFaceIds,
    movingVertexIds,
    creaseVertexIds,
    stationaryVertexIds,
  };
}

export function applyHingeSnapshot(
  fromSnap: MeshSnapshot,
  hinge: HingeDefinition,
  direction: FoldStep['direction'] = 'valley',
  targetAngleDeg = 180,
  movingHint?: Vec3,
): MeshSnapshot {
  const signed = direction === 'valley' ? -targetAngleDeg : targetAngleDeg;
  const result = deformByHinge(fromSnap, hinge, signed, movingHint);
  const faces = result.snapshot.faces.map((face) =>
    result.movingFaceIds.has(face.id) ? { ...face, layer: face.layer + 1 } : face,
  );
  const namedOrder = ['L', 'RIGHT', 'T', 'B', 'O', 'PU', 'PL', 'TL', 'TR'];
  const named = fromSnap.named
    ? Object.fromEntries(
        Object.entries(fromSnap.named).map(([key, point]) => {
          const preferred = namedOrder.indexOf(key);
          const atPreferred = preferred >= 0 ? fromSnap.vertices[preferred] : undefined;
          const index =
            atPreferred && distance3(atPreferred, point) <= 0.02
              ? preferred
              : fromSnap.vertices.findIndex((vertex) => distance3(vertex, point) <= CREASE_ALIGN_TOL_M);
          if (index >= 0 && result.snapshot.vertices[index]) {
            return [key, copy3(result.snapshot.vertices[index]!)];
          }
          return [key, copy3(point)];
        }),
      )
    : fromSnap.named;
  return { ...result.snapshot, faces, named };
}

export function usesAxisAngleFold(step: FoldStep): boolean {
  if (stepActionType(step) === 'crease-press') {
    return false;
  }
  return !interpolatesMesh(step);
}

export interface FoldAxisDebug {
  hinge: [Vec3, Vec3];
  visual: [Vec3, Vec3];
  alignmentErrorM: number;
  mismatch: boolean;
  movingFaceIds: string[];
  stationaryFaceIds: string[];
  creaseVertexIds: number[];
  movingVertexIds: number[];
  snapshot: MeshSnapshot;
  foldGroup: FoldLayerGroup;
}

export function foldAxisDebug(step: FoldStep, fromSnap: MeshSnapshot, angleDeg: number): FoldAxisDebug {
  const signed = step.direction === 'valley' ? -angleDeg : angleDeg;
  const hint = step.targetLandmarks[0]?.sourceVertexId
    ? fromSnap.named?.[step.targetLandmarks[0].sourceVertexId]
    : undefined;
  const result = usesAxisAngleFold(step)
    ? deformByHinge(fromSnap, step.hinge, signed, hint)
    : {
        snapshot: fromSnap,
        movingFaceIds: new Set(step.hinge.movingFaces),
        stationaryFaceIds: new Set(step.hinge.fixedFaces),
        movingVertexIds: new Set<number>(),
        stationaryVertexIds: new Set<number>(),
        creaseVertexIds: new Set<number>(),
      };
  const alignmentErrorM = creaseAlignmentErrorM(step);
  const movingFaceIds = [...result.movingFaceIds];
  return {
    hinge: [step.hinge.p0, step.hinge.p1],
    visual: stepCreaseLine(step),
    alignmentErrorM,
    mismatch: alignmentErrorM > CREASE_ALIGN_TOL_M,
    movingFaceIds,
    stationaryFaceIds: [...result.stationaryFaceIds],
    creaseVertexIds: [...result.creaseVertexIds],
    movingVertexIds: [...result.movingVertexIds],
    snapshot: result.snapshot,
    foldGroup: resolveFoldLayerGroup(result.snapshot, movingFaceIds, step.hinge),
  };
}
