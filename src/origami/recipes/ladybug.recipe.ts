import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { applyHingeSnapshot, deformByHinge } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const LADYBUG_PAPER_COLOR = '#F45132';
export const LADYBUG_BACK_COLOR = '#FFF1EA';
export const LADYBUG_EDGE_COLOR = '#BD3527';
export const LADYBUG_MARK_COLOR = '#2B1714';

const H = PAPER_SIZE_M / 2;
const R = H * Math.SQRT2;

/**
 * Crease positions measured from the "Make a Ladybug" diagram, as fractions
 * of the diamond half-extent R. Each panel was framed on its own left/right
 * corners (y = 0) and bottom tip (y = -R).
 *
 * Step 2 dash sits in the upper third, 0.34R above center.
 * Step 3 only nips the lowered point so the downward tip is still there.
 * Step 4 folds that tip up at -0.06R. The turned flap is the red triangle
 * in the white band; anything that would show ivory goes behind the band.
 * Step 6 side dashes are at ±0.73R and the bottom dash is at -0.74R.
 */
export const LADYBUG_TOP_CREASE_FRAC = 0.34;
export const LADYBUG_TIP_CREASE_FRAC = -0.3;
export const LADYBUG_HEAD_CREASE_FRAC = -0.06;
export const LADYBUG_SIDE_CREASE_FRAC = 0.73;
export const LADYBUG_BOTTOM_CREASE_FRAC = -0.74;
/** Step 5 diagonal meets the flat top this far from center. */
export const LADYBUG_CORNER_TOP_X_FRAC = 0.5;
/** How far the step 5 diagonal walks from the shoulder toward the side tip. */
export const LADYBUG_CORNER_EDGE_T = 0.32;

const L: Vec3 = [-R, 0, 0];
const RIGHT: Vec3 = [R, 0, 0];
const T: Vec3 = [0, R, 0];
const B: Vec3 = [0, -R, 0];
const O: Vec3 = [0, 0, 0];

const TOP_Y = LADYBUG_TOP_CREASE_FRAC * R;
const SHOULDER_X = R - TOP_Y;
const SHOULDER_L: Vec3 = [-SHOULDER_X, TOP_Y, 0];
const SHOULDER_R: Vec3 = [SHOULDER_X, TOP_Y, 0];

const TIP_Y = LADYBUG_TIP_CREASE_FRAC * R;
const TIP_HALF = 0.22 * R;

const HEAD_Y = LADYBUG_HEAD_CREASE_FRAC * R;
const HEAD_HALF = 0.55 * R;

const SIDE_X = LADYBUG_SIDE_CREASE_FRAC * R;
const SIDE_HALF_Y = R - SIDE_X;
const BOTTOM_Y = LADYBUG_BOTTOM_CREASE_FRAC * R;
const BOTTOM_HALF = R + BOTTOM_Y;

const CORNER_TOP_X = LADYBUG_CORNER_TOP_X_FRAC * R;
const CORNER_EDGE_L: Vec3 = [
  SHOULDER_L[0] + LADYBUG_CORNER_EDGE_T * (L[0] - SHOULDER_L[0]),
  SHOULDER_L[1] + LADYBUG_CORNER_EDGE_T * (L[1] - SHOULDER_L[1]),
  0,
];
const CORNER_EDGE_R: Vec3 = [-CORNER_EDGE_L[0], CORNER_EDGE_L[1], 0];
const CORNER_TOP_L: Vec3 = [-CORNER_TOP_X, TOP_Y, 0];
const CORNER_TOP_R: Vec3 = [CORNER_TOP_X, TOP_Y, 0];

const DIAMOND_OUTLINE: Vec3[] = [L, T, RIGHT, B];

export const LADYBUG_STEPS = [
  'Create center creases',
  'Fold the top corner',
  'Fold the head flap',
  'Shape the head detail',
  'Fold upper corners',
  'Round the body',
  'Bring it to life',
] as const;

/** Eyes sit on the white trapezoid, close together and above the red body. */
export const LADYBUG_EYES: ReadonlyArray<{ at: Vec3; radius: number }> = [
  { at: [-0.12 * R, 0.24 * R, 0], radius: 0.006 },
  { at: [0.12 * R, 0.24 * R, 0], radius: 0.006 },
];

