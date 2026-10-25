import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { applyHingeSnapshot, deformByHinge } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const OWL_PAPER_COLOR = '#C98245';
export const OWL_BACK_COLOR = '#F7F2E9';
export const OWL_EDGE_COLOR = '#98552F';
export const OWL_EYE_COLOR = '#FFFFFF';
export const OWL_BEAK_COLOR = '#E39A2D';
export const OWL_PUPIL_COLOR = '#1C1A17';
export const OWL_FEATHER_COLOR = '#98552F';

const H = PAPER_SIZE_M / 2;
const RAD = H * Math.SQRT2;

const L: Vec3 = [-RAD, 0, 0];
const RIGHT: Vec3 = [RAD, 0, 0];
const T: Vec3 = [0, RAD, 0];
const B: Vec3 = [0, -RAD, 0];
const O: Vec3 = [0, 0, 0];

/**
 * Step 2 folds the top corner one third of the way toward the center.
 * The crease sits in the upper portion and the tip stays a small forehead.
 */
const TOP_TRAVEL = RAD / 3;
const TOP_LANDING_Y = RAD - TOP_TRAVEL;
const TOP_CREASE_Y = (RAD + TOP_LANDING_Y) / 2;
const SHOULDER_X = RAD - TOP_CREASE_Y;

/**
 * Step 3 folds the bottom corner up the center axis until its tip crosses
 * the forehead. The crease sits just below the middle of the sheet, past a
 * strict halfway mark, so the two triangles share a band.
 */
const BOTTOM_LANDING_Y = TOP_LANDING_Y + RAD * 0.075;
const BOTTOM_CREASE_Y = (-RAD + BOTTOM_LANDING_Y) / 2;

/** Step 4 creases. Wide enough that the body is a compact rectangle, not a tall trapezoid. */
const SIDE_X = RAD * 0.45;

/**
 * Step 5 lifts the bottom flap along the horizontal crease while preserving
 * a distinct flap whose lower left and right corners protrude visibly below
 * the main body edge.
 */
const HEM_Y = BOTTOM_CREASE_Y + 0.016;
const HEM_CORNER_INSET_X = 0.011;
const HEM_PROTRUDE_Y = 0.008;

/**
 * Step 6 folds the small center triangular flap downward to shape the beak.
 * The horizontal crease sits just below the eye line so the tip lands at the
 * center beak position.
 */
export const OWL_BEAK_CREASE_Y = BOTTOM_LANDING_Y - 0.028;
export const OWL_BEAK_HALF_X = BOTTOM_LANDING_Y - OWL_BEAK_CREASE_Y;
const BEAK_L: Vec3 = [-OWL_BEAK_HALF_X, OWL_BEAK_CREASE_Y, 0];
const BEAK_R: Vec3 = [OWL_BEAK_HALF_X, OWL_BEAK_CREASE_Y, 0];

const DIAMOND_OUTLINE: Vec3[] = [L, T, RIGHT, B];

export const OWL_EYE_X = SIDE_X * 0.46;
export const OWL_EYE_Y = TOP_LANDING_Y - 0.014;
export const OWL_BEAK: Vec3 = [0, 2 * OWL_BEAK_CREASE_Y - BOTTOM_LANDING_Y, 0];
export const OWL_FEATHER_YS = [HEM_Y + 0.032, HEM_Y + 0.016] as const;
export const OWL_WING_FEATHER_X = SIDE_X * 0.56;
export const OWL_FOOT_X = SIDE_X - HEM_CORNER_INSET_X;
export const OWL_FOOT_Y = HEM_Y - HEM_PROTRUDE_Y;
export const OWL_FEATURE_Z = 0.009;
export const OWL_PINCH_AT: Vec3 = [0, (TOP_CREASE_Y + HEM_Y) / 2, 0.012];

