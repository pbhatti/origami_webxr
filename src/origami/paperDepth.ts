import type { MeshSnapshot, Vec3 } from './types.ts';

/** Physical sheet thickness. Inside the 0.3–0.6 mm craft-paper range. */
export const PAPER_THICKNESS_M = 0.0004;
/**
 * Pitch between stacked fold layers. Larger than the sheet so overlapping
 * flaps stay apart without reading as cardboard.
 */
export const PAPER_LAYER_GAP_M = 0.0008;
/** Colored border inset along the real perimeter of each side. About 0.8% of a 20 cm sheet. */
export const PAPER_EDGE_WIDTH_M = 0.0016;

/** Adjustable folded-paper depth. Debug panel writes these live. */
export const PAPER_DEPTH = {
  shadows: true,
  showLayerBounds: false,
  showCreaseAxes: false,
  showPivot: false,
  twoHand: true,
  showShadowMeshes: true,
  thicknessM: PAPER_THICKNESS_M,
  layerSeparationM: PAPER_LAYER_GAP_M,
  contactShadowOpacity: 0.25,
  shadowSoftnessM: 0.003,
  foldEdgeShading: 0.35,
  roughness: 0.92,
};

export const PAPER_DEPTH_DEFAULTS = { ...PAPER_DEPTH };

export function resetPaperDepth(): void {
  Object.assign(PAPER_DEPTH, PAPER_DEPTH_DEFAULTS);
}

/** Rebuild key for everything that changes the paper or shadow geometry. */
export function paperDepthToken(): string {
  const depth = PAPER_DEPTH;
  return [
    depth.shadows ? 1 : 0,
    depth.thicknessM.toFixed(6),
    depth.layerSeparationM.toFixed(6),
    depth.shadowSoftnessM.toFixed(6),
    depth.foldEdgeShading.toFixed(3),
  ].join('|');
}

export interface PaperGeometryGroup {
  start: number;
  count: number;
  materialIndex: number;
}

export interface PaperMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  groups: PaperGeometryGroup[];
  layerLines: Float32Array;
  creaseLines: Float32Array;
  shadowPositions: Float32Array;
  shadowColors: Float32Array;
  faceCount: number;
  thicknessM: number;
  separationM: number;
}

interface SurfaceBucket {
  positions: number[];
  normals: number[];
}

const SHADOW_LIFT_M = 0.00016;
const BORDER_LIFT_M = 0.00004;
/** An edge this close to a higher sheet is treated as covered by it. */
const COVER_TOLERANCE_M = 0.00015;

interface RawFace {
  indices: number[];
  points: Vec3[];
  normal: Vec3;
  layer: number;
  centroid: Vec3;
}

interface BuiltFace extends RawFace {
  frontDir: Vec3;
  base: Vec3[];
  front: Vec3[];
  back: Vec3[];
}

/**
 * Extrude every polygon into a thin shell and stack higher layers along one
 * consistent direction. Face windings flip after a valley fold; stacking along
 * each face normal pushes those flaps behind the sheet, which is why completed
 * origami was reading as one flat color.
 */
export function buildPaperMesh(snapshot: MeshSnapshot, shadows = PAPER_DEPTH.shadows): PaperMeshBuffers {
  const thickness = PAPER_DEPTH.thicknessM;
  const separation = Math.max(PAPER_DEPTH.layerSeparationM, thickness + 0.00015);
  const front = emptyBucket();
  const back = emptyBucket();
  const edge = emptyBucket();
  const layerLines: number[] = [];
  const creaseLines: number[] = [];
  const shadowPositions: number[] = [];
  const shadowColors: number[] = [];
  const raw = rawFaces(snapshot);
  const stack = stackNormal(raw);
  const faces = raw.map((face) => buildShell(face, stack, thickness, separation));

  for (const face of faces) {
    const paperFrontFacesViewer = dot(face.normal, stack) >= 0;
    pushFan(paperFrontFacesViewer ? front : back, face.front, face.frontDir, false);
    pushFan(paperFrontFacesViewer ? back : front, face.back, face.frontDir, true);
    pushWalls(edge, face, faces);
    pushSurfaceBorders(edge, face, faces, stack, separation, thickness);
    pushLoop(layerLines, face.front);
  }

  pushCreases(edge, creaseLines, faces, stack, separation);
  if (shadows) {
    pushContactShadows(shadowPositions, shadowColors, faces, stack, separation, thickness);
  }

  const packed = packBuckets([front, back, edge]);
  return {
    positions: packed.positions,
    normals: packed.normals,
    groups: packed.groups,
    layerLines: new Float32Array(layerLines),
    creaseLines: new Float32Array(creaseLines),
    shadowPositions: new Float32Array(shadowPositions),
    shadowColors: new Float32Array(shadowColors),
    faceCount: faces.length,
    thicknessM: thickness,
    separationM: separation,
  };
}