/**
 * Five wing spots. Fractions come from step 7 of the diagram: two upper,
 * one larger center spot lower on the midline, two lower.
 */
export const LADYBUG_SPOTS: ReadonlyArray<{ at: Vec3; radius: number }> = [
  { at: [-0.387 * R, -0.154 * R, 0], radius: 0.0125 },
  { at: [0.387 * R, -0.154 * R, 0], radius: 0.0125 },
  { at: [0, -0.324 * R, 0], radius: 0.0145 },
  { at: [-0.387 * R, -0.485 * R, 0], radius: 0.0125 },
  { at: [0.387 * R, -0.485 * R, 0], radius: 0.0125 },
];

/** Soft wing division. Thinner than the paper edge (1.6 mm). */
export const LADYBUG_SEAM: { from: Vec3; to: Vec3; width: number } = {
  from: [0, -0.16 * R, 0],
  to: [0, -0.42 * R, 0],
  width: 0.0009,
};

export const LADYBUG_FEATURE_Z = 0.0065;
export const LADYBUG_PINCH_AT: Vec3 = [0, -0.22 * R, 0.012];
/**
 * Invisible grab pad around the step-3 tip. The folded point is only a few
 * millimetres tall, so Quest fingers need a disk about 2 cm across the flap,
 * sitting in front of the sheet rather than behind it.
 */
export const LADYBUG_TIP_HIT_RADIUS_M = 0.02;
/** Lift of that pad toward the viewer, ahead of the paper and the crease guide. */
export const LADYBUG_TIP_TARGET_LIFT_M = 0.012;

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, bulge], to];
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
  const levels = [...new Set(moving.map((face) => face.layer))].sort((a, b) => a - b);
  const remap = new Map(levels.map((level, index) => [level, maxStationary + 1 + index]));
  return {
    ...snapshot,
    faces: snapshot.faces.map((face) => {
      const next = remap.get(face.layer);
      return movingIds.has(face.id) && next != null ? { ...face, layer: next } : face;
    }),
  };
}

/**
 * Stacked flaps share crease vertices with the sheet under them. A later fold
 * of only the flap has to move its own copy, or the shared vertex stays put
 * and the flap stretches.
 */
function separateLayers(snapshot: MeshSnapshot, minLayer: number): MeshSnapshot {
  const high = new Set<number>();
  const low = new Set<number>();
  for (const face of snapshot.faces) {
    const bag = face.layer >= minLayer ? high : low;
    for (const index of face.vertices) {
      bag.add(index);
    }
  }
  const vertices = snapshot.vertices.map((vertex) => [...vertex] as Vec3);
  const remap = new Map<number, number>();
  for (const index of high) {
    if (!low.has(index)) {
      continue;
    }
    const source = vertices[index];
    if (!source) {
      continue;
    }
    remap.set(index, vertices.length);
    vertices.push([...source]);
  }
  if (remap.size === 0) {
    return snapshot;
  }
  return {
    ...snapshot,
    vertices,
    faces: snapshot.faces.map((face) =>
      face.layer < minLayer
        ? face
        : { ...face, vertices: face.vertices.map((index) => remap.get(index) ?? index) },
    ),
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
  return { snapshot: stacked, minLayer: Number.isFinite(minLayer) ? minLayer : 1 };
}

function polygonWindZ(vertices: Vec3[], indices: number[]): number {
  let z = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const current = vertices[indices[i] ?? -1];
    const next = vertices[indices[(i + 1) % indices.length] ?? -1];
    if (!current || !next) {
      continue;
    }
    z += (current[0] - next[0]) * (current[1] + next[1]);
  }
  return z;
}

/**
 * Turn the downward white tip up. The second turn shows red and stays in
 * front — that is the small triangle in the white band. A further turn would
 * show ivory on top of the band; those faces go behind the upper sheet, with
 * the winding reversed so a peeking edge is still red.
 */
