import type { MeshSnapshot, Vec3 } from './types.ts';

/** Physical sheet thickness at the default paper size. Inside the 0.3–0.6 mm range. */
export const PAPER_THICKNESS_M = 0.0005;
/**
 * Pitch between stacked fold layers. Larger than the sheet thickness so
 * overlapping flaps stay separated and the crease can still bridge them.
 */
export const PAPER_LAYER_GAP_M = 0.00115;

/** Debug switches for folded depth and completed-object manipulation. */
export const PAPER_DEPTH = {
  shadows: true,
  showLayerBounds: false,
  showCreaseAxes: false,
  showPivot: false,
  twoHand: true,
};

export interface PaperMeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  layerLines: Float32Array;
  creaseLines: Float32Array;
  faceCount: number;
  thicknessM: number;
}

const FRONT: Vec3 = [1, 1, 1];
const FRONT_SHADOW: Vec3 = [0.74, 0.7, 0.66];
const BACK: Vec3 = [0.84, 0.8, 0.76];
const EDGE: Vec3 = [0.7, 0.66, 0.62];
const CREASE: Vec3 = [0.62, 0.58, 0.54];

interface BuiltFace {
  layer: number;
  normal: Vec3;
  indices: number[];
  points: Vec3[];
  centroid: Vec3;
  front: Vec3[];
  back: Vec3[];
}

/**
 * Extrude every folded polygon into a thin shell. Higher layers sit above
 * lower ones, shared crease edges are bridged, and covered faces are darkened
 * in the vertex colors so the stack reads without a shadow map.
 */
export function buildPaperMesh(snapshot: MeshSnapshot, shadows = PAPER_DEPTH.shadows): PaperMeshBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const layerLines: number[] = [];
  const creaseLines: number[] = [];
  const faces = buildFaces(snapshot);
  const covered = markCovered(faces);

  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    if (!face) {
      continue;
    }
    const frontColor = shadows && covered[index] ? FRONT_SHADOW : FRONT;
    pushFan(positions, normals, colors, face.front, face.normal, frontColor, false);
    pushFan(positions, normals, colors, face.back, face.normal, BACK, true);
    pushWalls(positions, normals, colors, face);
    pushLoop(layerLines, face.front);
  }

  pushCreases(positions, normals, colors, creaseLines, faces, snapshot);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    layerLines: new Float32Array(layerLines),
    creaseLines: new Float32Array(creaseLines),
    faceCount: faces.length,
    thicknessM: PAPER_THICKNESS_M,
  };
}

function buildFaces(snapshot: MeshSnapshot): BuiltFace[] {
  const faces: BuiltFace[] = [];
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
    const backDistance = face.layer * PAPER_LAYER_GAP_M;
    const frontDistance = backDistance + PAPER_THICKNESS_M;
    faces.push({
      layer: face.layer,
      normal,
      indices: indexed.map((entry) => entry.index),
      points,
      centroid: average(points),
      front: points.map((point) => offset(point, normal, frontDistance)),
      back: points.map((point) => offset(point, normal, backDistance)),
    });
  }
  return faces;
}

function markCovered(faces: BuiltFace[]): boolean[] {
  return faces.map((face, index) => {
    const { u, v } = planeBasis(face.normal);
    const origin = face.points[0] ?? face.centroid;
    const sample = project(face.centroid, origin, u, v);
    return faces.some((other, otherIndex) => {
      if (otherIndex === index || other.layer <= face.layer) {
        return false;
      }
      if (Math.abs(dot(face.normal, other.normal)) < 0.65) {
        return false;
      }
      const gap = (other.layer - face.layer) * PAPER_LAYER_GAP_M + PAPER_THICKNESS_M * 2 + 0.004;
      if (planeDistance(other.centroid, face.centroid, face.normal) > gap) {
        return false;
      }
      const polygon = other.points.map((point) => project(point, origin, u, v));
      return pointInPolygon(sample[0], sample[1], polygon);
    });
  });
}

