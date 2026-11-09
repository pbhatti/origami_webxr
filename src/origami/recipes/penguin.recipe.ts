import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { pointOnHingeAxis } from '../creaseMath.ts';
import { turnSnapshot } from '../FoldPaper.ts';
import { applyHingeSnapshot, deformByHinge } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const PENGUIN_PAPER_COLOR = '#27B9EA';
export const PENGUIN_BACK_COLOR = '#F8FCFF';
export const PENGUIN_EDGE_COLOR = '#1688B5';
export const PENGUIN_EYE_COLOR = '#171717';
export const PENGUIN_EYE_HIGHLIGHT = '#FFFFFF';

const H = PAPER_SIZE_M / 2;
/** Diamond half-extent. Same sheet as the other corner-up animals. */
export const PENGUIN_R = H * Math.SQRT2;
const R = PENGUIN_R;

/**
 * Crease positions as fractions of R. Step 2 is the spec's below-center fold.
 * After the lower body, the next pinch flips the whole sheet.
 */
export const PENGUIN_BOTTOM_CREASE_FRAC = -0.22;
export const PENGUIN_LOWER_CREASE_FRAC = 0.32;
/**
 * How far each folded side tip crosses the centerline, as a fraction of R.
 * The crease is the perpendicular bisector between the side point and that landing.
 */
export const PENGUIN_SIDE_OVERLAP_FRAC = 0.1;
export const PENGUIN_SIDE_FRAC = (1 - PENGUIN_SIDE_OVERLAP_FRAC) / 2;
/**
 * Secondary wing crease, as a fraction of the way from the folded tip to the
 * Step 5 side crease. Near 1 puts the hinge by the outer edge, so the opened
 * tip lands beyond the body. This is not the Step 5 crease.
 */
export const PENGUIN_WING_OPEN_FRAC = 0.88;
export const PENGUIN_BEAK_FRAC = 0.78;

const L: Vec3 = [-R, 0, 0];
const RIGHT: Vec3 = [R, 0, 0];
const T: Vec3 = [0, R, 0];
const B: Vec3 = [0, -R, 0];
const O: Vec3 = [0, 0, 0];

const Y2 = PENGUIN_BOTTOM_CREASE_FRAC * R;
const X2 = R + Y2;
const P2L: Vec3 = [-X2, Y2, 0];
const P2R: Vec3 = [X2, Y2, 0];
const B_UP_Y = 2 * Y2 - (-R);

const Y3 = PENGUIN_LOWER_CREASE_FRAC * R;
const TIP3_Y = 2 * Y3 - B_UP_Y;
const X3 = ((B_UP_Y - Y3) / (B_UP_Y - Y2)) * X2;
const P3L: Vec3 = [-X3, Y3, 0];
const P3R: Vec3 = [X3, Y3, 0];

const SIDE_X = PENGUIN_SIDE_FRAC * R;
/** Where the vertical crease meets the diamond edge, in paper space. */
const SIDE_SHOULDER = (1 - PENGUIN_SIDE_FRAC) * R;
const BEAK_Y = PENGUIN_BEAK_FRAC * R;

export const PENGUIN_STEPS = [
  'center-creases',
  'bottom-corner',
  'lower-body',
  'flip-paper',
  'sides-inward',
  'side-flaps',
  'beak',
  'penguin-decoration',
] as const;

const STAGE_TITLE = [
  'Create center creases',
  'Fold the bottom corner',
  'Shape the lower body',
  'Flip the paper',
  'Fold both sides inward',
  'Spread both wings',
  'Shape the beak',
  'Bring it to life',
] as const;

const STAGE_INSTRUCTION = [
  'Fold along both center lines, then unfold.',
  'Fold the bottom corner upward.',
  'Fold the center tip downward.',
  'Rotate the paper 180° to reveal its reverse side.',
  'Fold the left and right sides toward the center.',
  'Fold both flaps outward past the body.',
  'Fold the top tip downward to create the beak.',
  'Pinch to bring your penguin to life!',
] as const;

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2 - bulge, (from[1] + to[1]) / 2, bulge], to];
}

/** Semicircle around the vertical axis. The right edge swings toward the viewer. */
function rotationArrow(radius: number, y: number): Vec3[] {
  const points: Vec3[] = [];
  for (let index = 0; index <= 8; index += 1) {
    const theta = (index / 8) * Math.PI;
    points.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius * 0.62 + 0.012]);
  }
  return points;
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