function emptyBucket(): SurfaceBucket {
  return { positions: [], normals: [] };
}

function packBuckets(buckets: SurfaceBucket[]): {
  positions: Float32Array;
  normals: Float32Array;
  groups: PaperGeometryGroup[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const groups: PaperGeometryGroup[] = [];
  buckets.forEach((bucket, materialIndex) => {
    const count = bucket.positions.length / 3;
    if (count === 0) {
      return;
    }
    groups.push({ start: positions.length / 3, count, materialIndex });
    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    groups,
  };
}

function rawFaces(snapshot: MeshSnapshot): RawFace[] {
  const faces: RawFace[] = [];
  for (const face of snapshot.faces) {
    const indexed = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [{ index, point }] : [];
    });
    if (indexed.length < 3) {
      continue;
    }
    const points = indexed.map((entry) => entry.point);
    const normal = polygonNormal(points);
    if (!normal) {
      continue;
    }
    faces.push({
      indices: indexed.map((entry) => entry.index),
      points,
      normal,
      layer: face.layer,
      centroid: average(points),
    });
  }
  return faces;
}

function stackNormal(faces: RawFace[]): Vec3 {
  const minLayer = faces.reduce((min, face) => Math.min(min, face.layer), Number.POSITIVE_INFINITY);
  let acc: Vec3 = [0, 0, 0];
  for (const face of faces) {
    if (face.layer !== minLayer) {
      continue;
    }
    acc = addVec(acc, face.normal[2] >= 0 ? face.normal : scaleVec(face.normal, -1));
  }
  const normal = normalize(acc) ?? [0, 0, 1];
  return normal[2] < 0 ? scaleVec(normal, -1) : normal;
}

function buildShell(face: RawFace, stack: Vec3, thickness: number, separation: number): BuiltFace {
  const frontDir = dot(face.normal, stack) >= 0 ? face.normal : scaleVec(face.normal, -1);
  const lift = face.layer * separation;
  const base = face.points.map((point) => offset(point, stack, lift));
  return {
    ...face,
    frontDir,
    base,
    front: base.map((point) => offset(point, frontDir, thickness)),
    back: base,
  };
}

function pushCreases(
  bucket: SurfaceBucket,
  creaseLines: number[],
  faces: BuiltFace[],
  stack: Vec3,
  separation: number,
): void {
  for (const edge of sharedEdges(faces)) {
    if (edge.owners.length < 2) {
      continue;
    }
    const start = vertexOn(faces, edge.owners[0] ?? -1, edge.a);
    const end = vertexOn(faces, edge.owners[0] ?? -1, edge.b);
    if (start && end) {
      creaseLines.push(start[0], start[1], start[2], end[0], end[1], end[2]);
    }
    const faceA = faces[edge.owners[0] ?? -1];
    const faceB = faces[edge.owners[1] ?? -1];
    if (!faceA || !faceB || faceA.layer === faceB.layer) {
      continue;
    }
    const hingeA = hingePoints(faceA, edge.a, edge.b, stack, separation);
    const hingeB = hingePoints(faceB, edge.a, edge.b, stack, separation);
    if (!hingeA || !hingeB) {
      continue;
    }
    if (distance(hingeA[0], hingeB[0]) < 0.00005 && distance(hingeA[1], hingeB[1]) < 0.00005) {
      continue;
    }
    const bridge = normalize(addVec(faceA.frontDir, faceB.frontDir)) ?? faceA.frontDir;
    pushQuad(bucket, hingeA[0], hingeA[1], hingeB[1], hingeB[0], bridge);
  }
}

