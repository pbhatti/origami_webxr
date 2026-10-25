import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { sideOfCrease } from '../creaseMath.ts';
import { applyHingeSnapshot, deformByHinge } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import { deformRollSnapshot, rollPoint } from '../rollFold.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, RollSegment, Vec2, Vec3 } from '../types.ts';

export const DINOSAUR_PAPER_COLOR = '#FFC547';
export const DINOSAUR_BACK_COLOR = '#FFE29A';
export const DINOSAUR_EDGE_COLOR = '#C98C24';
export const DINOSAUR_MARK_COLOR = '#D96722';
export const DINOSAUR_EYE_COLOR = '#1C1A17';
export const DINOSAUR_EYE_HIGHLIGHT = '#F7F4EA';

const H = PAPER_SIZE_M / 2;

const TL: Vec3 = [-H, H, 0];
const TR: Vec3 = [H, H, 0];
const BR: Vec3 = [H, -H, 0];
const BL: Vec3 = [-H, -H, 0];
const O: Vec3 = [0, 0, 0];
const EDGE: Vec3 = [H, 0, 0];
const CREASE: Vec3 = [H / 2, 0, 0];

/** Four vertical bands across the right half. The inner band is the finished neck. */
export const DINOSAUR_ROLL_SEGMENTS = 4;
export const DINOSAUR_NECK_WIDTH = H / DINOSAUR_ROLL_SEGMENTS;

const CENTER_X = 0;
const SECTION_X = H / 2;
const NARROW_X = H / 4;
const OUTER_X = (3 * H) / 4;

export const DINOSAUR_STEPS = [
  'triangle',
  'center-crease',
  'first-section',
  'section-again',
  'open-fold',
  'roll-neck',
  'head',
  'tail',
  'dinosaur-decoration',
] as const;

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, bulge], to];
}

function faceViewer(hinge: HingeDefinition, tip: Vec3): HingeDefinition {
  const lifted = landmarkAfterHinge(tip, hinge, 90, 'valley');
  if (lifted[2] >= 0) {
    return hinge;
  }
  return { ...hinge, p0: hinge.p1, p1: hinge.p0 };
}

function stackFlap(snapshot: MeshSnapshot, movingIds: Set<string>): MeshSnapshot {
  const moving = snapshot.faces.filter((face) => movingIds.has(face.id));
  if (moving.length === 0) {
    return snapshot;
  }
  const maxStationary = snapshot.faces.reduce(
    (max, face) => (movingIds.has(face.id) ? max : Math.max(max, face.layer)),
    0,
  );
  const levels = [...new Set(moving.map((face) => face.layer))].sort((left, right) => left - right);
  const remap = new Map(levels.map((level, index) => [level, maxStationary + 1 + index]));
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => {
      const next = remap.get(face.layer);
      return movingIds.has(face.id) && next != null ? { ...face, layer: next } : face;
    }),
  };
}

function foldStacked(from: MeshSnapshot, hinge: HingeDefinition, tip: Vec3): { snapshot: MeshSnapshot; minLayer: number } {
  const moved = deformByHinge(from, hinge, -180, tip);
  const folded = applyHingeSnapshot(from, hinge, 'valley', 180, tip);
  const stacked = stackFlap(folded, moved.movingFaceIds);
  let minLayer = Number.POSITIVE_INFINITY;
  for (const face of stacked.faces) {
    if (moved.movingFaceIds.has(face.id)) {
      minLayer = Math.min(minLayer, face.layer);
    }
  }
  return { snapshot: stacked, minLayer: Number.isFinite(minLayer) ? minLayer : 2 };
}

function step(
  input: Omit<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM' | 'creaseLineLocal'> &
    Partial<Pick<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM' | 'creaseLineLocal'>>,
): FoldStep {
  return {
    angleToleranceDeg: 12,
    targetPointToleranceM: 0.016,
    ...input,
    creaseLineLocal: [input.hinge.p0, input.hinge.p1],
  };
}