interface Folded {
  snapshot: MeshSnapshot;
  minLayer: number;
  maxLayer: number;
}

function foldStacked(from: MeshSnapshot, hinge: HingeDefinition, tip: Vec3, named: Record<string, Vec3>): Folded {
  const moved = deformByHinge(from, hinge, -180, tip);
  if (moved.movingFaceIds.size === 0) {
    throw new Error(`penguin hinge ${hinge.id} did not move any paper`);
  }
  const folded = applyHingeSnapshot(from, hinge, 'valley', 180, tip);
  const stacked = stackFlap(folded, moved.movingFaceIds);
  let minLayer = Number.POSITIVE_INFINITY;
  let maxLayer = 0;
  for (const face of stacked.faces) {
    if (moved.movingFaceIds.has(face.id)) {
      minLayer = Math.min(minLayer, face.layer);
      maxLayer = Math.max(maxLayer, face.layer);
    }
  }
  return {
    snapshot: pose(stacked, named),
    minLayer: Number.isFinite(minLayer) ? minLayer : 1,
    maxLayer,
  };
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

function pose(snapshot: MeshSnapshot, named: Record<string, Vec3>): MeshSnapshot {
  const used = new Set<number>();
  for (const face of snapshot.faces) {
    for (const index of face.vertices) {
      used.add(index);
    }
  }
  const flat = [...used].flatMap((index) => {
    const point = snapshot.vertices[index];
    return point && Math.abs(point[2]) < 0.004 ? [point] : [];
  });
  return { ...snapshot, named, outline: convexHull(flat.length > 0 ? flat : snapshot.vertices) };
}

function hingeOf(
  id: string,
  p0: Vec3,
  p1: Vec3,
  tip: Vec3,
  extra: Partial<HingeDefinition> = {},
): HingeDefinition {
  return faceViewer(
    {
      id,
      p0,
      p1,
      fixedFaces: [],
      movingFaces: ['top-left', 'top-right', 'bot-left', 'bot-right'],
      layerMode: 'packet',
      ...extra,
    },
    tip,
  );
}

/** Interior points of the bottom flap so later folds can move it without dragging the base. */
const IL: Vec3 = [-0.025, -0.09, 0];
const IR: Vec3 = [0.025, -0.09, 0];

const DIAMOND_FACES: FaceDefinition[] = [
  { id: 'top-left', vertices: [0, 4, 2], layer: 0, materialId: 'front' },
  { id: 'top-right', vertices: [2, 4, 1], layer: 0, materialId: 'front' },
  { id: 'bot-right:0', vertices: [1, 4, 6], layer: 0, materialId: 'front' },
  { id: 'bot-right:1', vertices: [6, 4, 3], layer: 0, materialId: 'front' },
  { id: 'bot-right:2', vertices: [1, 6, 3], layer: 0, materialId: 'front' },
  { id: 'bot-left:0', vertices: [3, 4, 5], layer: 0, materialId: 'front' },
  { id: 'bot-left:1', vertices: [5, 4, 0], layer: 0, materialId: 'front' },
  { id: 'bot-left:2', vertices: [3, 5, 0], layer: 0, materialId: 'front' },
];

const REST: Record<string, Vec3> = { L, RIGHT, T, B, O, IL, IR };
const DIAMOND_OUTLINE: Vec3[] = [L, T, RIGHT, B];
const diamond: MeshSnapshot = {
  vertices: [L, RIGHT, T, B, O, IL, IR],
  faces: DIAMOND_FACES,
  named: REST,
  outline: DIAMOND_OUTLINE,
};

const HINGE_VERTICAL = hingeOf('penguin-vertical', T, B, L, {
  fixedFaces: ['top-right', 'bot-right'],
  movingFaces: ['top-left', 'bot-left'],
  layerMode: 'single',
});
const HINGE_HORIZONTAL = hingeOf('penguin-horizontal', L, RIGHT, T, {
  fixedFaces: ['bot-left', 'bot-right'],
  movingFaces: ['top-left', 'top-right'],
  layerMode: 'single',
});

const verticalFolded = pose(
  applyHingeSnapshot(diamond, HINGE_VERTICAL, 'valley', 180, L),
  { ...REST, L: landmarkAfterHinge(L, HINGE_VERTICAL, 180, 'valley') },
);
const horizontalFolded = pose(
  applyHingeSnapshot(diamond, HINGE_HORIZONTAL, 'valley', 180, T),
  { ...REST, T: landmarkAfterHinge(T, HINGE_HORIZONTAL, 180, 'valley') },
);

const HINGE_BOTTOM = hingeOf('penguin-bottom', P2L, P2R, B, {
  fixedFaces: ['top-left', 'top-right'],
  movingFaces: ['bot-left', 'bot-right'],
  layerMode: 'single',
});
const B_UP: Vec3 = [0, B_UP_Y, 0];
const raised = foldStacked(diamond, HINGE_BOTTOM, B, { ...REST, B: B_UP });

const HINGE_LOWER = hingeOf('penguin-lower', P3L, P3R, B_UP, {
  minMovingLayer: raised.minLayer,
  maxMovingLayer: raised.maxLayer,
});
const TIP3: Vec3 = [0, TIP3_Y, 0];
const lowered = foldStacked(raised.snapshot, HINGE_LOWER, B_UP, { ...raised.snapshot.named, B: TIP3 });

const HINGE_FLIP: HingeDefinition = {
  id: 'penguin-flip',
  p0: [0, -0.04, 0],
  p1: [0, 0.04, 0],
  fixedFaces: [],
  movingFaces: [],
  angleHint: [R * 0.6, 0, 0],
};

/**
 * The flip turns the packet over, so layers that faced the viewer are now
 * buried. The former base sheet becomes the top and its white side shows.
 */
function revealReverseSide(snapshot: MeshSnapshot): MeshSnapshot {
  const maxLayer = snapshot.faces.reduce((max, face) => Math.max(max, face.layer), 0);
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => ({ ...face, layer: maxLayer - face.layer })),
  };
}

