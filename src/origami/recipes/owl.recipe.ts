import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { applyHingeSnapshot } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const OWL_PAPER_COLOR = '#4E9A4A';
export const OWL_EYE_COLOR = '#F2C14E';
export const OWL_BEAK_COLOR = '#E39A2D';
export const OWL_PUPIL_COLOR = '#2A241C';

const H = PAPER_SIZE_M / 2;
const RAD = H * Math.SQRT2;

const L: Vec3 = [-RAD, 0, 0];
const RIGHT: Vec3 = [RAD, 0, 0];
const T: Vec3 = [0, RAD, 0];
const B: Vec3 = [0, -RAD, 0];
const O: Vec3 = [0, 0, 0];

const BOTTOM_TIP: Vec3 = [0, 0.018, 0];
const TOP_TIP: Vec3 = [0, 0.052, 0];
const DIAMOND_OUTLINE: Vec3[] = [L, T, RIGHT, B];

export const OWL_EYE_X = 0.016;
export const OWL_EYE_Y = 0.074;
export const OWL_BEAK: Vec3 = [0, 0.04, 0];
export const OWL_FOOT_X = 0.02;
export const OWL_FOOT_Y = -0.074;
export const OWL_FEATURE_Z = 0.006;
export const OWL_PINCH_AT: Vec3 = [0, 0.03, 0.016];

export const OWL_STEPS = [
  'center-crease',
  'bottom-corner-up',
  'top-corner-down',
  'side-folds-inward',
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

function upArc(from: Vec3, to: Vec3): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.02, 0.03], to];
}

function outlineHits(origin: Vec3, dir: Vec3, poly: Vec3[]): Vec3[] {
  const hits: Array<{ t: number; p: Vec3 }> = [];
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index]!;
    const c = poly[(index + 1) % poly.length]!;
    const ex = c[0] - a[0];
    const ey = c[1] - a[1];
    const det = dir[0] * ey - dir[1] * ex;
    if (Math.abs(det) < 1e-9) {
      continue;
    }
    const dx = a[0] - origin[0];
    const dy = a[1] - origin[1];
    const t = (dx * ey - dy * ex) / det;
    const u = (dx * dir[1] - dy * dir[0]) / det;
    if (u >= -1e-4 && u <= 1 + 1e-4) {
      hits.push({ t, p: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, 0] });
    }
  }
  hits.sort((left, right) => left.t - right.t);
  const unique: Vec3[] = [];
  for (const hit of hits) {
    if (!unique.some((point) => Math.hypot(point[0] - hit.p[0], point[1] - hit.p[1]) < 1e-4)) {
      unique.push(hit.p);
    }
  }
  return unique;
}