export const OWL_STEPS = [
  'guide-creases',
  'top-corner-down',
  'bottom-corner-up',
  'side-folds-inward',
  'body-shape',
  'beak-fold',
  'owl-decoration',
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

function yOnEdge(x: number, from: Vec3, to: Vec3): number {
  const span = to[0] - from[0];
  const t = Math.abs(span) < 1e-8 ? 0 : (x - from[0]) / span;
  return from[1] + (to[1] - from[1]) * t;
}

/**
 * A later flap has to sit above every sheet it lands on. The hinge split
 * only bumps a face by one, which leaves a new flap coplanar with paper
 * folded earlier. Lift the whole moving packet just clear of that stack.
 */
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

function foldStacked(from: MeshSnapshot, hinge: HingeDefinition, tip: Vec3): MeshSnapshot {
  const moved = deformByHinge(from, hinge, -180, tip);
  const folded = applyHingeSnapshot(from, hinge, 'valley', 180, tip);
  return stackFlap(folded, moved.movingFaceIds);
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

const REST = { L, RIGHT, T, B, O };
const diamond: MeshSnapshot = {
  vertices: [L, RIGHT, T, B, O],
  faces: DIAMOND_FACES,
  named: REST,
  outline: DIAMOND_OUTLINE,
};

const HINGE_VERTICAL: HingeDefinition = faceViewer(
  {
    id: 'owl-vertical',
    p0: T,
    p1: B,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
  },
  L,
);

const HINGE_HORIZONTAL: HingeDefinition = faceViewer(
  {
    id: 'owl-horizontal',
    p0: L,
    p1: RIGHT,
    fixedFaces: ['bot-left', 'bot-right'],
    movingFaces: ['top-left', 'top-right'],
  },
  T,
);

const SHOULDER_L: Vec3 = [-SHOULDER_X, TOP_CREASE_Y, 0];
const SHOULDER_R: Vec3 = [SHOULDER_X, TOP_CREASE_Y, 0];
const HINGE_TOP: HingeDefinition = faceViewer(
  {
    id: 'owl-top',
    p0: SHOULDER_L,
    p1: SHOULDER_R,
    fixedFaces: ['bot-left', 'bot-right'],
    movingFaces: ['top-left', 'top-right'],
  },
  T,
);

const BOTTOM_LEFT: Vec3 = [-(RAD + BOTTOM_CREASE_Y), BOTTOM_CREASE_Y, 0];
const BOTTOM_RIGHT: Vec3 = [RAD + BOTTOM_CREASE_Y, BOTTOM_CREASE_Y, 0];
const HINGE_BOTTOM: HingeDefinition = faceViewer(
  {
    id: 'owl-bottom',
    p0: BOTTOM_LEFT,
    p1: BOTTOM_RIGHT,
    fixedFaces: ['top-left', 'top-right'],
    movingFaces: ['bot-left', 'bot-right'],
  },
  B,
);

const SIDE_TOP_Y = yOnEdge(-SIDE_X, SHOULDER_L, L);
const SIDE_TOP_L: Vec3 = [-SIDE_X, SIDE_TOP_Y, 0];
const SIDE_TOP_R: Vec3 = [SIDE_X, SIDE_TOP_Y, 0];
const SIDE_BOT_L: Vec3 = [-SIDE_X, BOTTOM_CREASE_Y, 0];
const SIDE_BOT_R: Vec3 = [SIDE_X, BOTTOM_CREASE_Y, 0];

const HINGE_LEFT: HingeDefinition = faceViewer(
  {
    id: 'owl-side-left',
    p0: SIDE_TOP_L,
    p1: SIDE_BOT_L,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
    layerMode: 'packet',
  },
  L,
);

const HINGE_RIGHT: HingeDefinition = faceViewer(
  {
    id: 'owl-side-right',
    p0: SIDE_TOP_R,
    p1: SIDE_BOT_R,
    fixedFaces: ['top-left', 'bot-left'],
    movingFaces: ['top-right', 'bot-right'],
    layerMode: 'packet',
  },
  RIGHT,
);

const HEM_POINT: Vec3 = [0, BOTTOM_CREASE_Y, 0];
const HINGE_HEM: HingeDefinition = faceViewer(
  {
    id: 'owl-hem',
    p0: [-SIDE_X, HEM_Y, 0],
    p1: [SIDE_X, HEM_Y, 0],
    fixedFaces: [],
    movingFaces: ['top-left', 'top-right', 'bot-left', 'bot-right'],
    layerMode: 'packet',
  },
  HEM_POINT,
);

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

function addProtrudingHemCorners(snapshot: MeshSnapshot): MeshSnapshot {
  const maxLayer = snapshot.faces.reduce((max, face) => Math.max(max, face.layer), 0);
  const vertices = snapshot.vertices.map((vertex) => [...vertex] as Vec3);
  const pushVert = (point: Vec3): number => {
    vertices.push([...point] as Vec3);
    return vertices.length - 1;
  };
  const leftOuter = pushVert([-SIDE_X, HEM_Y, 0]);
  const leftTip = pushVert([-OWL_FOOT_X, OWL_FOOT_Y, 0]);
  const leftInner = pushVert([-(OWL_FOOT_X - HEM_CORNER_INSET_X), HEM_Y, 0]);
  const rightInner = pushVert([OWL_FOOT_X - HEM_CORNER_INSET_X, HEM_Y, 0]);
  const rightTip = pushVert([OWL_FOOT_X, OWL_FOOT_Y, 0]);
  const rightOuter = pushVert([SIDE_X, HEM_Y, 0]);
  return {
    ...snapshot,
    vertices,
    faces: [
      ...snapshot.faces,
      { id: 'bot-left:hem-foot', vertices: [leftOuter, leftTip, leftInner], layer: maxLayer, materialId: 'front' },
      { id: 'bot-right:hem-foot', vertices: [rightInner, rightTip, rightOuter], layer: maxLayer, materialId: 'front' },
    ],
  };
}

const verticalFolded = {
  ...applyHingeSnapshot(diamond, HINGE_VERTICAL, 'valley', 180, L),
  outline: [T, RIGHT, B],
};
const L_ACROSS = landmarkAfterHinge(L, HINGE_VERTICAL, 180, 'valley');
verticalFolded.named = { ...REST, L: L_ACROSS };

const horizontalFolded = {
  ...applyHingeSnapshot(diamond, HINGE_HORIZONTAL, 'valley', 180, T),
  outline: [L, B, RIGHT],
};
const T_DOWN_GUIDE = landmarkAfterHinge(T, HINGE_HORIZONTAL, 180, 'valley');
horizontalFolded.named = { ...REST, T: T_DOWN_GUIDE };

const topped = {
  ...foldStacked(diamond, HINGE_TOP, T),
  outline: [SHOULDER_L, L, B, RIGHT, SHOULDER_R],
};
const T_DOWN = landmarkAfterHinge(T, HINGE_TOP, 180, 'valley');
topped.named = { ...REST, T: T_DOWN };

const raisedRaw = foldStacked(topped, HINGE_BOTTOM, B);
const B_UP = landmarkAfterHinge(B, HINGE_BOTTOM, 180, 'valley');
const raised = {
  ...separateLayers(raisedRaw, 2),
  outline: [SHOULDER_L, L, BOTTOM_LEFT, BOTTOM_RIGHT, RIGHT, SHOULDER_R],
  named: { ...topped.named, B: B_UP },
};

const leftIn = {
  ...foldStacked(raised, HINGE_LEFT, L),
  outline: [SHOULDER_L, SIDE_TOP_L, SIDE_BOT_L, BOTTOM_RIGHT, RIGHT, SHOULDER_R],
};
const L_IN = landmarkAfterHinge(L, HINGE_LEFT, 180, 'valley');
leftIn.named = { ...raised.named, L: L_IN };

const sided: MeshSnapshot = {
  ...foldStacked(leftIn, HINGE_RIGHT, RIGHT),
  outline: [SHOULDER_L, SIDE_TOP_L, SIDE_BOT_L, SIDE_BOT_R, SIDE_TOP_R, SHOULDER_R],
};
const R_IN = landmarkAfterHinge(RIGHT, HINGE_RIGHT, 180, 'valley');
sided.named = { ...leftIn.named, RIGHT: R_IN, HEM: HEM_POINT };

const HEM_LEFT: Vec3 = [-SIDE_X, HEM_Y, 0];
const HEM_RIGHT: Vec3 = [SIDE_X, HEM_Y, 0];
const FOOT_TIP_L: Vec3 = [-OWL_FOOT_X, OWL_FOOT_Y, 0];
const FOOT_TIP_R: Vec3 = [OWL_FOOT_X, OWL_FOOT_Y, 0];
const BODY_OUTLINE: Vec3[] = [
  SHOULDER_L,
  SIDE_TOP_L,
  HEM_LEFT,
  FOOT_TIP_L,
  FOOT_TIP_R,
  HEM_RIGHT,
  SIDE_TOP_R,
  SHOULDER_R,
];
const bodyFolded = addProtrudingHemCorners(foldStacked(sided, HINGE_HEM, HEM_POINT));
const HEM_UP = landmarkAfterHinge(HEM_POINT, HINGE_HEM, 180, 'valley');
const body: MeshSnapshot = {
  ...bodyFolded,
  outline: BODY_OUTLINE,
  named: {
    ...sided.named,
    HEM: HEM_UP,
    FOOT_L: FOOT_TIP_L,
    FOOT_R: FOOT_TIP_R,
  },
};

const HINGE_BEAK: HingeDefinition = faceViewer(
  {
    id: 'owl-beak',
    p0: BEAK_L,
    p1: BEAK_R,
    fixedFaces: ['top-left', 'top-right'],
    movingFaces: ['bot-left', 'bot-right'],
    minMovingLayer: 2,
    maxMovingLayer: 2,
    reachM: BOTTOM_LANDING_Y - OWL_BEAK_CREASE_Y + 0.008,
  },
  B_UP,
);

const BEAK_DOWN = landmarkAfterHinge(B_UP, HINGE_BEAK, 180, 'valley');
const beakedMoved = deformByHinge(body, HINGE_BEAK, -180, B_UP);
const beakedStacked = foldStacked(body, HINGE_BEAK, B_UP);
const beaked: MeshSnapshot = {
  ...beakedStacked,
  faces: beakedStacked.faces.map((face) =>
    beakedMoved.movingFaceIds.has(face.id) && face.vertices.length === 3
      ? { ...face, vertices: [face.vertices[0]!, face.vertices[2]!, face.vertices[1]!] }
      : face,
  ),
  outline: BODY_OUTLINE,
};
beaked.named = { ...body.named, B: BEAK_DOWN, BEAK: BEAK_DOWN };

const owl: MeshSnapshot = { ...beaked, outline: BODY_OUTLINE };

export const OWL_BEAK_TIP: Vec3 = BEAK_DOWN;
export const OWL_LEFT_DIAGONAL: [Vec3, Vec3] = [SIDE_TOP_L, L_IN];
export const OWL_RIGHT_DIAGONAL: [Vec3, Vec3] = [SIDE_TOP_R, R_IN];

export const OWL_NAMED = REST;

const VERTICAL_LINE: [Vec3, Vec3] = [HINGE_VERTICAL.p0, HINGE_VERTICAL.p1];
const HORIZONTAL_LINE: [Vec3, Vec3] = [HINGE_HORIZONTAL.p0, HINGE_HORIZONTAL.p1];

export const OWL_RECIPE: OrigamiRecipe = {
  id: 'origami-owl',
  name: 'Origami owl',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'owl-vertical', p0: HINGE_VERTICAL.p0, p1: HINGE_VERTICAL.p1, direction: 'valley' },
    { id: 'owl-horizontal', p0: HINGE_HORIZONTAL.p0, p1: HINGE_HORIZONTAL.p1, direction: 'valley' },
    { id: 'owl-top', p0: HINGE_TOP.p0, p1: HINGE_TOP.p1, direction: 'valley' },
    { id: 'owl-bottom', p0: HINGE_BOTTOM.p0, p1: HINGE_BOTTOM.p1, direction: 'valley' },
    { id: 'owl-side-left', p0: HINGE_LEFT.p0, p1: HINGE_LEFT.p1, direction: 'valley' },
    { id: 'owl-side-right', p0: HINGE_RIGHT.p0, p1: HINGE_RIGHT.p1, direction: 'valley' },
    { id: 'owl-hem', p0: HINGE_HEM.p0, p1: HINGE_HEM.p1, direction: 'valley' },
    { id: 'owl-beak', p0: HINGE_BEAK.p0, p1: HINGE_BEAK.p1, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    'vertical-folded': verticalFolded,
    'horizontal-folded': horizontalFolded,
    topped,
    raised,
    'left-in': leftIn,
    sided,
    body,
    beaked,
    owl,
  },
  finalSilhouette: BODY_OUTLINE,
  silhouetteToleranceM: 0.045,
  steps: [
    step({
      id: 'owl-vertical-fold',
      ordinal: 1,
      progressStage: 1,
      title: 'Create the guide creases',
      instruction: 'Pinch the left corner and fold it across the diamond.',
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
      lockCreaseIds: ['owl-vertical'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1a. Vertical guide crease through the top and bottom corners. Both guides are shown.',
    }),
    step({
      id: 'owl-vertical-open',
      ordinal: 2,
      progressStage: 1,
      title: 'Create the guide creases',
      instruction: 'The paper opens. The vertical crease stays.',
      fromSnapshotId: 'vertical-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_VERTICAL, id: 'owl-vertical-open' },
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
      validationNotes: 'The reopen is automatic. The diamond returns with the vertical crease locked.',
    }),
    step({
      id: 'owl-horizontal-fold',
      ordinal: 3,
      progressStage: 1,
      title: 'Create the guide creases',
      instruction: 'Pinch the top corner and fold it down to the bottom corner.',
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
      optionalHoldRegion: {
        id: 'hold-bottom-half',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([L, B, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: B }],
      arrowPathLocal: arc([0, T[1] - 0.02, 0.003], [0, B[1] + 0.02, 0.003], 0.06),
      extraCreaseLines: [VERTICAL_LINE],
      lockCreaseIds: ['owl-horizontal'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1b. Horizontal guide crease through the left and right corners.',
    }),
    step({
      id: 'owl-horizontal-open',
      ordinal: 4,
      progressStage: 1,
      title: 'Create the guide creases',
      instruction: 'The paper opens into a diamond. Both guide creases stay.',
      fromSnapshotId: 'horizontal-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_HORIZONTAL, id: 'owl-horizontal-open' },
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
      arrowPathLocal: arc([0, B[1] + 0.03, 0.003], [0, T[1] - 0.03, 0.003], 0.05),
      extraCreaseLines: [VERTICAL_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. The diamond shows the vertical and horizontal guide creases.',
    }),
    step({
      id: 'owl-top',
      ordinal: 5,
      progressStage: 2,
      title: 'Fold the top corner',
      instruction: 'Pinch the top corner and fold it down about a third of the way.',
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
      arrowPathLocal: arc([0, T[1] - 0.01, 0.003], [0, T_DOWN[1] + 0.008, 0.003], 0.03),
      lockCreaseIds: ['owl-top'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2. Small triangular forehead. The tip stops in the upper portion of the diamond.',
    }),
    step({
      id: 'owl-bottom',
      ordinal: 6,
      progressStage: 3,
      title: 'Fold the bottom corner',
      instruction: 'Pinch the bottom corner and fold it up over the forehead.',
      fromSnapshotId: 'topped',
      toSnapshotId: 'raised',
      actionType: 'fold',
      hinge: HINGE_BOTTOM,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([BOTTOM_LEFT, B, BOTTOM_RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B_UP }],
      arrowPathLocal: arc([0, B[1] + 0.01, 0.003], [0, B_UP[1] - 0.008, 0.003], 0.04),
      lockCreaseIds: ['owl-bottom'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3. Bottom corner folds up about halfway and overlaps the forehead tip.',
    }),
    step({
      id: 'owl-side-left',
      ordinal: 7,
      progressStage: 4,
      title: 'Fold both sides inward',
      instruction: 'Fold the left corner in toward the center.',
      fromSnapshotId: 'raised',
      toSnapshotId: 'left-in',
      actionType: 'fold',
      hinge: HINGE_LEFT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([SIDE_TOP_L, L, SIDE_BOT_L]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L_IN }],
      arrowPathLocal: arc([L[0] + 0.02, 0, 0.003], [L_IN[0], L_IN[1], 0.003], 0.04),
      lockCreaseIds: ['owl-side-left'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4A. Left flap only. The forehead stays put.',
    }),
    step({
      id: 'owl-side-right',
      ordinal: 8,
      progressStage: 4,
      title: 'Fold both sides inward',
      instruction: 'Fold the right corner in toward the center.',
      fromSnapshotId: 'left-in',
      toSnapshotId: 'sided',
      actionType: 'fold',
      hinge: HINGE_RIGHT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([SIDE_TOP_R, RIGHT, SIDE_BOT_R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: R_IN }],
      arrowPathLocal: arc([RIGHT[0] - 0.02, 0, 0.003], [R_IN[0], R_IN[1], 0.003], 0.04),
      lockCreaseIds: ['owl-side-right'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4B. Right flap crosses the left one. Diagonal edges overlap the lower body.',
    }),
    step({
      id: 'owl-hem',
      ordinal: 9,
      progressStage: 5,
      title: 'Finish the body',
      instruction: 'Pinch the bottom edge and fold it up to square the body.',
      fromSnapshotId: 'sided',
      toSnapshotId: 'body',
      actionType: 'fold',
      hinge: HINGE_HEM,
      direction: 'valley',
      movingRegion: {
        id: 'moving-hem',
        faceIds: ['bot-left', 'bot-right', 'top-left', 'top-right'],
        polygonUV: uvPoly([[-SIDE_X, BOTTOM_CREASE_Y, 0], [0, BOTTOM_CREASE_Y - 0.02, 0], [SIDE_X, BOTTOM_CREASE_Y, 0]]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'HEM', target: HEM_UP }],
      arrowPathLocal: arc([0, BOTTOM_CREASE_Y + 0.004, 0.003], [0, HEM_UP[1] - 0.004, 0.003], 0.02),
      lockCreaseIds: ['owl-hem'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 5. A distinct bottom flap folds up while its lower left and right corners protrude below the body.',
    }),
    step({
      id: 'owl-beak',
      ordinal: 10,
      progressStage: 6,
      title: 'Fold the beak',
      instruction: "Pinch the small center flap and fold it down to shape the owl's beak.",
      fromSnapshotId: 'body',
      toSnapshotId: 'beaked',
      actionType: 'fold',
      hinge: HINGE_BEAK,
      direction: 'valley',
      movingRegion: {
        id: 'moving-beak',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([BEAK_L, B_UP, BEAK_R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: BEAK_DOWN }],
      arrowPathLocal: arc([0, B_UP[1] - 0.006, 0.008], [0, BEAK_DOWN[1] + 0.006, 0.008], 0.018),
      lockCreaseIds: ['owl-beak'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 6. The center triangular flap folds downward to form the beak.',
    }),
    step({
      id: 'owl-decorate',
      ordinal: 11,
      progressStage: 7,
      title: 'Bring your owl to life',
      instruction: 'Pinch to bring your owl to life!',
      fromSnapshotId: 'beaked',
      toSnapshotId: 'owl',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_VERTICAL, id: 'owl-decorate' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-owl-body',
        faceIds: ['top-left', 'top-right', 'bot-left', 'bot-right'],
        polygonUV: uvPoly([
          [-SIDE_X, HEM_Y, 0],
          [-SIDE_X, SIDE_TOP_Y, 0],
          [0, TOP_CREASE_Y, 0],
          [SIDE_X, SIDE_TOP_Y, 0],
          [SIDE_X, HEM_Y, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.018, OWL_PINCH_AT[1], 0.01], [0.018, OWL_PINCH_AT[1], 0.01], 0.012),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 7. One pinch reveals the eyes and curved wing feather markings, then the success state.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-owl',
};