/** 180° around Y. The white back faces the viewer and the head stays at the top. */
const turned = pose(
  revealReverseSide(turnSnapshot(lowered.snapshot, 180)),
  Object.fromEntries(
    Object.entries(lowered.snapshot.named ?? {}).map(([key, point]) => [key, [-point[0], point[1], -point[2]] as Vec3]),
  ),
);

function cornerKey(side: 'left' | 'right'): 'L' | 'RIGHT' {
  const leftIsL = (turned.named?.L?.[0] ?? 0) < (turned.named?.RIGHT?.[0] ?? 0);
  if (side === 'left') {
    return leftIsL ? 'L' : 'RIGHT';
  }
  return leftIsL ? 'RIGHT' : 'L';
}

const LEFT_KEY = cornerKey('left');
const RIGHT_KEY = cornerKey('right');
const LEFT_TIP = turned.named?.[LEFT_KEY] ?? [-R, 0, 0];
const RIGHT_TIP = turned.named?.[RIGHT_KEY] ?? [R, 0, 0];

const HINGE_SIDE_L = hingeOf(
  'penguin-side-left',
  [-SIDE_X, -R, 0],
  [-SIDE_X, R, 0],
  LEFT_TIP,
);
const HINGE_SIDE_R = hingeOf(
  'penguin-side-right',
  [SIDE_X, R, 0],
  [SIDE_X, -R, 0],
  RIGHT_TIP,
);
const LEFT_IN = landmarkAfterHinge(LEFT_TIP, HINGE_SIDE_L, 180, 'valley');
const RIGHT_IN = landmarkAfterHinge(RIGHT_TIP, HINGE_SIDE_R, 180, 'valley');
const sideLeft = foldStacked(turned, HINGE_SIDE_L, LEFT_TIP, {
  ...turned.named,
  [LEFT_KEY]: [LEFT_IN[0], LEFT_IN[1], 0],
});
const sided = foldStacked(sideLeft.snapshot, HINGE_SIDE_R, RIGHT_TIP, {
  ...sideLeft.snapshot.named,
  [RIGHT_KEY]: [RIGHT_IN[0], RIGHT_IN[1], 0],
});

function copyPoint(point: Vec3): Vec3 {
  return [point[0], point[1], point[2]];
}

function layerSpan(min: number, max: number): number[] {
  const layers: number[] = [];
  for (let layer = min; layer <= max; layer += 1) {
    layers.push(layer);
  }
  if (layers.length === 0) {
    throw new Error('penguin flap is missing');
  }
  return layers;
}

const LEFT_FLAP_LAYERS = layerSpan(sideLeft.minLayer, sideLeft.maxLayer);
const RIGHT_FLAP_LAYERS = layerSpan(sided.minLayer, sided.maxLayer);
/**
 * Secondary crease, closer to the Step 5 edge than to the center.
 * Reflecting the crossed tip across it carries the wing past the body.
 */