function foldHeadDetail(from: MeshSnapshot, hinge: HingeDefinition, tip: Vec3): { snapshot: MeshSnapshot; minLayer: number } {
  const moved = deformByHinge(from, hinge, -180, tip);
  const folded = applyHingeSnapshot(from, hinge, 'valley', 180, tip);
  const stacked = stackFlap(folded, moved.movingFaceIds);
  const occluder = stacked.faces.reduce((min, face) => {
    if (moved.movingFaceIds.has(face.id) || face.layer <= 0) {
      return min;
    }
    return Math.min(min, face.layer);
  }, Number.POSITIVE_INFINITY);
  const behind = Number.isFinite(occluder) ? occluder : 1;
  let minLayer = Number.POSITIVE_INFINITY;
  const faces = stacked.faces.map((face) => {
    if (!moved.movingFaceIds.has(face.id)) {
      return face.layer >= behind ? { ...face, layer: face.layer + 1 } : face;
    }
    if (polygonWindZ(stacked.vertices, face.vertices) > 0) {
      minLayer = Math.min(minLayer, behind);
      return { ...face, vertices: [...face.vertices].reverse(), layer: behind };
    }
    const layer = face.layer + 1;
    minLayer = Math.min(minLayer, layer);
    return { ...face, layer };
  });
  return { snapshot: { ...stacked, faces }, minLayer: Number.isFinite(minLayer) ? minLayer : 1 };
}

function faceViewer(hinge: HingeDefinition, tip: Vec3): HingeDefinition {
  const lifted = landmarkAfterHinge(tip, hinge, 90, 'valley');
  if (lifted[2] >= 0) {
    return hinge;
  }
  return { ...hinge, p0: hinge.p1, p1: hinge.p0 };
}

function step(
  input: Omit<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM' | 'creaseLineLocal'> &
    Partial<Pick<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM' | 'creaseLineLocal'>>,
): FoldStep {
  return {
    angleToleranceDeg: 12,
    targetPointToleranceM: 0.018,
    ...input,
    creaseLineLocal: [input.hinge.p0, input.hinge.p1],
  };
}

const DIAMOND_FACES: FaceDefinition[] = [
  { id: 'top-left', vertices: [0, 2, 4], layer: 0, materialId: 'front' },
  { id: 'top-right', vertices: [2, 1, 4], layer: 0, materialId: 'front' },
  { id: 'bot-right', vertices: [1, 3, 4], layer: 0, materialId: 'front' },
  { id: 'bot-left', vertices: [3, 0, 4], layer: 0, materialId: 'front' },
];

const REST = { L, RIGHT, T, B, O, SL: SHOULDER_L, SR: SHOULDER_R };
const diamond: MeshSnapshot = {
  vertices: [L, RIGHT, T, B, O],
  faces: DIAMOND_FACES,
  named: REST,
  outline: DIAMOND_OUTLINE,
};

const HINGE_VERTICAL: HingeDefinition = faceViewer(
  {
    id: 'ladybug-vertical',
    p0: T,
    p1: B,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
  },
  L,
);

const HINGE_HORIZONTAL: HingeDefinition = faceViewer(
  {
    id: 'ladybug-horizontal',
    p0: L,
    p1: RIGHT,
    fixedFaces: ['top-left', 'top-right'],
    movingFaces: ['bot-left', 'bot-right'],
  },
  B,
);

const HINGE_TOP: HingeDefinition = faceViewer(
  {
    id: 'ladybug-top',
    p0: SHOULDER_L,
    p1: SHOULDER_R,
    fixedFaces: ['bot-left', 'bot-right'],
    movingFaces: ['top-left', 'top-right'],
  },
  T,
);

const toppedFold = foldStacked(diamond, HINGE_TOP, T);
const T_DOWN = landmarkAfterHinge(T, HINGE_TOP, 180, 'valley');
const topped: MeshSnapshot = {
  ...toppedFold.snapshot,
  outline: [SHOULDER_L, L, B, RIGHT, SHOULDER_R],
  named: { ...REST, T: T_DOWN },
};

const HINGE_TIP: HingeDefinition = {
  ...faceViewer(
    {
      id: 'ladybug-tip',
      p0: [-TIP_HALF, TIP_Y, 0],
      p1: [TIP_HALF, TIP_Y, 0],
      fixedFaces: ['bot-left', 'bot-right'],
      movingFaces: ['top-left', 'top-right'],
      minMovingLayer: toppedFold.minLayer,
      reachM: 0.2 * R + 0.008,
    },
    T_DOWN,
  ),
  // Keep the moving hint on the tip itself. A finger that lands just above
  // the short crease must still swing that tip upward, not the sheet.
  angleHint: T_DOWN,
};