function hingePoints(
  face: BuiltFace,
  startIndex: number,
  endIndex: number,
  stack: Vec3,
  separation: number,
): [Vec3, Vec3] | null {
  const start = face.points[face.indices.indexOf(startIndex)];
  const end = face.points[face.indices.indexOf(endIndex)];
  if (!start || !end) {
    return null;
  }
  const lift = face.layer * separation;
  const backStart = face.back.find((point) => near(point, offset(start, stack, lift)));
  const backEnd = face.back.find((point) => near(point, offset(end, stack, lift)));
  if (!backStart || !backEnd) {
    return null;
  }
  return [backStart, backEnd];
}

function pushContactShadows(
  positions: number[],
  colors: number[],
  faces: BuiltFace[],
  stack: Vec3,
  separation: number,
  thickness: number,
): void {
  const softness = Math.min(Math.max(PAPER_DEPTH.shadowSoftnessM, 0.0004), 0.012);
  const edges = sharedEdges(faces);
  for (const edge of edges) {
    const owners = edge.owners.map((index) => faces[index]).filter((face): face is BuiltFace => Boolean(face));
    if (owners.length === 0) {
      continue;
    }
    const higher = owners.reduce((best, face) => (face.layer > best.layer ? face : best), owners[0]!);
    const lower = owners.reduce((best, face) => (face.layer < best.layer ? face : best), owners[0]!);
    // A crease shared by one sheet is an internal triangulation edge, not an overlap.
    if (owners.length >= 2 && higher.layer - lower.layer < 0.05) {
      continue;
    }
    const a = pointFor(higher, edge.a);
    const b = pointFor(higher, edge.b);
    if (!a || !b || distance(a, b) < 0.002 || distance(a, b) > 0.45) {
      continue;
    }
    const outward = edgeOutward(a, b, higher.centroid, higher.frontDir);
    if (!outward) {
      continue;
    }
    // Contact only where this flap actually lies on a lower sheet.
    const into = addVec(average([a, b]), scaleVec(outward, -0.0016));
    const receiver = receiverUnder(faces, higher, into, stack, separation, thickness);
    if (!receiver) {
      continue;
    }
    // The visible shadow is the band just outside the flap, on paper nothing else covers.
    const probe = Math.min(Math.max(softness * 0.35, 0.00045), 0.0016);
    const slide = scaleVec(outward, probe);
    const occluded = coveringFaces(faces, receiver, stack, separation, thickness);
    const exposed = exposedSegments(a, b, occluded, stack, slide).filter(([start, end]) => {
      const sample = addVec(average([start, end]), slide);
      return polygonHolds(receiver, sample, stack, probe);
    });
    for (const [start, end] of exposed) {
      pushReceiverStrip(positions, colors, higher, receiver, start, end, softness, stack);
    }
  }
}

function coveringFaces(
  faces: BuiltFace[],
  face: BuiltFace,
  stack: Vec3,
  separation: number,
  thickness: number,
): BuiltFace[] {
  return faces.filter((other) => {
    if (other === face || other.layer <= face.layer + 0.05) {
      return false;
    }
    if (Math.abs(dot(other.frontDir, face.frontDir)) < 0.82) {
      return false;
    }
    const expected = (other.layer - face.layer) * separation;
    return Math.abs(dot(sub(other.centroid, face.centroid), stack)) <= expected + thickness + 0.004;
  });
}