const LEFT_OPEN_X = LEFT_IN[0] + (-SIDE_X - LEFT_IN[0]) * PENGUIN_WING_OPEN_FRAC;
const RIGHT_OPEN_X = RIGHT_IN[0] + (SIDE_X - RIGHT_IN[0]) * PENGUIN_WING_OPEN_FRAC;
/** Height of the dotted crease where it meets the triangular flap. */
const FLAP_CREASE_Y = SIDE_SHOULDER * PENGUIN_WING_OPEN_FRAC;
const LEFT_OPEN_LINE: [Vec3, Vec3] = [
  [LEFT_OPEN_X, -FLAP_CREASE_Y, 0],
  [LEFT_OPEN_X, FLAP_CREASE_Y, 0],
];
const RIGHT_OPEN_LINE: [Vec3, Vec3] = [
  [RIGHT_OPEN_X, FLAP_CREASE_Y, 0],
  [RIGHT_OPEN_X, -FLAP_CREASE_Y, 0],
];

/** Free the tip side so it can turn on the outer crease while the body edge stays attached. */
function peelInnerHalf(snapshot: MeshSnapshot, layers: number[], hingeX: number, tipX: number): MeshSnapshot {
  const layerSet = new Set(layers);
  const dir = Math.sign(tipX - hingeX) || 1;
  const onTip = (point: Vec3) => dir * (point[0] - hingeX) > 0.0015;
  const tipFaces = new Set<string>();
  for (const face of snapshot.faces) {
    if (!layerSet.has(face.layer)) {
      continue;
    }
    const points = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [point] : [];
    });
    if (points.some(onTip)) {
      tipFaces.add(face.id);
    }
  }
  const usedByTip = new Set<number>();
  const usedByStill = new Set<number>();
  for (const face of snapshot.faces) {
    const bucket = tipFaces.has(face.id) ? usedByTip : usedByStill;
    for (const index of face.vertices) {
      bucket.add(index);
    }
  }
  const vertices = snapshot.vertices.map(copyPoint);
  const remap = new Map<number, number>();
  const hinge: [Vec3, Vec3] = [
    [hingeX, -R, 0],
    [hingeX, R, 0],
  ];
  for (const index of usedByTip) {
    if (!usedByStill.has(index)) {
      continue;
    }
    const point = vertices[index];
    if (!point || !onTip(point) || pointOnHingeAxis(point, hinge[0], hinge[1])) {
      continue;
    }
    remap.set(index, vertices.length);
    vertices.push(copyPoint(point));
  }
  return {
    ...snapshot,
    vertices,
    faces: snapshot.faces.map((face) => {
      if (!tipFaces.has(face.id)) {
        return face;
      }
      return { ...face, vertices: face.vertices.map((index) => remap.get(index) ?? index) };
    }),
  };
}

function reverseInnerHalf(snapshot: MeshSnapshot, layers: number[], hingeX: number, tipX: number): MeshSnapshot {
  const layerSet = new Set(layers);
  const dir = Math.sign(tipX - hingeX) || 1;
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => {
      if (!layerSet.has(face.layer)) {
        return face;
      }
      const points = face.vertices.flatMap((index) => {
        const point = snapshot.vertices[index];
        return point ? [point] : [];
      });
      if (points.length < 3) {
        return face;
      }
      const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      if (dir * (cx - hingeX) <= 0.001) {
        return face;
      }
      const [a, b, c] = points;
      if (!a || !b || !c) {
        return face;
      }
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return nz >= 0 ? { ...face, vertices: [...face.vertices].reverse() } : face;
    }),
  };
}