export const LADYBUG_TIP_POINT: Vec3 = T_DOWN;

const tippedFold = foldStacked(topped, HINGE_TIP, T_DOWN);
const T_UP = landmarkAfterHinge(T_DOWN, HINGE_TIP, 180, 'valley');
const tipped: MeshSnapshot = separateLayers(
  separateLayers(
    {
      ...tippedFold.snapshot,
      outline: [SHOULDER_L, L, B, RIGHT, SHOULDER_R],
      named: { ...topped.named, T: T_UP },
    },
    toppedFold.minLayer,
  ),
  tippedFold.minLayer,
);

const HINGE_HEAD: HingeDefinition = faceViewer(
  {
    id: 'ladybug-head',
    p0: [-HEAD_HALF, HEAD_Y, 0],
    p1: [HEAD_HALF, HEAD_Y, 0],
    fixedFaces: ['bot-left', 'bot-right'],
    movingFaces: ['top-left', 'top-right'],
    minMovingLayer: toppedFold.minLayer,
    reachM: 0.36 * R + 0.008,
  },
  T_UP,
);

const headedFold = foldHeadDetail(tipped, HINGE_HEAD, T_UP);
const T_HEAD = landmarkAfterHinge(T_UP, HINGE_HEAD, 180, 'valley');
const headed: MeshSnapshot = {
  ...headedFold.snapshot,
  outline: [SHOULDER_L, L, B, RIGHT, SHOULDER_R],
  named: { ...tipped.named, T: T_HEAD },
};

const CORNER_REACH = 0.018;
const HINGE_CORNER_L: HingeDefinition = faceViewer(
  {
    id: 'ladybug-corner-left',
    p0: CORNER_TOP_L,
    p1: CORNER_EDGE_L,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
    layerMode: 'packet',
    reachM: CORNER_REACH,
  },
  SHOULDER_L,
);

const HINGE_CORNER_R: HingeDefinition = faceViewer(
  {
    id: 'ladybug-corner-right',
    p0: CORNER_TOP_R,
    p1: CORNER_EDGE_R,
    fixedFaces: ['top-left', 'bot-left'],
    movingFaces: ['top-right', 'bot-right'],
    layerMode: 'packet',
    reachM: CORNER_REACH,
  },
  SHOULDER_R,
);

const cornerLeftFold = foldStacked(headed, HINGE_CORNER_L, SHOULDER_L);
const SL_IN = landmarkAfterHinge(SHOULDER_L, HINGE_CORNER_L, 180, 'valley');
const cornerLeft: MeshSnapshot = {
  ...cornerLeftFold.snapshot,
  outline: [CORNER_TOP_L, CORNER_EDGE_L, L, B, RIGHT, SHOULDER_R],
  named: { ...headed.named, SL: SL_IN },
};

const corneredFold = foldStacked(cornerLeft, HINGE_CORNER_R, SHOULDER_R);
const SR_IN = landmarkAfterHinge(SHOULDER_R, HINGE_CORNER_R, 180, 'valley');
const cornered: MeshSnapshot = {
  ...corneredFold.snapshot,
  outline: [CORNER_TOP_L, CORNER_EDGE_L, L, B, RIGHT, CORNER_EDGE_R, CORNER_TOP_R],
  named: { ...cornerLeft.named, SR: SR_IN },
};

const HINGE_SIDE_L: HingeDefinition = faceViewer(
  {
    id: 'ladybug-side-left',
    p0: [-SIDE_X, -SIDE_HALF_Y, 0],
    p1: [-SIDE_X, SIDE_HALF_Y, 0],
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
    reachM: SIDE_HALF_Y + 0.008,
  },
  L,
);

const HINGE_SIDE_R: HingeDefinition = faceViewer(
  {
    id: 'ladybug-side-right',
    p0: [SIDE_X, -SIDE_HALF_Y, 0],
    p1: [SIDE_X, SIDE_HALF_Y, 0],
    fixedFaces: ['top-left', 'bot-left'],
    movingFaces: ['top-right', 'bot-right'],
    reachM: SIDE_HALF_Y + 0.008,
  },
  RIGHT,
);