function hingeBetween(
  id: string,
  tip: Vec3,
  landing: Vec3,
  outline: Vec3[],
  movingFaces: string[],
  fixedFaces: string[],
): HingeDefinition {
  const mid: Vec3 = [(tip[0] + landing[0]) / 2, (tip[1] + landing[1]) / 2, 0];
  const sx = landing[0] - tip[0];
  const sy = landing[1] - tip[1];
  const span = Math.hypot(sx, sy) || 1;
  const hits = outlineHits(mid, [-sy / span, sx / span, 0], outline);
  const p0 = hits[0];
  const p1 = hits[hits.length - 1];
  if (!p0 || !p1) {
    throw new Error(`owl crease ${id} does not cross the sheet`);
  }
  return faceViewer({ id, p0, p1, fixedFaces, movingFaces }, tip);
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

const HINGE_CENTER: HingeDefinition = faceViewer(
  {
    id: 'owl-center',
    p0: T,
    p1: B,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
  },
  L,
);

const HINGE_BOTTOM = hingeBetween(
  'owl-bottom',
  B,
  BOTTOM_TIP,
  DIAMOND_OUTLINE,
  ['bot-left', 'bot-right'],
  ['top-left', 'top-right'],
);

const HINGE_TOP = hingeBetween(
  'owl-top',
  T,
  TOP_TIP,
  DIAMOND_OUTLINE,
  ['top-left', 'top-right'],
  ['bot-left', 'bot-right'],
);

const SIDE_LOWER: Vec3 = [-0.07, -0.05, 0];
const HINGE_LEFT: HingeDefinition = faceViewer(
  {
    id: 'owl-side-left',
    p0: HINGE_TOP.p0[0] < HINGE_TOP.p1[0] ? HINGE_TOP.p0 : HINGE_TOP.p1,
    p1: SIDE_LOWER,
    fixedFaces: ['top-right', 'bot-right'],
    movingFaces: ['top-left', 'bot-left'],
    layerMode: 'packet',
  },
  L,
);

const HINGE_RIGHT: HingeDefinition = faceViewer(
  {
    id: 'owl-side-right',
    p0: [-(HINGE_LEFT.p0[0]), HINGE_LEFT.p0[1], 0],
    p1: [-(HINGE_LEFT.p1[0]), HINGE_LEFT.p1[1], 0],
    fixedFaces: ['top-left', 'bot-left'],
    movingFaces: ['top-right', 'bot-right'],
    layerMode: 'packet',
  },
  RIGHT,
);

const centerFolded = {
  ...applyHingeSnapshot(diamond, HINGE_CENTER, 'valley', 180, L),
  outline: [T, RIGHT, B],
};
const L_FOLDED = landmarkAfterHinge(L, HINGE_CENTER, 180, 'valley');
centerFolded.named = { ...REST, L: L_FOLDED };

const bottom = {
  ...applyHingeSnapshot(diamond, HINGE_BOTTOM, 'valley', 180, B),
  outline: [L, T, RIGHT, landmarkAfterHinge(B, HINGE_BOTTOM, 180, 'valley')],
};
const B_UP = landmarkAfterHinge(B, HINGE_BOTTOM, 180, 'valley');
bottom.named = { ...REST, B: B_UP };

const topped = {
  ...applyHingeSnapshot(bottom, HINGE_TOP, 'valley', 180, T),
  outline: [L, landmarkAfterHinge(T, HINGE_TOP, 180, 'valley'), RIGHT, B_UP],
};
const T_DOWN = landmarkAfterHinge(T, HINGE_TOP, 180, 'valley');
topped.named = { ...bottom.named, T: T_DOWN };

const leftIn = {
  ...applyHingeSnapshot(topped, HINGE_LEFT, 'valley', 180, L),
  outline: [landmarkAfterHinge(L, HINGE_LEFT, 180, 'valley'), T_DOWN, RIGHT, B_UP],
};
const L_IN = landmarkAfterHinge(L, HINGE_LEFT, 180, 'valley');
leftIn.named = { ...topped.named, L: L_IN };

const body = {
  ...applyHingeSnapshot(leftIn, HINGE_RIGHT, 'valley', 180, RIGHT),
  outline: [L_IN, T_DOWN, landmarkAfterHinge(RIGHT, HINGE_RIGHT, 180, 'valley'), B_UP],
};
const R_IN = landmarkAfterHinge(RIGHT, HINGE_RIGHT, 180, 'valley');
body.named = { ...leftIn.named, RIGHT: R_IN };

const owl = { ...body, outline: body.outline };

export const OWL_NAMED = REST;

export const OWL_RECIPE: OrigamiRecipe = {
  id: 'origami-owl',
  name: 'Origami owl',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'owl-center', p0: HINGE_CENTER.p0, p1: HINGE_CENTER.p1, direction: 'valley' },
    { id: 'owl-bottom', p0: HINGE_BOTTOM.p0, p1: HINGE_BOTTOM.p1, direction: 'valley' },
    { id: 'owl-top', p0: HINGE_TOP.p0, p1: HINGE_TOP.p1, direction: 'valley' },
    { id: 'owl-side-left', p0: HINGE_LEFT.p0, p1: HINGE_LEFT.p1, direction: 'valley' },
    { id: 'owl-side-right', p0: HINGE_RIGHT.p0, p1: HINGE_RIGHT.p1, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    'center-folded': centerFolded,
    bottom,
    topped,
    'left-in': leftIn,
    body,
    owl,
  },
  finalSilhouette: [L_IN, T_DOWN, R_IN, B_UP],
  silhouetteToleranceM: 0.04,
  steps: [
    step({
      id: 'owl-center-fold',
      ordinal: 1,
      progressStage: 1,
      title: 'Create the center crease',
      instruction: 'Pinch and fold the paper sideways along the vertical crease.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'center-folded',
      actionType: 'fold',
      hinge: HINGE_CENTER,
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
      lockCreaseIds: ['owl-center'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1 folds the left corner across the vertical diagonal. The sheet then reopens on its own.',
    }),
    step({
      id: 'owl-center-open',
      ordinal: 2,
      progressStage: 1,
      title: 'Create the center crease',
      instruction: 'The paper opens back into a diamond. The center crease stays.',
      fromSnapshotId: 'center-folded',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_CENTER, id: 'owl-center-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen',
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
      meshStrategy: 'hinge',
      validationNotes: 'The reopen is automatic after the snap. It returns the diamond and keeps the locked center crease.',
    }),
    step({
      id: 'owl-bottom',
      ordinal: 3,
      progressStage: 2,
      title: 'Fold the bottom corner up',
      instruction: 'Pinch the bottom corner and fold it up toward the center.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'bottom',
      actionType: 'fold',
      hinge: HINGE_BOTTOM,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([HINGE_BOTTOM.p0, B, HINGE_BOTTOM.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B_UP }],
      arrowPathLocal: upArc(B, B_UP),
      lockCreaseIds: ['owl-bottom'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2 lifts the lower corner into a triangular layer on the diamond.',
    }),
    step({
      id: 'owl-top',
      ordinal: 4,
      progressStage: 3,
      title: 'Fold the top corner down',
      instruction: 'Pinch the top corner and fold it down, leaving a small gap.',
      fromSnapshotId: 'bottom',
      toSnapshotId: 'topped',
      actionType: 'fold',
      hinge: HINGE_TOP,
      direction: 'valley',
      movingRegion: {
        id: 'moving-top',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([HINGE_TOP.p0, T, HINGE_TOP.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T_DOWN }],
      arrowPathLocal: arc([T[0], T[1] - 0.01, 0.003], [T_DOWN[0], T_DOWN[1] + 0.01, 0.003], 0.04),
      lockCreaseIds: ['owl-top'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3 folds the top corner down and stops short of the lower flap.',
    }),
    step({
      id: 'owl-side-left',
      ordinal: 5,
      progressStage: 4,
      title: 'Fold both sides inward',
      instruction: 'Fold the left flap in toward the center.',
      fromSnapshotId: 'topped',
      toSnapshotId: 'left-in',
      actionType: 'fold',
      hinge: HINGE_LEFT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([HINGE_LEFT.p0, L, HINGE_LEFT.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L_IN }],
      arrowPathLocal: arc([L[0] + 0.02, L[1], 0.003], [L_IN[0], L_IN[1], 0.003], 0.04),
      lockCreaseIds: ['owl-side-left'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4A folds only the left flap. The numbered step waits for the right flap.',
    }),
    step({
      id: 'owl-side-right',
      ordinal: 6,
      progressStage: 4,
      title: 'Fold both sides inward',
      instruction: 'Fold the right flap in toward the center.',
      fromSnapshotId: 'left-in',
      toSnapshotId: 'body',
      actionType: 'fold',
      hinge: HINGE_RIGHT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-side-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([HINGE_RIGHT.p0, RIGHT, HINGE_RIGHT.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: R_IN }],
      arrowPathLocal: arc([RIGHT[0] - 0.02, RIGHT[1], 0.003], [R_IN[0], R_IN[1], 0.003], 0.04),
      lockCreaseIds: ['owl-side-right'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4B folds the right flap across the left one so the sides overlap.',
    }),
    step({
      id: 'owl-decorate',
      ordinal: 7,
      progressStage: 5,
      title: 'Bring your owl to life',
      instruction: 'Pinch to bring your owl to life!',
      fromSnapshotId: 'body',
      toSnapshotId: 'owl',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_CENTER, id: 'owl-decorate' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-owl-body',
        faceIds: ['top-left', 'top-right', 'bot-left', 'bot-right'],
        polygonUV: uvPoly([L_IN, T_DOWN, R_IN, B_UP]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.02, OWL_PINCH_AT[1], 0.01], [0.02, OWL_PINCH_AT[1], 0.01], 0.012),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 5 does not fold. One pinch plays the eyes, beak, and feet, then commits.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-owl',
};