function exposedSegments(
  a: Vec3,
  b: Vec3,
  covers: BuiltFace[],
  stack: Vec3,
  slide: Vec3 = [0, 0, 0],
): Array<[Vec3, Vec3]> {
  if (covers.length === 0) {
    return [[a, b]];
  }
  const { u, v } = planeBasis(stack);
  const a2 = project(addVec(a, slide), a, u, v);
  const b2 = project(addVec(b, slide), a, u, v);
  const covered: Array<[number, number]> = [];
  for (const cover of covers) {
    const polygon = ensureCcw(cover.base.map((point) => project(point, a, u, v)));
    covered.push(...segmentInsidePolygon(a2, b2, polygon));
  }
  const hidden = mergeIntervals(covered);
  const parts: Array<[Vec3, Vec3]> = [];
  let cursor = 0;
  const emit = (from: number, to: number) => {
    if (to - from < 0.015) {
      return;
    }
    const start = lerpVec(a, b, from);
    const end = lerpVec(a, b, to);
    if (distance(start, end) >= 0.002) {
      parts.push([start, end]);
    }
  };
  for (const [start, end] of hidden) {
    emit(cursor, start);
    cursor = Math.max(cursor, end);
  }
  emit(cursor, 1);
  return parts;
}

function segmentInsidePolygon(
  a: [number, number],
  b: [number, number],
  polygon: Array<[number, number]>,
): Array<[number, number]> {
  const samples = [0, 1];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) {
      continue;
    }
    const t = segmentParam(a, b, start, end);
    if (t !== null && t > 1e-4 && t < 1 - 1e-4) {
      samples.push(t);
    }
  }
  samples.sort((left, right) => left - right);
  const spans: Array<[number, number]> = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const from = samples[index] ?? 0;
    const to = samples[index + 1] ?? from;
    if (to - from < 1e-4) {
      continue;
    }
    const midT = (from + to) / 2;
    const mid: [number, number] = [a[0] + (b[0] - a[0]) * midT, a[1] + (b[1] - a[1]) * midT];
    if (pointInPolygon(mid[0], mid[1], polygon) || distanceToPolygon(mid, polygon) <= COVER_TOLERANCE_M) {
      spans.push([from, to]);
    }
  }
  return mergeIntervals(spans);
}

function segmentParam(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom;
  if (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4) {
    return null;
  }
  return Math.min(Math.max(t, 0), 1);
}

function mergeIntervals(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = spans
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)] as [number, number])
    .filter(([start, end]) => end - start > 1e-5)
    .sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (!last || span[0] > last[1] + 1e-4) {
      merged.push([span[0], span[1]]);
    } else {
      last[1] = Math.max(last[1], span[1]);
    }
  }
  return merged;
}

function receiverUnder(
  faces: BuiltFace[],
  upper: BuiltFace,
  point: Vec3,
  stack: Vec3,
  separation: number,
  thickness: number,
): BuiltFace | null {
  let best: BuiltFace | null = null;
  for (const face of faces) {
    if (face === upper || face.layer >= upper.layer) {
      continue;
    }
    if (Math.abs(dot(face.frontDir, upper.frontDir)) < 0.82) {
      continue;
    }
    const expected = (upper.layer - face.layer) * separation;
    if (Math.abs(dot(sub(upper.centroid, face.centroid), stack)) > expected + thickness + 0.004) {
      continue;
    }
    if (!polygonHolds(face, point, stack, 0.001)) {
      continue;
    }
    if (!best || face.layer > best.layer) {
      best = face;
    }
  }
  return best;
}

function pushReceiverStrip(
  positions: number[],
  colors: number[],
  upper: BuiltFace,
  lower: BuiltFace,
  a: Vec3,
  b: Vec3,
  softness: number,
  stack: Vec3,
): void {
  const outward = edgeOutward(a, b, upper.centroid, stack) ?? edgeOutward(a, b, upper.centroid, upper.frontDir);
  const origin = lower.front[0];
  if (!outward || !origin) {
    return;
  }
  // Start on the receiving surface at the overlap edge. The band falls outward
  // onto paper the flap does not cover, so it never paints the flap's own front.
  const a0 = projectToPlane(a, origin, lower.frontDir);
  const b0 = projectToPlane(b, origin, lower.frontDir);
  const a1 = addVec(projectToPlane(a, origin, lower.frontDir), scaleVec(outward, softness));
  const b1 = addVec(projectToPlane(b, origin, lower.frontDir), scaleVec(outward, softness));
  const { u, v } = planeBasis(lower.frontDir);
  const quad = [a0, b0, b1, a1].map((point) => project(point, origin, u, v));
  const clip = lower.front.map((point) => project(point, origin, u, v));
  const clipped = clipPolygon(ensureCcw(quad), ensureCcw(clip));
  if (clipped.length < 3) {
    return;
  }
  const edgeA = project(a0, origin, u, v);
  const edgeB = project(b0, origin, u, v);
  const lifted = clipped.map((point) => offset(unproject(point, origin, u, v), lower.frontDir, SHADOW_LIFT_M));
  const alphas = clipped.map((point) => falloff(point, edgeA, edgeB, softness));
  pushFanAlpha(positions, colors, lifted, alphas);
}