const peeledFlaps = peelInnerHalf(
  peelInnerHalf(sided.snapshot, LEFT_FLAP_LAYERS, LEFT_OPEN_X, LEFT_IN[0]),
  RIGHT_FLAP_LAYERS,
  RIGHT_OPEN_X,
  RIGHT_IN[0],
);
const flapReady = pose(
  reverseInnerHalf(
    reverseInnerHalf(peeledFlaps, LEFT_FLAP_LAYERS, LEFT_OPEN_X, LEFT_IN[0]),
    RIGHT_FLAP_LAYERS,
    RIGHT_OPEN_X,
    RIGHT_IN[0],
  ),
  sided.snapshot.named ?? {},
);
const OPEN_REACH = Math.abs(LEFT_IN[0] - LEFT_OPEN_X) + 0.008;
const HINGE_OPEN_L = hingeOf(
  'penguin-flap-left',
  LEFT_OPEN_LINE[0],
  LEFT_OPEN_LINE[1],
  [LEFT_IN[0], LEFT_IN[1], 0],
  {
    minMovingLayer: Math.min(...LEFT_FLAP_LAYERS),
    maxMovingLayer: Math.max(...LEFT_FLAP_LAYERS),
    reachM: OPEN_REACH,
  },
);
const HINGE_OPEN_R = hingeOf(
  'penguin-flap-right',
  RIGHT_OPEN_LINE[0],
  RIGHT_OPEN_LINE[1],
  [RIGHT_IN[0], RIGHT_IN[1], 0],
  {
    minMovingLayer: Math.min(...RIGHT_FLAP_LAYERS),
    maxMovingLayer: Math.max(...RIGHT_FLAP_LAYERS),
    reachM: OPEN_REACH,
  },
);
const LEFT_OUT = landmarkAfterHinge([LEFT_IN[0], LEFT_IN[1], 0], HINGE_OPEN_L, 180, 'valley');
const RIGHT_OUT = landmarkAfterHinge([RIGHT_IN[0], RIGHT_IN[1], 0], HINGE_OPEN_R, 180, 'valley');
function showBlue(snapshot: MeshSnapshot, minLayer: number): MeshSnapshot {
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => {
      if (face.layer < minLayer) {
        return face;
      }
      const points = face.vertices.flatMap((index) => {
        const point = snapshot.vertices[index];
        return point ? [point] : [];
      });
      if (points.length < 3) {
        return face;
      }
      const [a, b, c] = points;
      if (!a || !b || !c) {
        return face;
      }
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return nz < 0 ? { ...face, vertices: [...face.vertices].reverse() } : face;
    }),
  };
}

const openLeftFold = foldStacked(flapReady, HINGE_OPEN_L, [LEFT_IN[0], LEFT_IN[1], 0], {
  ...flapReady.named,
  [LEFT_KEY]: [LEFT_OUT[0], LEFT_OUT[1], 0],
});
const openLeft = { ...openLeftFold, snapshot: showBlue(openLeftFold.snapshot, openLeftFold.minLayer) };
const openedFold = foldStacked(openLeft.snapshot, HINGE_OPEN_R, [RIGHT_IN[0], RIGHT_IN[1], 0], {
  ...openLeft.snapshot.named,
  [RIGHT_KEY]: [RIGHT_OUT[0], RIGHT_OUT[1], 0],
});
const opened = { ...openedFold, snapshot: showBlue(openedFold.snapshot, openLeft.minLayer) };

const BEAK_HALF = R - BEAK_Y + 0.004;
const HINGE_BEAK = hingeOf(
  'penguin-beak',
  [-BEAK_HALF, BEAK_Y, 0],
  [BEAK_HALF, BEAK_Y, 0],
  T,
  { reachM: R - BEAK_Y + 0.008 },
);
const BEAK_TIP = landmarkAfterHinge(T, HINGE_BEAK, 180, 'valley');
const beaked = foldStacked(opened.snapshot, HINGE_BEAK, T, {
  ...opened.snapshot.named,
  T: [BEAK_TIP[0], BEAK_TIP[1], 0],
});
const penguin = pose(beaked.snapshot, beaked.snapshot.named ?? {});

export const PENGUIN_BEAK_TIP: Vec3 = [BEAK_TIP[0], BEAK_TIP[1], 0];
export const PENGUIN_FEATURE_Z = 0.012;
export const PENGUIN_EYE_L: Vec3 = [-0.014, BEAK_Y - 0.02, PENGUIN_FEATURE_Z];
export const PENGUIN_EYE_R: Vec3 = [0.014, BEAK_Y - 0.02, PENGUIN_FEATURE_Z];
export const PENGUIN_PINCH_AT: Vec3 = [0, 0.01, 0.014];
export const PENGUIN_NAMED = REST;

const VERTICAL_LINE: [Vec3, Vec3] = [HINGE_VERTICAL.p0, HINGE_VERTICAL.p1];
const HORIZONTAL_LINE: [Vec3, Vec3] = [HINGE_HORIZONTAL.p0, HINGE_HORIZONTAL.p1];

