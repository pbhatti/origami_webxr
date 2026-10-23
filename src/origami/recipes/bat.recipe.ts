import { landmarkAfterHinge } from '../CreaseSolver.ts';
import {
  BAT_FOLD_ASSUMPTIONS,
  BAT_SHAPE_TOLERANCE_M,
  cutHeadNotch,
  extremaOf,
} from '../batFinalShape.ts';
import { applyHingeSnapshot } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const BAT_PAPER_COLOR = '#9564AD';

const H = PAPER_SIZE_M / 2;
const RAD = H * Math.SQRT2;
const BAND_T = 0.32;
const BAND = BAND_T * RAD;
const HEAD_H = 0.38 * BAND;
const NOTCH_W = 0.016;
const NOTCH_D = 0.016;

const L: Vec3 = [-RAD, 0, 0];
const RIGHT: Vec3 = [RAD, 0, 0];
const T: Vec3 = [0, RAD, 0];
const B: Vec3 = [0, -RAD, 0];
const O: Vec3 = [0, 0, 0];

const UL: Vec3 = [-(1 - BAND_T) * RAD, -BAND, 0];
const UR: Vec3 = [(1 - BAND_T) * RAD, -BAND, 0];
const HEAD_L: Vec3 = [UL[0] * 0.55, -BAND - HEAD_H, 0];
const HEAD_R: Vec3 = [UR[0] * 0.55, -BAND - HEAD_H, 0];
const EAR_L: Vec3 = [-NOTCH_W, HEAD_L[1], 0];
const EAR_R: Vec3 = [NOTCH_W, HEAD_L[1], 0];
const NOTCH: Vec3 = [0, HEAD_L[1] - NOTCH_D, 0];

void BAT_FOLD_ASSUMPTIONS;

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
  return [from, [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.028, 0.03], to];
}

function raiseExtendedTips(snapshot: MeshSnapshot, z: number): void {
  for (const vertex of snapshot.vertices) {
    if (Math.abs(vertex[0]) > 0.105 && Math.abs(vertex[2]) < 0.001) {
      vertex[2] = z;
    }
  }
  for (const point of Object.values(snapshot.named ?? {})) {
    if (Math.abs(point[0]) > 0.105 && Math.abs(point[2]) < 0.001) {
      point[2] = z;
    }
  }
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
  hits.sort((a, b) => a.t - b.t);
  const unique: Vec3[] = [];
  for (const hit of hits) {
    if (!unique.some((point) => Math.hypot(point[0] - hit.p[0], point[1] - hit.p[1]) < 1e-4)) {
      unique.push(hit.p);
    }
  }
  return unique;
}

function wingHinge(
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
    throw new Error(`bat wing crease ${id} does not cross the sheet`);
  }
  const hinge: HingeDefinition = {
    id,
    p0,
    p1,
    fixedFaces,
    movingFaces,
    layerMode: 'packet',
  };
  const lifted = landmarkAfterHinge(tip, hinge, 90, 'valley');
  if (lifted[2] >= 0) {
    return hinge;
  }
  return { ...hinge, p0: p1, p1: p0 };
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
  outline: [L, T, RIGHT, B],
};

const ALL_FACES = ['top-left', 'top-right', 'bot-left', 'bot-right'];

const HINGE_TRI: HingeDefinition = {
  id: 'bat-diagonal',
  p0: L,
  p1: RIGHT,
  fixedFaces: ['bot-left', 'bot-right'],
  movingFaces: ['top-left', 'top-right'],
};

const HINGE_BAND: HingeDefinition = {
  id: 'bat-band',
  p0: UL,
  p1: UR,
  fixedFaces: [],
  movingFaces: ALL_FACES,
  layerMode: 'packet',
};

const L_BAND = landmarkAfterHinge(L, HINGE_BAND, 180, 'valley');
const R_BAND = landmarkAfterHinge(RIGHT, HINGE_BAND, 180, 'valley');
const BAND_OUTLINE: Vec3[] = [UL, UR, R_BAND, B, L_BAND];
const RIGHT_DOWN: Vec3 = [0.045, -0.125, 0];
const LEFT_DOWN: Vec3 = [-RIGHT_DOWN[0], RIGHT_DOWN[1], 0];

const HINGE_WING_R: HingeDefinition = wingHinge(
  'bat-wing-right',
  R_BAND,
  RIGHT_DOWN,
  BAND_OUTLINE,
  ['top-right', 'bot-right'],
  ['top-left', 'bot-left'],
);

const HINGE_WING_L: HingeDefinition = wingHinge(
  'bat-wing-left',
  L_BAND,
  LEFT_DOWN,
  BAND_OUTLINE,
  ['top-left', 'bot-left'],
  ['top-right', 'bot-right'],
);