function sharedEdges(faces: BuiltFace[]): Array<{ a: number; b: number; owners: number[] }> {
  const shared = new Map<string, { a: number; b: number; owners: number[] }>();
  faces.forEach((face, faceIndex) => {
    for (let i = 0; i < face.indices.length; i += 1) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % face.indices.length];
      if (a === undefined || b === undefined || a === b) {
        continue;
      }
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const entry = shared.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), owners: [] };
      if (!entry.owners.includes(faceIndex)) {
        entry.owners.push(faceIndex);
      }
      shared.set(key, entry);
    }
  });
  return [...shared.values()];
}

function pointFor(face: BuiltFace, index: number): Vec3 | null {
  const slot = face.indices.indexOf(index);
  return slot >= 0 ? (face.base[slot] ?? null) : null;
}

function vertexOn(faces: BuiltFace[], faceIndex: number, vertexIndex: number): Vec3 | null {
  const face = faces[faceIndex];
  return face ? pointFor(face, vertexIndex) : null;
}

function polygonHolds(face: BuiltFace, point: Vec3, stack: Vec3, tolerance: number): boolean {
  const origin = face.base[0] ?? face.centroid;
  const { u, v } = planeBasis(stack);
  const sample = project(point, origin, u, v);
  const polygon = face.base.map((corner) => project(corner, origin, u, v));
  if (pointInPolygon(sample[0], sample[1], polygon)) {
    return true;
  }
  return distanceToPolygon(sample, polygon) <= tolerance;
}

function edgeOutward(a: Vec3, b: Vec3, awayFrom: Vec3, normal: Vec3): Vec3 | null {
  const side = normalize(cross(normal, sub(b, a)));
  if (!side) {
    return null;
  }
  const mid = average([a, b]);
  return dot(side, sub(awayFrom, mid)) > 0 ? scaleVec(side, -1) : side;
}

function falloff(point: [number, number], a: [number, number], b: [number, number], softness: number): number {
  const span = Math.max(softness, 0.0001);
  return Math.min(Math.max(1 - distanceToSegment(point, a, b) / span, 0), 1);
}

function pushFan(bucket: SurfaceBucket, ring: Vec3[], normal: Vec3, reverse: boolean): void {
  const origin = ring[0];
  if (!origin) {
    return;
  }
  const wound = reverse ? ([-normal[0], -normal[1], -normal[2]] as Vec3) : normal;
  for (let i = 1; i < ring.length - 1; i += 1) {
    const b = ring[i];
    const c = ring[i + 1];
    if (!b || !c) {
      continue;
    }
    if (reverse) {
      pushTri(bucket, origin, c, b, wound);
    } else {
      pushTri(bucket, origin, b, c, wound);
    }
  }
}

function sameSheetEdge(face: BuiltFace, a: number, b: number, faces: BuiltFace[]): boolean {
  const aPoint = face.base[face.indices.indexOf(a)];
  const bPoint = face.base[face.indices.indexOf(b)];
  return faces.some((other) => {
    if (other === face || Math.abs(other.layer - face.layer) > 0.05) {
      return false;
    }
    if (Math.abs(dot(other.frontDir, face.frontDir)) < 0.82) {
      return false;
    }
    for (let index = 0; index < other.indices.length; index += 1) {
      const start = other.indices[index];
      const end = other.indices[(index + 1) % other.indices.length];
      const sharesIndex = (start === a && end === b) || (start === b && end === a);
      if (sharesIndex) {
        return true;
      }
      const startPoint = other.base[index];
      const endPoint = other.base[(index + 1) % other.base.length];
      if (!aPoint || !bPoint || !startPoint || !endPoint) {
        continue;
      }
      const forward = distance(startPoint, aPoint) < 0.00025 && distance(endPoint, bPoint) < 0.00025;
      const reverse = distance(startPoint, bPoint) < 0.00025 && distance(endPoint, aPoint) < 0.00025;
      if (forward || reverse) {
        return true;
      }
    }
    return false;
  });
}