export const PENGUIN_RECIPE: OrigamiRecipe = {
  id: 'origami-penguin',
  name: 'Origami penguin',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'penguin-vertical', p0: HINGE_VERTICAL.p0, p1: HINGE_VERTICAL.p1, direction: 'valley' },
    { id: 'penguin-horizontal', p0: HINGE_HORIZONTAL.p0, p1: HINGE_HORIZONTAL.p1, direction: 'valley' },
    { id: 'penguin-bottom', p0: HINGE_BOTTOM.p0, p1: HINGE_BOTTOM.p1, direction: 'valley' },
    { id: 'penguin-lower', p0: HINGE_LOWER.p0, p1: HINGE_LOWER.p1, direction: 'valley' },
    { id: 'penguin-side-left', p0: HINGE_SIDE_L.p0, p1: HINGE_SIDE_L.p1, direction: 'valley' },
    { id: 'penguin-side-right', p0: HINGE_SIDE_R.p0, p1: HINGE_SIDE_R.p1, direction: 'valley' },
    { id: 'penguin-flap-left', p0: HINGE_OPEN_L.p0, p1: HINGE_OPEN_L.p1, direction: 'valley' },
    { id: 'penguin-flap-right', p0: HINGE_OPEN_R.p0, p1: HINGE_OPEN_R.p1, direction: 'valley' },
    { id: 'penguin-beak', p0: HINGE_BEAK.p0, p1: HINGE_BEAK.p1, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    'vertical-folded': verticalFolded,
    'horizontal-folded': horizontalFolded,
    raised: raised.snapshot,
    lowered: lowered.snapshot,
    turned,
    'side-left': sideLeft.snapshot,
    sided: sided.snapshot,
    'open-left': openLeft.snapshot,
    'flap-ready': flapReady,
    opened: opened.snapshot,
    beaked: beaked.snapshot,
    penguin,
  },
  finalSilhouette: penguin.outline,
  silhouetteToleranceM: 0.05,
  steps: [
    step({
      id: 'penguin-vertical-fold',
      ordinal: 1,
      progressStage: 1,
      title: STAGE_TITLE[0],
      instruction: STAGE_INSTRUCTION[0],
      fromSnapshotId: 'diamond',
      toSnapshotId: 'vertical-folded',
      actionType: 'fold',
      hinge: HINGE_VERTICAL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-left-half',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([T, L, B]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: RIGHT }],
      arrowPathLocal: arc([L[0] + 0.02, 0, 0.004], [RIGHT[0] - 0.02, 0, 0.004], 0.02),
      extraCreaseLines: [HORIZONTAL_LINE],
      lockCreaseIds: ['penguin-vertical'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1a. Vertical center crease. Both guides stay visible until the diamond is creased both ways.',
    }),
    step({
      id: 'penguin-vertical-open',
      ordinal: 2,
      progressStage: 1,
      title: STAGE_TITLE[0],
      instruction: STAGE_INSTRUCTION[0],
      fromSnapshotId: 'vertical-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_VERTICAL, id: 'penguin-vertical-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-vertical',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([T, RIGHT, B]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L }],
      arrowPathLocal: arc([RIGHT[0] - 0.03, 0.01, 0.004], [L[0] + 0.03, 0.01, 0.004], 0.02),
      extraCreaseLines: [HORIZONTAL_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. The vertical crease stays locked.',
    }),
    step({
      id: 'penguin-horizontal-fold',
      ordinal: 3,
      progressStage: 1,
      title: STAGE_TITLE[0],
      instruction: STAGE_INSTRUCTION[0],
      fromSnapshotId: 'diamond',
      toSnapshotId: 'horizontal-folded',
      actionType: 'fold',
      hinge: HINGE_HORIZONTAL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-top-half',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([L, T, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: B }],
      arrowPathLocal: arc([0, T[1] - 0.02, 0.004], [0, B[1] + 0.02, 0.004], 0.02),
      extraCreaseLines: [VERTICAL_LINE],
      lockCreaseIds: ['penguin-horizontal'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1b. Horizontal center crease. The step does not advance until this crease exists too.',
    }),
    step({
      id: 'penguin-horizontal-open',
      ordinal: 4,
      progressStage: 1,
      title: STAGE_TITLE[0],
      instruction: STAGE_INSTRUCTION[0],
      fromSnapshotId: 'horizontal-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_HORIZONTAL, id: 'penguin-horizontal-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-horizontal',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([L, B, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T }],
      arrowPathLocal: arc([0.01, B[1] + 0.03, 0.004], [0.01, T[1] - 0.03, 0.004], 0.02),
      extraCreaseLines: [VERTICAL_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. Full blue diamond with both center creases kept.',
    }),
    step({
      id: 'penguin-bottom',
      ordinal: 5,
      progressStage: 2,
      title: STAGE_TITLE[1],
      instruction: STAGE_INSTRUCTION[1],
      fromSnapshotId: 'diamond',
      toSnapshotId: 'raised',
      actionType: 'fold',
      hinge: HINGE_BOTTOM,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([P2L, B, P2R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B_UP }],
      arrowPathLocal: arc([0, B[1] + 0.02, 0.004], [0, B_UP[1] - 0.01, 0.004], 0.01),
      lockCreaseIds: ['penguin-bottom'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2. Horizontal crease below the center. The bottom point lands above that line.',
    }),
    step({
      id: 'penguin-lower',
      ordinal: 6,
      progressStage: 3,
      title: STAGE_TITLE[2],
      instruction: STAGE_INSTRUCTION[2],
      fromSnapshotId: 'raised',
      toSnapshotId: 'lowered',
      actionType: 'fold',
      hinge: HINGE_LOWER,
      direction: 'valley',
      movingRegion: {
        id: 'moving-lower-tip',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([P3L, B_UP, P3R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: TIP3 }],
      arrowPathLocal: arc([0, B_UP[1] - 0.008, 0.006], [0, TIP3[1] + 0.008, 0.006], 0.02),
      lockCreaseIds: ['penguin-lower'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3. Only the raised flap folds. The next pinch flips the whole sheet.',
    }),
    step({
      id: 'penguin-flip',
      ordinal: 7,
      progressStage: 4,
      title: STAGE_TITLE[3],
      instruction: STAGE_INSTRUCTION[3],
      fromSnapshotId: 'lowered',
      toSnapshotId: 'turned',
      actionType: 'fold',
      hinge: HINGE_FLIP,
      direction: 'valley',
      movingRegion: {
        id: 'moving-flip',
        faceIds: ['top-left', 'top-right', 'bot-left', 'bot-right'],
        polygonUV: uvPoly([L, T, RIGHT, B]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: rotationArrow(0.105, 0.01),
      meshStrategy: 'turn',
      validationNotes: 'Step 4. The whole folded sheet rotates 180° around its vertical axis.',
    }),
    step({
      id: 'penguin-side-left',
      ordinal: 8,
      progressStage: 5,
      title: STAGE_TITLE[4],
      instruction: STAGE_INSTRUCTION[4],
      fromSnapshotId: 'turned',
      toSnapshotId: 'side-left',
      actionType: 'fold',
      hinge: HINGE_SIDE_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-left',
        faceIds: ['top-left', 'bot-left', 'top-right', 'bot-right'],
        polygonUV: uvPoly([[-R, 0, 0], [-SIDE_X, SIDE_SHOULDER, 0], [-SIDE_X, -SIDE_SHOULDER, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: LEFT_KEY, target: [LEFT_IN[0], LEFT_IN[1], 0] }],
      arrowPathLocal: arc([LEFT_TIP[0] + 0.02, LEFT_TIP[1], 0.006], [LEFT_IN[0] - 0.01, LEFT_IN[1], 0.006], 0.02),
      lockCreaseIds: ['penguin-side-left'],
      meshStrategy: 'hinge',
      parallelGroup: 'penguin-sides',
      validationNotes: 'Step 5 left. Starts on the flipped reverse side. One side does not finish the step.',
    }),
    step({
      id: 'penguin-side-right',
      ordinal: 9,
      progressStage: 5,
      title: STAGE_TITLE[4],
      instruction: STAGE_INSTRUCTION[4],
      fromSnapshotId: 'turned',
      toSnapshotId: 'sided',
      actionType: 'fold',
      hinge: HINGE_SIDE_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-right',
        faceIds: ['top-left', 'bot-left', 'top-right', 'bot-right'],
        polygonUV: uvPoly([[R, 0, 0], [SIDE_X, SIDE_SHOULDER, 0], [SIDE_X, -SIDE_SHOULDER, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: RIGHT_KEY, target: [RIGHT_IN[0], RIGHT_IN[1], 0] }],
      arrowPathLocal: arc([RIGHT_TIP[0] - 0.02, RIGHT_TIP[1], 0.006], [RIGHT_IN[0] + 0.01, RIGHT_IN[1], 0.006], -0.02),
      lockCreaseIds: ['penguin-side-right'],
      meshStrategy: 'hinge',
      parallelGroup: 'penguin-sides',
      validationNotes: 'Step 5 right. Both sides must snap before the step advances.',
    }),
    step({
      id: 'penguin-flap-left',
      ordinal: 10,
      progressStage: 6,
      title: STAGE_TITLE[5],
      instruction: STAGE_INSTRUCTION[5],
      fromSnapshotId: 'flap-ready',
      toSnapshotId: 'open-left',
      actionType: 'fold',
      hinge: HINGE_OPEN_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-flap-left',
        faceIds: ['top-left', 'bot-left', 'top-right', 'bot-right'],
        polygonUV: uvPoly([
          [LEFT_OPEN_X, FLAP_CREASE_Y, 0],
          [LEFT_IN[0], LEFT_IN[1], 0],
          [LEFT_OPEN_X, -FLAP_CREASE_Y, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: LEFT_KEY, target: [LEFT_OUT[0], LEFT_OUT[1], 0] }],
      arrowPathLocal: arc([LEFT_IN[0], LEFT_IN[1] + 0.01, 0.008], [LEFT_OUT[0] + 0.01, LEFT_OUT[1], 0.008], 0.03),
      lockCreaseIds: ['penguin-flap-left'],
      meshStrategy: 'hinge',
      parallelGroup: 'penguin-flaps',
      validationNotes: 'Step 6 left. The outer crease swings the flap past the body. The Step 5 fold stays put.',
    }),
    step({
      id: 'penguin-flap-right',
      ordinal: 11,
      progressStage: 6,
      title: STAGE_TITLE[5],
      instruction: STAGE_INSTRUCTION[5],
      fromSnapshotId: 'flap-ready',
      toSnapshotId: 'opened',
      actionType: 'fold',
      hinge: HINGE_OPEN_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-flap-right',
        faceIds: ['top-left', 'bot-left', 'top-right', 'bot-right'],
        polygonUV: uvPoly([
          [RIGHT_OPEN_X, FLAP_CREASE_Y, 0],
          [RIGHT_IN[0], RIGHT_IN[1], 0],
          [RIGHT_OPEN_X, -FLAP_CREASE_Y, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: RIGHT_KEY, target: [RIGHT_OUT[0], RIGHT_OUT[1], 0] }],
      arrowPathLocal: arc([RIGHT_IN[0], RIGHT_IN[1] + 0.01, 0.008], [RIGHT_OUT[0] - 0.01, RIGHT_OUT[1], 0.008], -0.03),
      lockCreaseIds: ['penguin-flap-right'],
      meshStrategy: 'hinge',
      parallelGroup: 'penguin-flaps',
      validationNotes: 'Step 6 right. Both wings pass the body edge, and the beak starts from that shape.',
    }),
    step({
      id: 'penguin-beak',
      ordinal: 12,
      progressStage: 7,
      title: STAGE_TITLE[6],
      instruction: STAGE_INSTRUCTION[6],
      fromSnapshotId: 'opened',
      toSnapshotId: 'beaked',
      actionType: 'fold',
      hinge: HINGE_BEAK,
      direction: 'valley',
      movingRegion: {
        id: 'moving-beak',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([[-BEAK_HALF, BEAK_Y, 0], T, [BEAK_HALF, BEAK_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: [BEAK_TIP[0], BEAK_TIP[1], 0] }],
      arrowPathLocal: arc([-0.01, T[1] - 0.012, 0.008], [0.012, BEAK_TIP[1] + 0.01, 0.008], 0.016),
      lockCreaseIds: ['penguin-beak'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 7. Only the small top tip folds down into the beak. The Step 6 wings stay extended.',
    }),
    step({
      id: 'penguin-decorate',
      ordinal: 13,
      progressStage: 8,
      title: STAGE_TITLE[7],
      instruction: STAGE_INSTRUCTION[7],
      fromSnapshotId: 'beaked',
      toSnapshotId: 'penguin',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_BEAK, id: 'penguin-decorate' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-penguin-life',
        faceIds: ['top-left', 'top-right', 'bot-left', 'bot-right'],
        polygonUV: uvPoly([[-0.02, 0.02, 0], [0, 0.045, 0], [0.02, 0.02, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.016, PENGUIN_PINCH_AT[1], 0.012], [0.016, PENGUIN_PINCH_AT[1], 0.012], 0.012),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 8. One pinch shows the eyes. No decorations exist before this step.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-penguin',
};