const HINGE_OPEN_R: HingeDefinition = { ...HINGE_WING_R, id: 'bat-wing-right-open' };
const HINGE_OPEN_L: HingeDefinition = { ...HINGE_WING_L, id: 'bat-wing-left-open' };

const HINGE_HEAD: HingeDefinition = {
  id: 'bat-head',
  p0: HEAD_L,
  p1: HEAD_R,
  fixedFaces: [],
  movingFaces: ALL_FACES,
  layerMode: 'packet',
};

const triangle = {
  ...applyHingeSnapshot(diamond, HINGE_TRI, 'valley', 180, T),
  outline: [L, RIGHT, B],
};
triangle.named = { ...REST, T: B };

const band = {
  ...applyHingeSnapshot(triangle, HINGE_BAND, 'valley', 180, O),
  outline: BAND_OUTLINE,
};
band.named = { ...REST, T: B, L: L_BAND, RIGHT: R_BAND };

const rightDown = {
  ...applyHingeSnapshot(band, HINGE_WING_R, 'valley', 180, R_BAND),
  outline: [L_BAND, UL, landmarkAfterHinge(UR, HINGE_WING_R, 180, 'valley'), RIGHT_DOWN, B],
};
const R_WING = landmarkAfterHinge(R_BAND, HINGE_WING_R, 180, 'valley');
const UR_WING = landmarkAfterHinge(UR, HINGE_WING_R, 180, 'valley');
rightDown.named = { ...band.named, RIGHT: R_WING };

const bothDown = {
  ...applyHingeSnapshot(rightDown, HINGE_WING_L, 'valley', 180, L_BAND),
  outline: [LEFT_DOWN, landmarkAfterHinge(UL, HINGE_WING_L, 180, 'valley'), UR_WING, R_WING, B],
};
const L_WING = landmarkAfterHinge(L_BAND, HINGE_WING_L, 180, 'valley');
const UL_WING = landmarkAfterHinge(UL, HINGE_WING_L, 180, 'valley');
bothDown.named = { ...rightDown.named, L: L_WING };

const rightOpen = {
  ...applyHingeSnapshot(bothDown, HINGE_OPEN_R, 'valley', 180, R_WING),
  outline: [L_WING, UL_WING, UR, landmarkAfterHinge(R_WING, HINGE_OPEN_R, 180, 'valley'), B],
};
const R_OPEN = landmarkAfterHinge(R_WING, HINGE_OPEN_R, 180, 'valley');
rightOpen.named = { ...bothDown.named, RIGHT: R_OPEN };
raiseExtendedTips(rightOpen, 0.004);

const leftOpen = {
  ...applyHingeSnapshot(rightOpen, HINGE_OPEN_L, 'valley', 180, L_WING),
  outline: [landmarkAfterHinge(L_WING, HINGE_OPEN_L, 180, 'valley'), UL, UR, R_OPEN, B],
};
const L_OPEN = landmarkAfterHinge(L_WING, HINGE_OPEN_L, 180, 'valley');
leftOpen.named = { ...rightOpen.named, L: L_OPEN };
raiseExtendedTips(leftOpen, 0.004);

const headed = {
  ...applyHingeSnapshot(leftOpen, HINGE_HEAD, 'valley', 180, UL),
  outline: [L_OPEN, HEAD_L, HEAD_R, R_OPEN, B],
};
headed.named = { ...leftOpen.named };

const eared = cutHeadNotch(headed, EAR_L, NOTCH, EAR_R);
eared.outline = [L_OPEN, EAR_L, NOTCH, EAR_R, R_OPEN, B];
eared.named = { ...headed.named };

const faced = { ...eared, outline: eared.outline };
const BAT_FINAL_SHAPE: Vec3[] = extremaOf(faced);

export const BAT_NAMED = REST;
export const BAT_FINAL_SILHOUETTE = BAT_FINAL_SHAPE;
export const BAT_WING_LEFT_TIP = L_OPEN;
export const BAT_WING_RIGHT_TIP = R_OPEN;
export const BAT_EAR_LEFT = EAR_L;
export const BAT_EAR_RIGHT = EAR_R;
export const BAT_EAR_NOTCH = NOTCH;
export const BAT_EAR_CUT_PATH: Vec3[] = [EAR_L, NOTCH, EAR_R];

export const BAT_STEPS = [
  'triangle-fold',
  'upper-band',
  'right-wing-down',
  'left-wing-down',
  'right-wing-open',
  'left-wing-open',
  'head-and-face',
] as const;