function pushSurfaceBorders(
  bucket: SurfaceBucket,
  face: BuiltFace,
  faces: BuiltFace[],
  stack: Vec3,
  separation: number,
  thickness: number,
): void {
  const covers = coveringFaces(faces, face, stack, separation, thickness);
  for (let index = 0; index < face.base.length; index += 1) {
    const next = (index + 1) % face.base.length;
    const indexA = face.indices[index];
    const indexB = face.indices[next];
    const a = face.base[index];
    const b = face.base[next];
    if (!a || !b || indexA === undefined || indexB === undefined || sameSheetEdge(face, indexA, indexB, faces)) {
      continue;
    }
    if (distance(a, b) < 0.002) {
      continue;
    }
    const outward = edgeOutward(a, b, face.centroid, face.frontDir);
    if (!outward) {
      continue;
    }
    const inset = Math.min(PAPER_EDGE_WIDTH_M, distance(average([a, b]), face.centroid) * 0.42);
    if (inset < 0.0003) {
      continue;
    }
    for (const [start, end] of exposedSegments(a, b, covers, stack)) {
      pushBorder(bucket, start, end, outward, face.frontDir, inset, thickness + BORDER_LIFT_M);
      pushBorder(bucket, start, end, outward, face.frontDir, inset, -BORDER_LIFT_M);
    }
  }
}

function pushBorder(
  bucket: SurfaceBucket,
  a: Vec3,
  b: Vec3,
  outward: Vec3,
  normal: Vec3,
  width: number,
  lift: number,
): void {
  const onFront = lift > 0;
  const a0 = offset(a, normal, lift);
  const b0 = offset(b, normal, lift);
  const inward = scaleVec(outward, -width);
  const a1 = addVec(a0, inward);
  const b1 = addVec(b0, inward);
  if (onFront) {
    pushQuad(bucket, a0, a1, b1, b0, normal);
  } else {
    pushQuad(bucket, a0, b0, b1, a1, scaleVec(normal, -1));
  }
}

function pushWalls(
  bucket: SurfaceBucket,
  face: BuiltFace,
  faces: BuiltFace[],
): void {
  for (let i = 0; i < face.front.length; i += 1) {
    const next = (i + 1) % face.front.length;
    const frontA = face.front[i];
    const frontB = face.front[next];
    const backB = face.back[next];
    const backA = face.back[i];
    const indexA = face.indices[i];
    const indexB = face.indices[next];
    if (!frontA || !frontB || !backA || !backB || indexA === undefined || indexB === undefined) {
      continue;
    }
    // An edge shared by the same sheet is a triangulation seam. Its wall would
    // read as a dark triangle line across paper that is actually continuous.
    if (sameSheetEdge(face, indexA, indexB, faces)) {
      continue;
    }
    const outward = normalize(cross(sub(frontB, frontA), sub(backA, frontA))) ?? face.frontDir;
    const towardCenter = dot(outward, sub(face.centroid, frontA));
    if (towardCenter > 0) {
      pushQuad(bucket, frontA, backA, backB, frontB, scaleVec(outward, -1));
    } else {
      pushQuad(bucket, frontA, frontB, backB, backA, outward);
    }
  }
}

function pushQuad(bucket: SurfaceBucket, a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3): void {
  pushTri(bucket, a, b, c, normal);
  pushTri(bucket, a, c, d, normal);
}

function pushTri(bucket: SurfaceBucket, a: Vec3, b: Vec3, c: Vec3, normal: Vec3): void {
  bucket.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  bucket.normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);
}

function pushAlphaTri(
  positions: number[],
  colors: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  alphaA: number,
  alphaB: number,
  alphaC: number,
): void {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  colors.push(1, 1, 1, alphaA, 1, 1, 1, alphaB, 1, 1, 1, alphaC);
}

