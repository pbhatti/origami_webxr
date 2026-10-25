import { rotateAroundHinge } from './CreaseSolver.ts';
import { copy3, sideOfCrease } from './creaseMath.ts';
import { deformByHinge } from './MeshSplitter.ts';
import type { MeshSnapshot, RollSegment, Vec3 } from './types.ts';

/**
 * Outermost segment (index 0) starts immediately. Each later hinge waits until
 * the previous one is mostly home, then eases in, so the strip rolls instead
 * of folding as one slab.
 */
const ROLL_LEAD = 0.7;

export function rollSegmentAmount(progress: number, index: number, count: number): number {
  if (count <= 1) {
    return smooth(progress);
  }
  const window = 1 / (1 + (count - 1) * ROLL_LEAD);
  const start = index * ROLL_LEAD * window;
  return smooth((progress - start) / window);
}

export function deformRollSnapshot(
  from: MeshSnapshot,
  segments: RollSegment[],
  progress: number,
  direction: 'close' | 'open' = 'close',
): MeshSnapshot {
  const clamped = Math.min(1, Math.max(0, progress));
  let current = from;
  const count = segments.length;
  for (let index = 0; index < count; index += 1) {
    const amount = rollSegmentAmount(clamped, index, count);
    if (amount < 1e-4) {
      continue;
    }
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const signed = (direction === 'close' ? -180 : 180) * amount;
    const moved = deformByHinge(current, segment.hinge, signed, segment.tip);
    // Opening keeps the layers the folds already assigned. Restacking here
    // would renumber the next hinge's minMovingLayer and drag the body along.
    current = direction === 'open'
      ? moved.snapshot
      : compressSheetLayers(stackRollLayers(moved.snapshot, moved.movingFaceIds, amount));
  }
  if (from.named) {
    current = {
      ...current,
      named: rollNamedPoints(from.named, segments, clamped, direction),
    };
  }
  return current;
}

export function rollNamedPoints(
  named: Record<string, Vec3>,
  segments: RollSegment[],
  progress: number,
  direction: 'close' | 'open' = 'close',
): Record<string, Vec3> {
  return Object.fromEntries(
    Object.entries(named).map(([key, point]) => [key, rollPoint(point, segments, progress, direction)]),
  );
}

export function rollPoint(
  point: Vec3,
  segments: RollSegment[],
  progress: number,
  direction: 'close' | 'open' = 'close',
): Vec3 {
  let current = copy3(point);
  const clamped = Math.min(1, Math.max(0, progress));
  const count = segments.length;
  for (let index = 0; index < count; index += 1) {
    const amount = rollSegmentAmount(clamped, index, count);
    if (amount < 1e-4) {
      continue;
    }
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    if (sideOfCrease(current, segment.hinge.p0, segment.hinge.p1, segment.tip) <= 0) {
      continue;
    }
    const signed = (direction === 'close' ? -180 : 180) * amount;
    current = rotateAroundHinge(current, segment.hinge.p0, segment.hinge.p1, signed);
  }
  return current;
}

/**
 * Sit the moving packet on the next free layers without skipping ahead.
 * Overlapping sheets keep their order, but a thin flap is recompressed so a
 * stale layer index cannot throw it a centimetre above the body.
 */
function stackRollLayers(snapshot: MeshSnapshot, movingIds: Set<string>, amount: number): MeshSnapshot {
  const moving = snapshot.faces.filter((face) => movingIds.has(face.id));
  if (moving.length === 0) {
    return snapshot;
  }
  const polygons = new Map(snapshot.faces.map((face) => [face.id, facePolygon(face, snapshot.vertices)]));
  const order = [...moving].sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
  const packed = new Map<string, number>();
  const placed: string[] = [];
  for (const face of order) {
    const used = new Set<number>();
    for (const otherId of placed) {
      if (polygonsOverlap(polygons.get(face.id) ?? [], polygons.get(otherId) ?? [])) {
        used.add(packed.get(otherId) ?? 0);
      }
    }
    let layer = 0;
    while (used.has(layer)) {
      layer += 1;
    }
    packed.set(face.id, layer);
    placed.push(face.id);
  }
  let base = 0;
  for (const face of snapshot.faces) {
    if (movingIds.has(face.id)) {
      continue;
    }
    const poly = polygons.get(face.id) ?? [];
    const overlapsPacket = moving.some((other) => polygonsOverlap(poly, polygons.get(other.id) ?? []));
    if (overlapsPacket) {
      base = Math.max(base, face.layer);
    }
  }
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => {
      const index = packed.get(face.id);
      return index == null ? face : { ...face, layer: base + (index + 1) * amount };
    }),
  };
}