export type BatStep7Phase = 'head-fold' | 'ear-cut' | 'face-attachment' | 'complete';

export function batFinalPhase(stepId: string | null, complete: boolean): BatStep7Phase | null {
  if (complete) {
    return 'complete';
  }
  if (stepId === 'bat-head') {
    return 'head-fold';
  }
  if (stepId === 'bat-notch') {
    return 'ear-cut';
  }
  if (stepId === 'bat-face') {
    return 'face-attachment';
  }
  return null;
}

export const BAT_RECIPE: OrigamiRecipe = {
  id: 'origami-bat',
  name: 'Origami bat',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'bat-diagonal', p0: L, p1: RIGHT, direction: 'valley' },
    { id: 'bat-band', p0: UL, p1: UR, direction: 'valley' },
    { id: 'bat-wing-right', p0: HINGE_WING_R.p0, p1: HINGE_WING_R.p1, direction: 'valley' },
    { id: 'bat-wing-left', p0: HINGE_WING_L.p0, p1: HINGE_WING_L.p1, direction: 'valley' },
    { id: 'bat-wing-right-open', p0: HINGE_OPEN_R.p0, p1: HINGE_OPEN_R.p1, direction: 'valley' },
    { id: 'bat-wing-left-open', p0: HINGE_OPEN_L.p0, p1: HINGE_OPEN_L.p1, direction: 'valley' },
    { id: 'bat-head', p0: HEAD_L, p1: HEAD_R, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    triangle,
    band,
    'right-wing-down': rightDown,
    'both-wings-down': bothDown,
    'right-wing-open': rightOpen,
    'both-wings-open': leftOpen,
    headed,
    eared,
    faced,
  },
  finalSilhouette: BAT_FINAL_SHAPE,
  silhouetteToleranceM: BAT_SHAPE_TOLERANCE_M,
  steps: [
    step({
      id: 'bat-triangle',
      ordinal: 1,
      progressStage: 1,
      title: 'Fold into a triangle',
      instruction: 'Pinch a corner and fold the sheet into a downward-pointing triangle.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'triangle',
      actionType: 'fold',
      hinge: HINGE_TRI,
      direction: 'valley',
      movingRegion: {
        id: 'moving-top',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([L, [T[0], T[1] + 0.02, 0], RIGHT]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-bottom',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([L, B, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: B }],
      arrowPathLocal: arc([T[0], T[1] - 0.01, 0.003], [B[0], B[1] + 0.01, 0.003], 0.08),
      lockCreaseIds: ['bat-diagonal'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1: diamond presented as the square. Horizontal crease is the paper diagonal. Top corner folds to the bottom.',
    }),
    step({
      id: 'bat-band',
      ordinal: 2,
      progressStage: 2,
      title: 'Create the upper band',
      instruction: 'Fold the top section down along the highlighted crease.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'band',
      actionType: 'fold',
      hinge: HINGE_BAND,
      direction: 'valley',
      movingRegion: {
        id: 'moving-band',
        faceIds: ALL_FACES,
        polygonUV: uvPoly([L, UL, UR, RIGHT]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-body',
        faceIds: ALL_FACES,
        polygonUV: uvPoly([UL, B, UR]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'O', target: [0, -2 * BAND, 0] }],
      arrowPathLocal: arc([0, -0.008, 0.003], [0, -2 * BAND + 0.008, 0.003], 0.04),
      lockCreaseIds: ['bat-band'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2 reconstructed: valley fold parallel to the diagonal, 32% of triangle height, packet so both layers travel.',
    }),
    step({
      id: 'bat-right-wing-down',
      ordinal: 3,
      progressStage: 3,
      title: 'Shape the first wing',
      instruction: 'Pinch the right flap and fold it down along the crease.',
      fromSnapshotId: 'band',
      toSnapshotId: 'right-wing-down',
      actionType: 'fold',
      hinge: HINGE_WING_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-wing-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([HINGE_WING_R.p0, UR, R_BAND, HINGE_WING_R.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: R_WING }],
      arrowPathLocal: arc([R_BAND[0], R_BAND[1], 0.003], [R_WING[0], R_WING[1], 0.003], 0.04),
      lockCreaseIds: ['bat-wing-right'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 3: the right flap folds downward around its own diagonal. That flap stays a separate region for step 5.',
    }),
    step({
      id: 'bat-left-wing-down',
      ordinal: 4,
      progressStage: 4,
      title: 'Shape the second wing',
      instruction: 'Pinch the left flap and fold it down along the crease.',
      fromSnapshotId: 'right-wing-down',
      toSnapshotId: 'both-wings-down',
      actionType: 'fold',
      hinge: HINGE_WING_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-wing-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([HINGE_WING_L.p0, UL, L_BAND, HINGE_WING_L.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L_WING }],
      arrowPathLocal: arc([L_BAND[0], L_BAND[1], 0.003], [L_WING[0], L_WING[1], 0.003], 0.04),
      lockCreaseIds: ['bat-wing-left'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 4: the left flap folds downward. Both wings now point down. There is no further downward fold.',
    }),
    step({
      id: 'bat-right-wing-open',
      ordinal: 5,
      progressStage: 5,
      title: 'Open the right wing',
      instruction: 'Pinch the right wing and fold it up and outward.',
      fromSnapshotId: 'both-wings-down',
      toSnapshotId: 'right-wing-open',
      actionType: 'fold',
      hinge: HINGE_OPEN_R,
      direction: 'valley',
      movingRegion: {
        id: 'moving-open-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([HINGE_OPEN_R.p0, UR_WING, R_WING, HINGE_OPEN_R.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: R_OPEN }],
      arrowPathLocal: upArc(R_WING, R_OPEN),
      lockCreaseIds: ['bat-wing-right-open'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 5 reuses the step 3 hinge. The existing right flap rotates up and out. No new triangle is cut.',
    }),
    step({
      id: 'bat-left-wing-open',
      ordinal: 6,
      progressStage: 6,
      title: 'Open the left wing',
      instruction: 'Pinch the left wing and fold it up and outward.',
      fromSnapshotId: 'right-wing-open',
      toSnapshotId: 'both-wings-open',
      actionType: 'fold',
      hinge: HINGE_OPEN_L,
      direction: 'valley',
      movingRegion: {
        id: 'moving-open-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([HINGE_OPEN_L.p0, UL_WING, L_WING, HINGE_OPEN_L.p1]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: L_OPEN }],
      arrowPathLocal: upArc(L_WING, L_OPEN),
      lockCreaseIds: ['bat-wing-left-open'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 6 reuses the step 4 hinge on the step 5 sheet. Both wings end extended, with the body pointing down.',
    }),
    step({
      id: 'bat-head',
      ordinal: 7,
      progressStage: 7,
      title: "Make the bat's ears and add the face",
      instruction: 'Fold the top section down to shape the head.',
      fromSnapshotId: 'both-wings-open',
      toSnapshotId: 'headed',
      actionType: 'fold',
      hinge: HINGE_HEAD,
      direction: 'valley',
      movingRegion: {
        id: 'moving-head',
        faceIds: ALL_FACES,
        polygonUV: uvPoly([UL, UR, HEAD_R, HEAD_L]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'O', target: [0, -BAND - 2 * HEAD_H, 0] }],
      arrowPathLocal: arc([0, -BAND + 0.004, 0.003], [0, -BAND - HEAD_H - 0.004, 0.003], 0.02),
      lockCreaseIds: ['bat-head'],
      meshStrategy: 'hinge',
      validationNotes: 'Step 7 head phase: the upper band folds down. Ears and the face stay on this same progress step.',
    }),
    step({
      id: 'bat-notch',
      ordinal: 8,
      progressStage: 7,
      title: "Make the bat's ears and add the face",
      instruction: 'Pinch the scissors to create two pointed ears.',
      fromSnapshotId: 'headed',
      toSnapshotId: 'eared',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_HEAD, id: 'bat-notch' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-notch',
        faceIds: ALL_FACES,
        polygonUV: uvPoly([EAR_L, EAR_R, NOTCH]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.01, -BAND + 0.004, 0.006], [0.01, -BAND + 0.004, 0.006], 0.012),
      meshStrategy: 'crease-press',
      extraCreaseLines: [
        [EAR_L, NOTCH],
        [EAR_R, NOTCH],
      ],
      validationNotes:
        'Step 7b: reference uses scissors. Assisted cut splits only head-flap faces and drops the V scrap so wings stay attached.',
    }),
    step({
      id: 'bat-face',
      ordinal: 9,
      progressStage: 7,
      title: "Make the bat's ears and add the face",
      instruction: 'Watch your bat come to life!',
      fromSnapshotId: 'eared',
      toSnapshotId: 'faced',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_HEAD, id: 'bat-face' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-face',
        faceIds: ALL_FACES,
        polygonUV: uvPoly([HEAD_L, HEAD_R, EAR_R, EAR_L]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.012, HEAD_L[1], 0.006], [0.012, HEAD_L[1], 0.006], 0.01),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 7 face phase: the sheet is already eared. Eyes, smile, and fangs attach to the head. The progress step completes only after this.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-bat',
};