function pushFanAlpha(positions: number[], colors: number[], ring: Vec3[], alphas: number[]): void {
  const origin = ring[0];
  const originAlpha = alphas[0] ?? 0;
  if (!origin) {
    return;
  }
  for (let i = 1; i < ring.length - 1; i += 1) {
    const b = ring[i];
    const c = ring[i + 1];
    if (!b || !c) {
      continue;
    }
    pushAlphaTri(positions, colors, origin, b, c, originAlpha, alphas[i] ?? 0, alphas[i + 1] ?? 0);
  }
}

function pushLoop(target: number[], ring: Vec3[]): void {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) {
      continue;
    }
    target.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

function polygonNormal(points: Vec3[]): Vec3 | null {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([x, y, z]);
}

function planeBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const helper: Vec3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(helper, normal)) ?? [1, 0, 0];
  const v = normalize(cross(normal, u)) ?? [0, 1, 0];
  return { u, v };
}

function project(point: Vec3, origin: Vec3, u: Vec3, v: Vec3): [number, number] {
  const delta = sub(point, origin);
  return [dot(delta, u), dot(delta, v)];
}

function unproject(point: [number, number], origin: Vec3, u: Vec3, v: Vec3): Vec3 {
  return addVec(origin, addVec(scaleVec(u, point[0]), scaleVec(v, point[1])));
}

function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    if (!current || !previous) {
      continue;
    }
    const intersects = current[1] > y !== previous[1] > y
      && x < ((previous[0] - current[0]) * (y - current[1])) / (previous[1] - current[1] + 1e-12) + current[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToPolygon(point: [number, number], polygon: Array<[number, number]>): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) {
      continue;
    }
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

function distanceToSegment(point: [number, number], a: [number, number], b: [number, number]): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq < 1e-12) {
    return Math.hypot(point[0] - a[0], point[1] - a[1]);
  }
  const t = Math.min(Math.max(((point[0] - a[0]) * abx + (point[1] - a[1]) * aby) / lengthSq, 0), 1);
  return Math.hypot(point[0] - (a[0] + abx * t), point[1] - (a[1] + aby * t));
}

function signedArea(polygon: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area * 0.5;
}

function ensureCcw(polygon: Array<[number, number]>): Array<[number, number]> {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
}

function clipPolygon(
  subject: Array<[number, number]>,
  clip: Array<[number, number]>,
): Array<[number, number]> {
  let output = subject;
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b || output.length === 0) {
      return [];
    }
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const next = input[(j + 1) % input.length];
      if (!current || !next) {
        continue;
      }
      const currentIn = insideEdge(current, a, b);
      const nextIn = insideEdge(next, a, b);
      if (currentIn && nextIn) {
        output.push(next);
      } else if (currentIn && !nextIn) {
        const hit = segmentHit(current, next, a, b);
        if (hit) {
          output.push(hit);
        }
      } else if (!currentIn && nextIn) {
        const hit = segmentHit(current, next, a, b);
        if (hit) {
          output.push(hit);
        }
        output.push(next);
      }
    }
  }
  return output;
}

function insideEdge(point: [number, number], a: [number, number], b: [number, number]): boolean {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-9;
}

function segmentHit(
  p: [number, number],
  q: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] | null {
  const r: [number, number] = [q[0] - p[0], q[1] - p[1]];
  const s: [number, number] = [b[0] - a[0], b[1] - a[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / denom;
  return [p[0] + r[0] * t, p[1] + r[1] * t];
}

function average(points: Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0]);
  const count = Math.max(points.length, 1);
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function offset(point: Vec3, normal: Vec3, distanceM: number): Vec3 {
  return [point[0] + normal[0] * distanceM, point[1] + normal[1] * distanceM, point[2] + normal[2] * distanceM];
}

function projectToPlane(point: Vec3, origin: Vec3, normal: Vec3): Vec3 {
  return sub(point, scaleVec(normal, dot(sub(point, origin), normal)));
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function near(a: Vec3, b: Vec3): boolean {
  return distance(a, b) < 0.00005;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaleVec(a: Vec3, scale: number): Vec3 {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(value: Vec3): Vec3 | null {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-10) {
    return null;
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}