function reflectNamed(named: Record<string, Vec3>, hinge: HingeDefinition, tip: Vec3): Record<string, Vec3> {
  return Object.fromEntries(
    Object.entries(named).map(([key, point]) => {
      if (sideOfCrease(point, hinge.p0, hinge.p1, tip) <= 0) {
        return [key, point];
      }
      const next = landmarkAfterHinge(point, hinge, 180, 'valley');
      return [key, [next[0], next[1], 0] as Vec3];
    }),
  );
}

function convexHull(points: Vec3[]): Vec3[] {
  const unique: Vec3[] = [];
  for (const point of points) {
    if (unique.some((other) => Math.hypot(other[0] - point[0], other[1] - point[1]) < 0.0015)) {
      continue;
    }
    unique.push([point[0], point[1], 0]);
  }
  unique.sort((left, right) => (left[0] === right[0] ? left[1] - right[1] : left[0] - right[0]));
  if (unique.length <= 2) {
    return unique;
  }
  const cross = (a: Vec3, b: Vec3, c: Vec3) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower: Vec3[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Vec3[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function withPose(snapshot: MeshSnapshot, named: Record<string, Vec3>, outline?: Vec3[]): MeshSnapshot {
  const flat = snapshot.vertices.filter((vertex) => Math.abs(vertex[2]) < 0.003);
  return { ...snapshot, named, outline: outline ?? convexHull(flat.length > 0 ? flat : snapshot.vertices) };
}

function facePolygon(face: FaceDefinition, vertices: Vec3[]): Vec3[] {
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

function polygonCentroid(poly: Vec3[]): Vec3 {
  const acc = poly.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1], 0] as Vec3, [0, 0, 0] as Vec3);
  return [acc[0] / poly.length, acc[1] / poly.length, 0];
}

/** True when two faces cover the same paper, not when they only share an edge. */
function polygonsOverlap(left: Vec3[], right: Vec3[]): boolean {
  if (left.length < 3 || right.length < 3) {
    return false;
  }
  const leftTris = fan(left);
  const rightTris = fan(right);
  for (const tri of leftTris) {
    const center = polygonCentroid(tri);
    for (const other of rightTris) {
      if (strictlyInside(center, other[0], other[1], other[2])) {
        return true;
      }
    }
  }
  for (const tri of rightTris) {
    const center = polygonCentroid(tri);
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

function fan(poly: Vec3[]): [Vec3, Vec3, Vec3][] {
  const triangles: [Vec3, Vec3, Vec3][] = [];
  for (let index = 1; index < poly.length - 1; index += 1) {
    const b = poly[index];
    const c = poly[index + 1];
    if (b && c && poly[0]) {
      triangles.push([poly[0], b, c]);
    }
  }
  return triangles;
}

/**
 * The open step returns the triangle but leaves the flap's old layer numbers
 * behind. Pack overlapping faces back onto consecutive sheets so the neck
 * roll does not stack a thin flap dozens of gaps above the body.
 */
function compressLayers(snapshot: MeshSnapshot): MeshSnapshot {
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

const SQUARE_FACES: FaceDefinition[] = [
  { id: 'north', vertices: [0, 1, 4], layer: 0, materialId: 'front' },
  { id: 'east', vertices: [1, 2, 4], layer: 0, materialId: 'front' },
  { id: 'south', vertices: [2, 3, 4], layer: 0, materialId: 'front' },
  { id: 'west', vertices: [3, 0, 4], layer: 0, materialId: 'front' },
];

const NAMED0 = { TL, TR, BR, BL, O, EDGE, CREASE };
const square: MeshSnapshot = {
  vertices: [TL, TR, BR, BL, O],
  faces: SQUARE_FACES,
  named: NAMED0,
  outline: [TL, TR, BR, BL],
};

const HINGE_DIAG: HingeDefinition = faceViewer(
  {
    id: 'dino-diagonal',
    p0: BL,
    p1: TR,
    fixedFaces: ['east', 'south'],
    movingFaces: ['north', 'west'],
  },
  TL,
);

const HINGE_CENTER: HingeDefinition = faceViewer(
  {
    id: 'dino-center',
    p0: [CENTER_X, -H, 0],
    p1: [CENTER_X, 0, 0],
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    layerMode: 'packet',
  },
  EDGE,
);

const HINGE_SECTION: HingeDefinition = faceViewer(
  {
    id: 'dino-section',
    p0: [SECTION_X, -H, 0],
    p1: [SECTION_X, SECTION_X, 0],
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    layerMode: 'packet',
  },
  EDGE,
);

const HINGE_NARROW: HingeDefinition = faceViewer(
  {
    id: 'dino-narrow',
    p0: [NARROW_X, -H, 0],
    p1: [NARROW_X, H - NARROW_X, 0],
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    layerMode: 'packet',
  },
  [SECTION_X, -H / 2, 0],
);

function rollHinge(id: string, x: number, tip: Vec3, minMovingLayer?: number): HingeDefinition {
  return faceViewer(
    {
      id,
      p0: [x, -H, 0],
      p1: [x, x, 0],
      fixedFaces: [],
      movingFaces: ['north', 'east', 'south', 'west'],
      layerMode: 'packet',
      minMovingLayer,
    },
    tip,
  );
}

const triangleNamed = reflectNamed(NAMED0, HINGE_DIAG, TL);
const triangle: MeshSnapshot = withPose(
  { ...applyHingeSnapshot(square, HINGE_DIAG, 'valley', 180, TL), outline: [BL, BR, TR] },
  triangleNamed,
  [BL, BR, TR],
);

const centerFoldedNamed = reflectNamed(triangleNamed, HINGE_CENTER, EDGE);
const centerFolded: MeshSnapshot = withPose(
  foldStacked(triangle, HINGE_CENTER, EDGE).snapshot,
  centerFoldedNamed,
);

const sectionFold = foldStacked(triangle, HINGE_SECTION, EDGE);
const sectionNamed = reflectNamed(triangleNamed, HINGE_SECTION, EDGE);
const section: MeshSnapshot = withPose(sectionFold.snapshot, sectionNamed);

const narrowFold = foldStacked(section, HINGE_NARROW, [SECTION_X, -H / 2, 0]);
const narrowNamed = reflectNamed(sectionNamed, HINGE_NARROW, [SECTION_X, -H / 2, 0]);
const narrow: MeshSnapshot = withPose(narrowFold.snapshot, narrowNamed);

const OPEN_SEGMENTS: RollSegment[] = [
  {
    hinge: { ...HINGE_NARROW, id: 'dino-open-narrow', minMovingLayer: narrowFold.minLayer },
    tip: [NARROW_X * 0.45, -H * 0.35, 0],
  },
  {
    hinge: { ...HINGE_SECTION, id: 'dino-open-section', minMovingLayer: sectionFold.minLayer },
    tip: [SECTION_X * 0.45, -H * 0.25, 0],
  },
];

const openedRaw = deformRollSnapshot(narrow, OPEN_SEGMENTS, 1, 'open');
const openedNamed = {
  ...narrowNamed,
  TR,
  EDGE,
  CREASE,
  TL: triangleNamed.TL ?? BL,
  BR,
  BL,
  O,
};
const opened: MeshSnapshot = compressLayers(withPose(openedRaw, openedNamed, [BL, BR, TR]));

const NECK_TIP: Vec3 = [H, 0, 0];
const ROLL_SEGMENTS: RollSegment[] = [
  { hinge: rollHinge('dino-roll-outer', OUTER_X, NECK_TIP), tip: NECK_TIP },
  { hinge: rollHinge('dino-roll-mid', SECTION_X, NECK_TIP), tip: NECK_TIP },
  { hinge: rollHinge('dino-roll-inner', NARROW_X, NECK_TIP), tip: NECK_TIP },
];

export const DINOSAUR_ROLL_SEGMENT_COUNT = ROLL_SEGMENTS.length;

const neckRaw = deformRollSnapshot(opened, ROLL_SEGMENTS, 1, 'close');
const neckNamed = {
  ...openedNamed,
  TR: rollPoint(TR, ROLL_SEGMENTS, 1, 'close'),
  EDGE: rollPoint(EDGE, ROLL_SEGMENTS, 1, 'close'),
  CREASE: rollPoint(CREASE, ROLL_SEGMENTS, 1, 'close'),
};
const neck: MeshSnapshot = withPose(neckRaw, neckNamed);

const HEAD_CUT = 0.016;
const APEX: Vec3 = neckNamed.TR ?? [0, H, 0];
const TIP_EDGE: Vec3 = rollPoint([H, H - HEAD_CUT, 0], ROLL_SEGMENTS, 1, 'close');
const TIP_HYP: Vec3 = rollPoint([H - HEAD_CUT, H - HEAD_CUT, 0], ROLL_SEGMENTS, 1, 'close');

function chooseHead(): { hinge: HingeDefinition; destination: Vec3 } {
  let best: { hinge: HingeDefinition; destination: Vec3; score: number } | null = null;
  // The rolled apex sits on the left edge of the neck. A chord from that edge
  // up to the sloping top reflects the tip to the right instead of down.
  for (const drop of [0.024, 0.032, 0.04, 0.048, 0.056]) {
    for (const run of [0.012, 0.016, 0.02, 0.024]) {
      if (run > drop - 0.008) {
        continue;
      }
      const p0: Vec3 = [APEX[0], APEX[1] - drop, 0];
      const p1: Vec3 = [APEX[0] + run, APEX[1] - run, 0];
      const hinge = faceViewer(
        {
          id: 'dino-head',
          p0,
          p1,
          fixedFaces: [],
          movingFaces: ['north', 'east', 'south', 'west'],
          layerMode: 'packet',
          reachM: Math.min(0.04, drop * 0.72),
        },
        APEX,
      );
      const preview = deformByHinge(neck, hinge, -180, APEX);
      const keepsCorner = preview.snapshot.vertices.some(
        (vertex) => Math.hypot(vertex[0] - BL[0], vertex[1] - BL[1]) < 0.003,
      );
      if (!keepsCorner || preview.movingFaceIds.size === 0 || preview.movingFaceIds.size > 24) {
        continue;
      }
      let destination: Vec3 | null = null;
      for (const index of preview.movingVertexIds) {
        const vertex = preview.snapshot.vertices[index];
        if (!vertex || vertex[1] < 0.055) {
          continue;
        }
        if (!destination || vertex[0] > destination[0]) {
          destination = [vertex[0], vertex[1], 0];
        }
      }
      if (!destination || destination[0] < DINOSAUR_NECK_WIDTH + 0.002) {
        continue;
      }
      const grew = preview.snapshot.vertices.some(
        (vertex) => vertex[0] < BL[0] - 0.004 || vertex[1] > APEX[1] + 0.006 || vertex[0] > 0.07,
      );
      if (grew) {
        continue;
      }
      const score = destination[1] * 3 + destination[0] - preview.movingFaceIds.size * 0.002;
      if (!best || score > best.score) {
        best = { hinge, destination, score };
      }
    }
  }
  if (best) {
    return best;
  }
  const p0: Vec3 = [APEX[0], APEX[1] - 0.04, 0];
  const p1: Vec3 = [APEX[0] + 0.016, APEX[1] - 0.016, 0];
  const hinge = faceViewer(
    {
      id: 'dino-head',
      p0,
      p1,
      fixedFaces: [],
      movingFaces: ['north', 'east', 'south', 'west'],
      layerMode: 'packet',
      reachM: 0.029,
    },
    APEX,
  );
  const landing = landmarkAfterHinge(APEX, hinge, 180, 'valley');
  return { hinge, destination: [landing[0], landing[1], 0] };
}

const headChoice = chooseHead();
const HINGE_HEAD = headChoice.hinge;
const HEAD_DEST = headChoice.destination;
const headedNamed = reflectNamed(neckNamed, HINGE_HEAD, APEX);
headedNamed.TR = [HEAD_DEST[0], HEAD_DEST[1], 0];
headedNamed.BL = BL;
headedNamed.BR = BR;
headedNamed.O = O;
const headed: MeshSnapshot = compressLayers(withPose(foldStacked(neck, HINGE_HEAD, APEX).snapshot, headedNamed));

const TAIL_INSET = 0.02;
const bisectorLen = Math.hypot(Math.cos(Math.PI / 8), Math.sin(Math.PI / 8));
const BISECTOR: Vec3 = [Math.cos(Math.PI / 8) / bisectorLen, Math.sin(Math.PI / 8) / bisectorLen, 0];
const tailOrigin: Vec3 = [BL[0] + BISECTOR[0] * TAIL_INSET, BL[1] + BISECTOR[1] * TAIL_INSET, 0];
const tailDir: Vec3 = [-BISECTOR[1], BISECTOR[0], 0];

function rayAtY(y: number): Vec3 | null {
  if (Math.abs(tailDir[1]) < 1e-8) {
    return null;
  }
  const t = (y - tailOrigin[1]) / tailDir[1];
  return [tailOrigin[0] + tailDir[0] * t, y, 0];
}

function rayOnHypotenuse(): Vec3 | null {
  const denom = tailDir[1] - tailDir[0];
  if (Math.abs(denom) < 1e-8) {
    return null;
  }
  const t = (tailOrigin[0] - tailOrigin[1]) / denom;
  const x = tailOrigin[0] + tailDir[0] * t;
  return [x, x, 0];
}

const TAIL_BOTTOM = rayAtY(-H) ?? [BL[0] + TAIL_INSET, -H, 0];
const TAIL_HYP = rayOnHypotenuse() ?? [BL[0] + TAIL_INSET * 0.7, BL[1] + TAIL_INSET * 0.7, 0];

const HINGE_TAIL: HingeDefinition = faceViewer(
  {
    id: 'dino-tail',
    p0: TAIL_BOTTOM,
    p1: TAIL_HYP,
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    layerMode: 'packet',
  },
  BL,
);

const tailNamed = reflectNamed(headedNamed, HINGE_TAIL, BL);
const TAIL_LANDING = landmarkAfterHinge(BL, HINGE_TAIL, 180, 'valley');
tailNamed.BL = [TAIL_LANDING[0], TAIL_LANDING[1], 0];
const tailed: MeshSnapshot = compressLayers(withPose(foldStacked(headed, HINGE_TAIL, BL).snapshot, tailNamed));
const dinosaur: MeshSnapshot = { ...tailed, outline: tailed.outline };

export const DINOSAUR_HEAD_TIP: Vec3 = headedNamed.TR ?? HEAD_DEST;
export const DINOSAUR_TAIL_TIP: Vec3 = tailNamed.BL ?? TAIL_LANDING;
export const DINOSAUR_APEX: Vec3 = APEX;
export const DINOSAUR_FEATURE_Z = 0.012;
export const DINOSAUR_EYE: Vec3 = [
  ((HINGE_HEAD.p0[0] + HINGE_HEAD.p1[0]) / 2) * 0.15 + DINOSAUR_HEAD_TIP[0] * 0.85,
  ((HINGE_HEAD.p0[1] + HINGE_HEAD.p1[1]) / 2) * 0.15 + DINOSAUR_HEAD_TIP[1] * 0.85,
  DINOSAUR_FEATURE_Z,
];
export const DINOSAUR_PINCH_AT: Vec3 = [-0.028, -0.048, 0.012];
export const DINOSAUR_NAMED = NAMED0;

const CENTER_LINE: [Vec3, Vec3] = [[CENTER_X, -H, 0], [CENTER_X, 0, 0]];
const SECTION_LINE: [Vec3, Vec3] = [[SECTION_X, -H, 0], [SECTION_X, SECTION_X, 0]];
const NARROW_LINE: [Vec3, Vec3] = [[NARROW_X, -H, 0], [NARROW_X, NARROW_X, 0]];
const OUTER_LINE: [Vec3, Vec3] = [[OUTER_X, -H, 0], [OUTER_X, OUTER_X, 0]];

export interface DinosaurSpineMark {
  points: Vec3[];
}

/** Orange plates sitting on the hypotenuse, inset so the fold edge stays visible. */
export function dinosaurSpineMarks(): DinosaurSpineMark[] {
  const inward: Vec3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
  const along: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
  const marks: DinosaurSpineMark[] = [];
  for (let index = 0; index < 5; index += 1) {
    const t = 0.34 + index * 0.1;
    const x = BL[0] + (O[0] - BL[0]) * t;
    const y = BL[1] + (O[1] - BL[1]) * t;
    const half = 0.0065;
    const depth = 0.011;
    const z = DINOSAUR_FEATURE_Z;
    marks.push({
      points: [
        [x - along[0] * half + inward[0] * 0.0035, y - along[1] * half + inward[1] * 0.0035, z],
        [x + along[0] * half + inward[0] * 0.0035, y + along[1] * half + inward[1] * 0.0035, z],
        [x + inward[0] * depth, y + inward[1] * depth, z],
      ],
    });
  }
  return marks;
}

export function dinosaurRollAt(progress: number): MeshSnapshot {
  return deformRollSnapshot(opened, ROLL_SEGMENTS, progress, 'close');
}

export const DINOSAUR_RECIPE: OrigamiRecipe = {
  id: 'origami-dinosaur',
  name: 'Origami dinosaur',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'dino-diagonal', p0: HINGE_DIAG.p0, p1: HINGE_DIAG.p1, direction: 'valley' },
    { id: 'dino-center', p0: HINGE_CENTER.p0, p1: HINGE_CENTER.p1, direction: 'valley' },
    { id: 'dino-section', p0: HINGE_SECTION.p0, p1: HINGE_SECTION.p1, direction: 'valley' },
    { id: 'dino-narrow', p0: HINGE_NARROW.p0, p1: HINGE_NARROW.p1, direction: 'valley' },
    { id: 'dino-head', p0: HINGE_HEAD.p0, p1: HINGE_HEAD.p1, direction: 'valley' },
    { id: 'dino-tail', p0: HINGE_TAIL.p0, p1: HINGE_TAIL.p1, direction: 'valley' },
  ],
  snapshots: {
    square,
    triangle,
    'center-folded': centerFolded,
    section,
    narrow,
    opened,
    neck,
    headed,
    tailed,
    dinosaur,
  },
  finalSilhouette: dinosaur.outline,
  silhouetteToleranceM: 0.04,
  steps: [
    step({
      id: 'dino-triangle',
      ordinal: 1,
      progressStage: 1,
      title: 'Fold into a triangle',
      instruction: 'Fold the square diagonally in half.',
      fromSnapshotId: 'square',
      toSnapshotId: 'triangle',
      actionType: 'fold',
      hinge: HINGE_DIAG,
      direction: 'valley',
      movingRegion: {
        id: 'moving-upper-left',
        faceIds: ['north', 'west'],
        polygonUV: uvPoly([TL, TR, BL]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-lower-right',
        faceIds: ['east', 'south'],
        polygonUV: uvPoly([TR, BR, BL]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TL', target: triangleNamed.TL ?? BR }],
      arrowPathLocal: arc([TL[0] + 0.02, TL[1] - 0.02, 0.004], [BR[0] - 0.03, BR[1] + 0.03, 0.004], 0.05),
      meshStrategy: 'hinge',
      validationNotes: 'Step 1. Upper-left corner folds across the BL–TR diagonal onto the lower-right corner.',
    }),
    step({
      id: 'dino-center-fold',
      ordinal: 2,
      progressStage: 2,
      title: 'Create the center crease',
      instruction: 'Fold in half to make a crease, then unfold.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'center-folded',
      actionType: 'fold',
      hinge: HINGE_CENTER,
      direction: 'valley',
      movingRegion: {
        id: 'moving-right-half',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[0, -H, 0], BR, TR, O]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'EDGE', target: centerFoldedNamed.EDGE ?? [-H, 0, 0] }],
      arrowPathLocal: arc([H * 0.72, -H * 0.15, 0.004], [-H * 0.55, -H * 0.15, 0.004], 0.045),
      meshStrategy: 'hinge',
      validationNotes: 'Step 2a. The right half of the triangle creases across x=0. It does not stay folded.',
    }),
    step({
      id: 'dino-center-open',
      ordinal: 3,
      progressStage: 2,
      title: 'Create the center crease',
      instruction: 'The paper opens. The vertical crease stays as a guide.',
      fromSnapshotId: 'center-folded',
      toSnapshotId: 'triangle',
      actionType: 'unfold',
      hinge: { ...HINGE_CENTER, id: 'dino-center-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-center',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[-H, -H, 0], [0, -H, 0], O, [-H, H, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'EDGE', target: EDGE }],
      arrowPathLocal: arc([-H * 0.55, -H * 0.05, 0.004], [H * 0.7, -H * 0.05, 0.004], 0.04),
      extraCreaseLines: [CENTER_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2b. Automatic reopen. The triangle returns with a vertical guide at x=0.',
    }),
    step({
      id: 'dino-section',
      ordinal: 4,
      progressStage: 3,
      title: 'Fold the first section',
      instruction: 'Fold the right section inward along the dotted line.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'section',
      actionType: 'fold',
      hinge: HINGE_SECTION,
      direction: 'valley',
      movingRegion: {
        id: 'moving-right-section',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[SECTION_X, -H, 0], BR, TR, [SECTION_X, SECTION_X, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'EDGE', target: sectionNamed.EDGE ?? [0, 0, 0] }],
      arrowPathLocal: arc([H * 0.86, -H * 0.1, 0.004], [H * 0.08, -H * 0.1, 0.004], 0.04),
      extraCreaseLines: [CENTER_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3. The flap from x=S/2 to x=S folds left so the right edge lands on x=0.',
    }),
    step({
      id: 'dino-section-again',
      ordinal: 5,
      progressStage: 4,
      title: 'Fold the section again',
      instruction: 'Fold the narrow section inward again.',
      fromSnapshotId: 'section',
      toSnapshotId: 'narrow',
      actionType: 'fold',
      hinge: HINGE_NARROW,
      direction: 'valley',
      movingRegion: {
        id: 'moving-narrow-section',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[NARROW_X, -H, 0], [SECTION_X, -H, 0], [SECTION_X, SECTION_X, 0], [NARROW_X, H - NARROW_X, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'CREASE', target: narrowNamed.CREASE ?? [0, 0, 0] }],
      arrowPathLocal: arc([SECTION_X * 0.92, -H * 0.2, 0.004], [NARROW_X * 0.4, -H * 0.2, 0.004], 0.03),
      extraCreaseLines: [CENTER_LINE, SECTION_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4. The edge at x=S/2 folds to x=0. The strip sits between x=0 and x=S/4.',
    }),
    step({
      id: 'dino-open-fold',
      ordinal: 6,
      progressStage: 5,
      title: 'Open the fold',
      instruction: 'Open the folded section.',
      fromSnapshotId: 'narrow',
      toSnapshotId: 'opened',
      actionType: 'unfold',
      hinge: OPEN_SEGMENTS[0]!.hinge,
      direction: 'valley',
      rollSegments: OPEN_SEGMENTS,
      rollDirection: 'open',
      movingRegion: {
        id: 'moving-open-flap',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[0, -H, 0], [NARROW_X, -H, 0], [NARROW_X, H - NARROW_X, 0], [0, H, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: TR }],
      arrowPathLocal: arc([NARROW_X * 0.4, H * 0.15, 0.004], [H * 0.78, H * 0.05, 0.004], 0.045),
      extraCreaseLines: [CENTER_LINE, SECTION_LINE, NARROW_LINE],
      meshStrategy: 'roll',
      validationNotes: 'Step 5. One pinch reverses the step 4 flap, then the step 3 flap. Creases stay as guides.',
    }),
    step({
      id: 'dino-roll',
      ordinal: 7,
      progressStage: 6,
      title: 'Roll up the neck',
      instruction: "Roll the paper inward to form the dinosaur's neck.",
      fromSnapshotId: 'opened',
      toSnapshotId: 'neck',
      actionType: 'fold',
      hinge: ROLL_SEGMENTS[0]!.hinge,
      direction: 'valley',
      rollSegments: ROLL_SEGMENTS,
      rollDirection: 'close',
      movingRegion: {
        id: 'moving-neck-roll',
        faceIds: ['east', 'north', 'south'],
        polygonUV: uvPoly([[SECTION_X, -H, 0], BR, TR, [SECTION_X, SECTION_X, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: neckNamed.TR ?? [0, H, 0] }],
      arrowPathLocal: arc([H * 0.9, H * 0.05, 0.006], [DINOSAUR_NECK_WIDTH * 0.55, H * 0.35, 0.006], 0.05),
      extraCreaseLines: [CENTER_LINE, NARROW_LINE, SECTION_LINE, OUTER_LINE],
      meshStrategy: 'roll',
      validationNotes: 'Step 6. Hand travel drives rollProgress. Outer band folds first, then the next, into a narrow neck.',
    }),
    step({
      id: 'dino-head',
      ordinal: 8,
      progressStage: 7,
      title: 'Shape the head',
      instruction: 'Fold the top tip outward to create the head.',
      fromSnapshotId: 'neck',
      toSnapshotId: 'headed',
      actionType: 'fold',
      hinge: HINGE_HEAD,
      direction: 'valley',
      movingRegion: {
        id: 'moving-head-tip',
        faceIds: ['east', 'north'],
        polygonUV: uvPoly([APEX, TIP_EDGE, TIP_HYP]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: headedNamed.TR ?? HEAD_DEST }],
      arrowPathLocal: arc(
        [APEX[0] + 0.002, APEX[1] - 0.004, 0.006],
        [HEAD_DEST[0] - 0.002, HEAD_DEST[1], 0.006],
        0.02,
      ),
      meshStrategy: 'hinge',
      validationNotes: 'Step 7. The rolled tip folds outward. The head is that paper, not a new mesh.',
    }),
    step({
      id: 'dino-tail',
      ordinal: 9,
      progressStage: 8,
      title: 'Shape the tail',
      instruction: 'Fold the lower-left corner inward.',
      fromSnapshotId: 'headed',
      toSnapshotId: 'tailed',
      actionType: 'fold',
      hinge: HINGE_TAIL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-tail-tip',
        faceIds: ['south', 'west'],
        polygonUV: uvPoly([BL, TAIL_BOTTOM, TAIL_HYP]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'BL', target: tailNamed.BL ?? TAIL_LANDING }],
      arrowPathLocal: arc([BL[0] + 0.008, BL[1] + 0.006, 0.004], [TAIL_LANDING[0], TAIL_LANDING[1], 0.004], 0.018),
      meshStrategy: 'hinge',
      validationNotes: 'Step 8. A short crease turns the lower-left tip into the tail.',
    }),
    step({
      id: 'dino-decorate',
      ordinal: 10,
      progressStage: 9,
      title: 'Bring it to life',
      instruction: 'Pinch to bring your dinosaur to life!',
      fromSnapshotId: 'tailed',
      toSnapshotId: 'dinosaur',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_DIAG, id: 'dino-decorate' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-dinosaur-body',
        faceIds: ['north', 'east', 'south', 'west'],
        polygonUV: uvPoly([BL, BR, TR, O]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc(
        [DINOSAUR_PINCH_AT[0] - 0.012, DINOSAUR_PINCH_AT[1], 0.01],
        [DINOSAUR_PINCH_AT[0] + 0.012, DINOSAUR_PINCH_AT[1], 0.01],
        0.012,
      ),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 9. One pinch reveals the eye and the orange back plates.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-dinosaur',
};

export const DINOSAUR_OPEN_MIN_LAYER = {
  narrow: narrowFold.minLayer,
  section: sectionFold.minLayer,
};