function compressSheetLayers(snapshot: MeshSnapshot): MeshSnapshot {
  const polygons = snapshot.faces.map((face) => facePolygon(face, snapshot.vertices));
  const order = snapshot.faces
    .map((_, index) => index)
    .sort((left, right) => {
      const layer = (snapshot.faces[left]?.layer ?? 0) - (snapshot.faces[right]?.layer ?? 0);
      return layer !== 0 ? layer : left - right;
    });
  const assigned = new Array<number>(snapshot.faces.length).fill(0);
  const placed: number[] = [];
  for (const index of order) {
    const used = new Set<number>();
    for (const other of placed) {
      const poly = polygons[index];
      const neighbor = polygons[other];
      if (poly && neighbor && polygonsOverlap(poly, neighbor)) {
        used.add(assigned[other] ?? 0);
      }
    }
    let layer = 0;
    while (used.has(layer)) {
      layer += 1;
    }
    assigned[index] = layer;
    placed.push(index);
  }
  return {
    ...snapshot,
    faces: snapshot.faces.map((face, index) => ({ ...face, layer: assigned[index] ?? face.layer })),
  };
}

function facePolygon(face: MeshSnapshot['faces'][number], vertices: Vec3[]): Vec3[] {
  return face.vertices.flatMap((index) => {
    const point = vertices[index];
    return point ? [point] : [];
  });
}

function orient(a: Vec3, b: Vec3, c: Vec3): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function strictlyInside(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const epsilon = 1e-6;
  const ab = orient(a, b, point);
  const bc = orient(b, c, point);
  const ca = orient(c, a, point);
  return (ab > epsilon && bc > epsilon && ca > epsilon) || (ab < -epsilon && bc < -epsilon && ca < -epsilon);
}

function edgesCross(a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean {
  return orient(c, d, a) * orient(c, d, b) < 0 && orient(a, b, c) * orient(a, b, d) < 0;
}

function fan(poly: Vec3[]): [Vec3, Vec3, Vec3][] {
  const triangles: [Vec3, Vec3, Vec3][] = [];
  for (let index = 1; index < poly.length - 1; index += 1) {
    const b = poly[index];
    const c = poly[index + 1];
    if (poly[0] && b && c) {
      triangles.push([poly[0], b, c]);
    }
  }
  return triangles;
}

function polygonsOverlap(left: Vec3[], right: Vec3[]): boolean {
  if (left.length < 3 || right.length < 3) {
    return false;
  }
  const leftTris = fan(left);
  const rightTris = fan(right);
  for (const tri of leftTris) {
    const center: Vec3 = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3, 0];
    for (const other of rightTris) {
      if (strictlyInside(center, other[0], other[1], other[2])) {
        return true;
      }
    }
  }
  for (const tri of rightTris) {
    const center: Vec3 = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3, 0];
    for (const other of leftTris) {
      if (strictlyInside(center, other[0], other[1], other[2])) {
        return true;
      }
    }
  }
  for (const tri of leftTris) {
    for (const other of rightTris) {
      const edges: [Vec3, Vec3][] = [
        [tri[0], tri[1]],
        [tri[1], tri[2]],
        [tri[2], tri[0]],
      ];
      const otherEdges: [Vec3, Vec3][] = [
        [other[0], other[1]],
        [other[1], other[2]],
        [other[2], other[0]],
      ];
      for (const edge of edges) {
        for (const next of otherEdges) {
          if (edgesCross(edge[0], edge[1], next[0], next[1])) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function smooth(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}