const HINGE_BOTTOM: HingeDefinition = faceViewer(
  {
    id: 'ladybug-bottom',
    p0: [-BOTTOM_HALF, BOTTOM_Y, 0],
    p1: [BOTTOM_HALF, BOTTOM_Y, 0],
    fixedFaces: ['top-left', 'top-right'],
    movingFaces: ['bot-left', 'bot-right'],
    reachM: R + BOTTOM_Y + 0.008,
  },
  B,
);

const sideLeftFold = foldStacked(cornered, HINGE_SIDE_L, L);
const L_IN = landmarkAfterHinge(L, HINGE_SIDE_L, 180, 'valley');
const sideLeft: MeshSnapshot = {
  ...sideLeftFold.snapshot,
  outline: [CORNER_TOP_L, CORNER_EDGE_L, [-SIDE_X, SIDE_HALF_Y, 0], [-SIDE_X, -SIDE_HALF_Y, 0], B, RIGHT, CORNER_EDGE_R, CORNER_TOP_R],
  named: { ...cornered.named, L: L_IN },
};

const sideRightFold = foldStacked(sideLeft, HINGE_SIDE_R, RIGHT);
const R_IN = landmarkAfterHinge(RIGHT, HINGE_SIDE_R, 180, 'valley');
const sideRight: MeshSnapshot = {
  ...sideRightFold.snapshot,
  outline: [
    CORNER_TOP_L,
    CORNER_EDGE_L,
    [-SIDE_X, SIDE_HALF_Y, 0],
    [-SIDE_X, -SIDE_HALF_Y, 0],
    B,
    [SIDE_X, -SIDE_HALF_Y, 0],
    [SIDE_X, SIDE_HALF_Y, 0],
    CORNER_EDGE_R,
    CORNER_TOP_R,
  ],
  named: { ...sideLeft.named, RIGHT: R_IN },
};

const roundedFold = foldStacked(sideRight, HINGE_BOTTOM, B);
const B_UP = landmarkAfterHinge(B, HINGE_BOTTOM, 180, 'valley');
const BODY_OUTLINE: Vec3[] = [
  CORNER_TOP_L,
  CORNER_EDGE_L,
  [-SIDE_X, SIDE_HALF_Y, 0],
  [-SIDE_X, -SIDE_HALF_Y, 0],
  [-BOTTOM_HALF, BOTTOM_Y, 0],
  [BOTTOM_HALF, BOTTOM_Y, 0],
  [SIDE_X, -SIDE_HALF_Y, 0],
  [SIDE_X, SIDE_HALF_Y, 0],
  CORNER_EDGE_R,
  CORNER_TOP_R,
];
const rounded: MeshSnapshot = {
  ...roundedFold.snapshot,
  outline: BODY_OUTLINE,
  named: { ...sideRight.named, B: B_UP },
};

const ladybug: MeshSnapshot = { ...rounded, outline: BODY_OUTLINE };

const horizontalFolded = {
  ...applyHingeSnapshot(diamond, HINGE_HORIZONTAL, 'valley', 180, B),
  outline: [L, T, RIGHT],
};
const B_ACROSS = landmarkAfterHinge(B, HINGE_HORIZONTAL, 180, 'valley');
horizontalFolded.named = { ...REST, B: B_ACROSS };

const verticalFolded = {
  ...applyHingeSnapshot(diamond, HINGE_VERTICAL, 'valley', 180, L),
  outline: [T, RIGHT, B],
};
const L_ACROSS = landmarkAfterHinge(L, HINGE_VERTICAL, 180, 'valley');
verticalFolded.named = { ...REST, L: L_ACROSS };

export const LADYBUG_NAMED = REST;

const VERTICAL_LINE: [Vec3, Vec3] = [HINGE_VERTICAL.p0, HINGE_VERTICAL.p1];
const HORIZONTAL_LINE: [Vec3, Vec3] = [HINGE_HORIZONTAL.p0, HINGE_HORIZONTAL.p1];
const CORNER_L_LINE: [Vec3, Vec3] = [HINGE_CORNER_L.p0, HINGE_CORNER_L.p1];
const CORNER_R_LINE: [Vec3, Vec3] = [HINGE_CORNER_R.p0, HINGE_CORNER_R.p1];
const SIDE_L_LINE: [Vec3, Vec3] = [HINGE_SIDE_L.p0, HINGE_SIDE_L.p1];
const SIDE_R_LINE: [Vec3, Vec3] = [HINGE_SIDE_R.p0, HINGE_SIDE_R.p1];
const BOTTOM_LINE: [Vec3, Vec3] = [HINGE_BOTTOM.p0, HINGE_BOTTOM.p1];