function pushCreases(
  positions: number[],
  normals: number[],
  colors: number[],
  creaseLines: number[],
  faces: BuiltFace[],
  snapshot: MeshSnapshot,
): void {
  const shared = new Map<string, { a: number; b: number; owners: number[] }>();
  faces.forEach((face, faceIndex) => {
    const indices = face.indices;
    for (let i = 0; i < indices.length; i += 1) {
      const a = indices[i];
      const b = indices[(i + 1) % indices.length];
      if (a === undefined || b === undefined || a === b) {
        continue;
      }
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const entry = shared.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), owners: [] };
      entry.owners.push(faceIndex);
      shared.set(key, entry);
    }
  });

  for (const edge of shared.values()) {
    if (edge.owners.length < 2) {
      continue;
    }
    const start = snapshot.vertices[edge.a];
    const end = snapshot.vertices[edge.b];
    if (start && end) {
      creaseLines.push(start[0], start[1], start[2], end[0], end[1], end[2]);
    }
    const first = edge.owners[0];
    const second = edge.owners[1];
    if (first === undefined || second === undefined) {
      continue;
    }
    const faceA = faces[first];
    const faceB = faces[second];
    if (!faceA || !faceB || faceA.layer === faceB.layer) {
      continue;
    }
    const hingeA = hingePoints(faceA, snapshot.vertices[edge.a], snapshot.vertices[edge.b]);
    const hingeB = hingePoints(faceB, snapshot.vertices[edge.a], snapshot.vertices[edge.b]);
    if (!hingeA || !hingeB) {
      continue;
    }
    if (distance(hingeA[0], hingeB[0]) < 0.00005 && distance(hingeA[1], hingeB[1]) < 0.00005) {
      continue;
    }
    const bridge = normalize(addVec(faceA.normal, faceB.normal)) ?? faceA.normal;
    pushQuad(positions, normals, colors, hingeA[0], hingeA[1], hingeB[1], hingeB[0], bridge, CREASE);
  }
}

function hingePoints(face: BuiltFace, start: Vec3 | undefined, end: Vec3 | undefined): [Vec3, Vec3] | null {
  if (!start || !end) {
    return null;
  }
  const backStart = face.back.find((point) => near(point, offset(start, face.normal, face.layer * PAPER_LAYER_GAP_M)));
  const backEnd = face.back.find((point) => near(point, offset(end, face.normal, face.layer * PAPER_LAYER_GAP_M)));
  if (!backStart || !backEnd) {
    return null;
  }
  return [backStart, backEnd];
}

function pushFan(
  positions: number[],
  normals: number[],
  colors: number[],
  ring: Vec3[],
  normal: Vec3,
  color: Vec3,
  reverse: boolean,
): void {
  const origin = ring[0];
  if (!origin) {
    return;
  }
  const wound = reverse ? [-normal[0], -normal[1], -normal[2]] as Vec3 : normal;
  for (let i = 1; i < ring.length - 1; i += 1) {
    const b = ring[i];
    const c = ring[i + 1];
    if (!b || !c) {
      continue;
    }
    if (reverse) {
      pushTri(positions, normals, colors, origin, c, b, wound, color);
    } else {
      pushTri(positions, normals, colors, origin, b, c, wound, color);
    }
  }
}

function pushWalls(positions: number[], normals: number[], colors: number[], face: BuiltFace): void {
  for (let i = 0; i < face.front.length; i += 1) {
    const next = (i + 1) % face.front.length;
    const frontA = face.front[i];
    const frontB = face.front[next];
    const backB = face.back[next];
    const backA = face.back[i];
    if (!frontA || !frontB || !backA || !backB) {
      continue;
    }
    const outward = normalize(cross(sub(frontB, frontA), sub(backA, frontA))) ?? face.normal;
    const towardCenter = dot(outward, sub(face.centroid, frontA));
    if (towardCenter > 0) {
      pushQuad(positions, normals, colors, frontA, backA, backB, frontB, scaleVec(outward, -1), EDGE);
    } else {
      pushQuad(positions, normals, colors, frontA, frontB, backB, backA, outward, EDGE);
    }
  }
}

function pushQuad(
  positions: number[],
  normals: number[],
  colors: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  normal: Vec3,
  color: Vec3,
): void {
  pushTri(positions, normals, colors, a, b, c, normal, color);
  pushTri(positions, normals, colors, a, c, d, normal, color);
}

function pushTri(
  positions: number[],
  normals: number[],
  colors: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  normal: Vec3,
  color: Vec3,
): void {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);
  colors.push(color[0], color[1], color[2], color[0], color[1], color[2], color[0], color[1], color[2]);
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

function average(points: Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0]);
  const count = Math.max(points.length, 1);
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function offset(point: Vec3, normal: Vec3, distanceM: number): Vec3 {
  return [point[0] + normal[0] * distanceM, point[1] + normal[1] * distanceM, point[2] + normal[2] * distanceM];
}

function planeDistance(point: Vec3, origin: Vec3, normal: Vec3): number {
  return Math.abs(dot(sub(point, origin), normal));
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function near(a: Vec3, b: Vec3): boolean {
  return distance(a, b) < 0.00002;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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