export const LADYBUG_RECIPE: OrigamiRecipe = {
  id: 'origami-ladybug',
  name: 'Origami ladybug',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'ladybug-horizontal', p0: HINGE_HORIZONTAL.p0, p1: HINGE_HORIZONTAL.p1, direction: 'valley' },
    { id: 'ladybug-vertical', p0: HINGE_VERTICAL.p0, p1: HINGE_VERTICAL.p1, direction: 'valley' },
    { id: 'ladybug-top', p0: HINGE_TOP.p0, p1: HINGE_TOP.p1, direction: 'valley' },
    { id: 'ladybug-tip', p0: HINGE_TIP.p0, p1: HINGE_TIP.p1, direction: 'valley' },
    { id: 'ladybug-head', p0: HINGE_HEAD.p0, p1: HINGE_HEAD.p1, direction: 'valley' },
    { id: 'ladybug-corner-left', p0: HINGE_CORNER_L.p0, p1: HINGE_CORNER_L.p1, direction: 'valley' },
    { id: 'ladybug-corner-right', p0: HINGE_CORNER_R.p0, p1: HINGE_CORNER_R.p1, direction: 'valley' },
    { id: 'ladybug-side-left', p0: HINGE_SIDE_L.p0, p1: HINGE_SIDE_L.p1, direction: 'valley' },
    { id: 'ladybug-side-right', p0: HINGE_SIDE_R.p0, p1: HINGE_SIDE_R.p1, direction: 'valley' },
    { id: 'ladybug-bottom', p0: HINGE_BOTTOM.p0, p1: HINGE_BOTTOM.p1, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    'horizontal-folded': horizontalFolded,
    'vertical-folded': verticalFolded,
    topped,
    tipped,
    headed,
    'corner-left': cornerLeft,
    cornered,
    'side-left': sideLeft,
    'side-right': sideRight,
    rounded,
    ladybug,
  },
  finalSilhouette: BODY_OUTLINE,
  silhouetteToleranceM: 0.045,
  steps: [
    step({
      id: 'ladybug-horizontal-fold',
      ordinal: 1,
      progressStage: 1,
      title: 'Create center creases',
      instruction: 'Fold along both center lines, then unfold.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'horizontal-folded',
      actionType: 'fold',
      hinge: HINGE_HORIZONTAL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom-half',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([L, B, RIGHT]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-top-half',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([L, T, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: T }],
      arrowPathLocal: arc([0, B[1] + 0.02, 0.003], [0, T[1] - 0.02, 0.003], 0.06),
      extraCreaseLines: [VERTICAL_LINE],
      lockCreaseIds: ['ladybug-horizontal'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1a. Pinch the bottom corner up to the top, then unfold. Both center lines are shown.',
    }),
    step({
      id: 'ladybug-horizontal-open',
      ordinal: 2,
      progressStage: 1,
      title: 'Create center creases',
      instruction: 'The paper opens. The horizontal crease stays.',
      fromSnapshotId: 'horizontal-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_HORIZONTAL, id: 'ladybug-horizontal-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-horizontal',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([L, T, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B }],
      arrowPathLocal: arc([0, T[1] - 0.03, 0.003], [0, B[1] + 0.03, 0.003], 0.05),
      extraCreaseLines: [VERTICAL_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. The diamond keeps the horizontal center crease.',
    }),
    step({
      id: 'ladybug-vertical-fold',
      ordinal: 3,
      progressStage: 1,
      title: 'Create center creases',
      instruction: 'Fold the left corner across to the right.',
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
      optionalHoldRegion: {
        id: 'hold-right-half',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([T, RIGHT, B]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: RIGHT }],
      arrowPathLocal: arc([L[0] + 0.02, 0, 0.003], [RIGHT[0] - 0.02, 0, 0.003], 0.06),
      extraCreaseLines: [HORIZONTAL_LINE],
      lockCreaseIds: ['ladybug-vertical'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1b. Pinch the left corner to the right, then unfold. The horizontal crease stays.',
    }),
    step({
      id: 'ladybug-vertical-open',
      ordinal: 4,
      progressStage: 1,
      title: 'Create center creases',
      instruction: 'The paper opens into a diamond. Both center creases stay.',
      fromSnapshotId: 'vertical-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_VERTICAL, id: 'ladybug-vertical-open' },
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
      arrowPathLocal: arc([RIGHT[0] - 0.03, 0.01, 0.003], [L[0] + 0.03, 0.01, 0.003], 0.05),
      extraCreaseLines: [HORIZONTAL_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. The full diamond shows both center creases.',
    }),
    step({
      id: 'ladybug-top',
      ordinal: 5,
      progressStage: 2,
      title: 'Fold the top corner',
      instruction: 'Fold the top corner downward.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'topped',
      actionType: 'fold',
      hinge: HINGE_TOP,
      direction: 'valley',
      movingRegion: {
        id: 'moving-top',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([SHOULDER_L, T, SHOULDER_R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T_DOWN }],
      arrowPathLocal: arc([0, T[1] - 0.012, 0.003], [0, T_DOWN[1] + 0.01, 0.003], 0.035),
      lockCreaseIds: ['ladybug-top'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2. Only the upper triangle folds. The crease is in the upper third, not through the center.',
    }),
    step({
      id: 'ladybug-tip',
      ordinal: 6,
      progressStage: 3,
      title: 'Fold the head flap',
      instruction: 'Fold the small tip upward.',
      fromSnapshotId: 'topped',
      toSnapshotId: 'tipped',
      actionType: 'fold',
      hinge: HINGE_TIP,
      direction: 'valley',
      movingRegion: {
        id: 'moving-tip',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([[-TIP_HALF, TIP_Y, 0], T_DOWN, [TIP_HALF, TIP_Y, 0]]),
        allowedHands: 'either',
        hitDisk: { center: T_DOWN, radiusM: LADYBUG_TIP_HIT_RADIUS_M },
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T_UP }],
      arrowPathLocal: arc([0, T_DOWN[1] + 0.006, 0.004], [0, T_UP[1] - 0.004, 0.004], 0.016),
      lockCreaseIds: ['ladybug-tip'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3. A short nip at the lowered point. The downward tip stays for step 4.',
    }),
    step({
      id: 'ladybug-head',
      ordinal: 7,
      progressStage: 4,
      title: 'Shape the head detail',
      instruction: 'Fold the small center tip upward.',
      fromSnapshotId: 'tipped',
      toSnapshotId: 'headed',
      actionType: 'fold',
      hinge: HINGE_HEAD,
      direction: 'valley',
      movingRegion: {
        id: 'moving-head-tip',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([[-0.28 * R, HEAD_Y, 0], T_UP, [0.28 * R, HEAD_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T_HEAD }],
      arrowPathLocal: arc([0, T_UP[1] + 0.012, 0.004], [0, T_HEAD[1] - 0.006, 0.005], 0.02),
      lockCreaseIds: ['ladybug-head'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4. The downward tip folds up behind the upper band, leaving a red triangle in the white head.',
    }),
    step({
      id: 'ladybug-corner-left',
      ordinal: 8,
      progressStage: 5,
      title: 'Fold upper corners',
      instruction: 'Fold the upper corners inward.',
      fromSnapshotId: 'headed',
      toSnapshotId: 'corner-left',
      actionType: 'fold',
      hinge: HINGE_CORNER_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-corner-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([CORNER_TOP_L, SHOULDER_L, CORNER_EDGE_L]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'SL', target: SL_IN }],
      arrowPathLocal: arc(
        [SHOULDER_L[0] + 0.008, SHOULDER_L[1] - 0.006, 0.004],
        [SL_IN[0], SL_IN[1], 0.004],
        0.02,
      ),
      extraCreaseLines: [CORNER_R_LINE],
      lockCreaseIds: ['ladybug-corner-left'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 5a. Left upper corner only. The right corner waits.',
    }),
    step({
      id: 'ladybug-corner-right',
      ordinal: 9,
      progressStage: 5,
      title: 'Fold upper corners',
      instruction: 'Fold the right upper corner inward.',
      fromSnapshotId: 'corner-left',
      toSnapshotId: 'cornered',
      actionType: 'fold',
      hinge: HINGE_CORNER_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-corner-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([CORNER_TOP_R, SHOULDER_R, CORNER_EDGE_R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'SR', target: SR_IN }],
      arrowPathLocal: arc(
        [SHOULDER_R[0] - 0.008, SHOULDER_R[1] - 0.006, 0.004],
        [SR_IN[0], SR_IN[1], 0.004],
        0.02,
      ),
      extraCreaseLines: [CORNER_L_LINE],
      lockCreaseIds: ['ladybug-corner-right'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 5b. Right upper corner mirrors the left. Both must finish before the next step.',
    }),
    step({
      id: 'ladybug-side-left',
      ordinal: 10,
      progressStage: 6,
      title: 'Round the body',
      instruction: 'Fold the side and bottom tips inward.',
      fromSnapshotId: 'cornered',
      toSnapshotId: 'side-left',
      actionType: 'fold',
      hinge: HINGE_SIDE_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([[-SIDE_X, SIDE_HALF_Y, 0], L, [-SIDE_X, -SIDE_HALF_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L_IN }],
      arrowPathLocal: arc([L[0] + 0.012, 0, 0.004], [L_IN[0], L_IN[1], 0.004], 0.02),
      extraCreaseLines: [SIDE_R_LINE, BOTTOM_LINE],
      lockCreaseIds: ['ladybug-side-left'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 6a. Left tip only, along a vertical crease. The other two guides stay visible.',
    }),
    step({
      id: 'ladybug-side-right',
      ordinal: 11,
      progressStage: 6,
      title: 'Round the body',
      instruction: 'Fold the right tip inward.',
      fromSnapshotId: 'side-left',
      toSnapshotId: 'side-right',
      actionType: 'fold',
      hinge: HINGE_SIDE_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([[SIDE_X, SIDE_HALF_Y, 0], RIGHT, [SIDE_X, -SIDE_HALF_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: R_IN }],
      arrowPathLocal: arc([RIGHT[0] - 0.012, 0, 0.004], [R_IN[0], R_IN[1], 0.004], 0.02),
      extraCreaseLines: [SIDE_L_LINE, BOTTOM_LINE],
      lockCreaseIds: ['ladybug-side-right'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 6b. Right tip mirrors the left. The bottom tip is still waiting.',
    }),
    step({
      id: 'ladybug-bottom',
      ordinal: 12,
      progressStage: 6,
      title: 'Round the body',
      instruction: 'Fold the bottom tip upward.',
      fromSnapshotId: 'side-right',
      toSnapshotId: 'rounded',
      actionType: 'fold',
      hinge: HINGE_BOTTOM,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom-tip',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([[-BOTTOM_HALF, BOTTOM_Y, 0], B, [BOTTOM_HALF, BOTTOM_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B_UP }],
      arrowPathLocal: arc([0, B[1] + 0.012, 0.004], [0, B_UP[1] - 0.006, 0.004], 0.018),
      extraCreaseLines: [SIDE_L_LINE, SIDE_R_LINE],
      lockCreaseIds: ['ladybug-bottom'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 6c. Bottom tip folds up on its own crease. The body is now a folded octagon.',
    }),
    step({
      id: 'ladybug-decorate',
      ordinal: 13,
      progressStage: 7,
      title: 'Bring it to life',
      instruction: 'Pinch to bring your ladybug to life!',
      fromSnapshotId: 'rounded',
      toSnapshotId: 'ladybug',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_VERTICAL, id: 'ladybug-decorate' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-ladybug-body',
        faceIds: ['top-left', 'top-right', 'bot-left', 'bot-right'],
        polygonUV: uvPoly([
          [-SIDE_X * 0.3, 0, 0],
          [0, 0.04 * R, 0],
          [SIDE_X * 0.3, 0, 0],
          [0, -0.4 * R, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.016, LADYBUG_PINCH_AT[1], 0.01], [0.016, LADYBUG_PINCH_AT[1], 0.01], 0.012),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 7. One pinch reveals the eyes, five spots, and the wing seam.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-ladybug',
};
