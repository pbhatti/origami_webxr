import { perpBisectorClipped } from '../creaseMath.ts';
import { applyHingeSnapshot } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

const H = PAPER_SIZE_M / 2;
const RAD = H * Math.SQRT2;

const L: Vec3 = [-RAD, 0, 0];
const RIGHT: Vec3 = [RAD, 0, 0];
const T: Vec3 = [0, RAD, 0];
const B: Vec3 = [0, -RAD, 0];
const O: Vec3 = [0, 0, 0];

const T_FOLDED: Vec3 = [RIGHT[0] - PAPER_SIZE_M, 0, 0];
const PU: Vec3 = [T_FOLDED[0], T_FOLDED[0] + RAD, 0];
const PL: Vec3 = [PU[0], -PU[1], 0];

const HEAD_X = L[0] + 0.04;
const HEAD_TIP: Vec3 = [2 * HEAD_X - L[0], 0, 0];
const TAIL_TIP: Vec3 = [0.082, 0.07, 0];
const H0: Vec3 = [HEAD_X, 0, 0];
const H1: Vec3 = [HEAD_X, 0.04, 0];
const [TAIL0, TAIL1] = perpBisectorClipped(RIGHT, TAIL_TIP, [
  [HEAD_TIP, PU],
  [PU, RIGHT],
  [RIGHT, HEAD_TIP],
]);

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function uvBox(u0: number, v0: number, u1: number, v1: number): Vec2[] {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, bulge], to];
}

type Named7 = {
  L: Vec3;
  RIGHT: Vec3;
  T: Vec3;
  B: Vec3;
  O: Vec3;
  PU: Vec3;
  PL: Vec3;
};

function verts7(named: Named7): Vec3[] {
  return [named.L, named.RIGHT, named.T, named.B, named.O, named.PU, named.PL];
}

const DIAMOND_FACES: FaceDefinition[] = [
  { id: 'top-left', vertices: [0, 2, 4], layer: 0, materialId: 'front' },
  { id: 'top-right', vertices: [2, 1, 4], layer: 0, materialId: 'front' },
  { id: 'bot-right', vertices: [1, 3, 4], layer: 0, materialId: 'front' },
  { id: 'bot-left', vertices: [3, 0, 4], layer: 0, materialId: 'front' },
];

function snap(named: Named7, faces: FaceDefinition[], outline: Vec3[]): MeshSnapshot {
  return { vertices: verts7(named), faces, named, outline };
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

const REST: Named7 = { L, RIGHT, T, B, O, PU, PL };

const HINGE_HORIZONTAL: HingeDefinition = {
  id: 'horizontal',
  p0: L,
  p1: RIGHT,
  fixedFaces: ['top-left', 'top-right'],
  movingFaces: ['bot-left', 'bot-right'],
};
const HINGE_KITE_UPPER: HingeDefinition = {
  id: 'kite-upper',
  p0: RIGHT,
  p1: PU,
  fixedFaces: ['bot-left', 'bot-right', 'top-left'],
  movingFaces: ['top-right'],
};
const HINGE_KITE_LOWER: HingeDefinition = {
  id: 'kite-lower',
  p0: RIGHT,
  p1: PL,
  fixedFaces: ['top-left', 'top-right'],
  movingFaces: ['bot-right', 'bot-left'],
};
const HINGE_HEAD: HingeDefinition = {
  id: 'head',
  p0: H0,
  p1: H1,
  fixedFaces: ['top-right', 'bot-right'],
  movingFaces: ['top-left', 'bot-left'],
};
const HINGE_TAIL: HingeDefinition = {
  id: 'tail',
  p0: TAIL0,
  p1: TAIL1,
  fixedFaces: ['top-left', 'bot-left'],
  movingFaces: ['top-right', 'bot-right'],
};

const diamond = snap(REST, DIAMOND_FACES, [L, T, RIGHT, B]);
const triangle = { ...applyHingeSnapshot(diamond, HINGE_HORIZONTAL, 'valley', 180, B), outline: [L, T, RIGHT] };
const kiteUpper = { ...applyHingeSnapshot(diamond, HINGE_KITE_UPPER, 'valley', 180, T), outline: [L, PU, RIGHT, B] };
const kite = { ...applyHingeSnapshot(kiteUpper, HINGE_KITE_LOWER, 'valley', 180, B), outline: [L, PU, RIGHT, PL] };
const body = { ...applyHingeSnapshot(kite, HINGE_HORIZONTAL, 'valley', 180, PL), outline: [L, PU, RIGHT] };
const head = { ...applyHingeSnapshot(body, HINGE_HEAD, 'valley', 180, L), outline: [HEAD_TIP, PU, RIGHT] };
const tail = { ...applyHingeSnapshot(head, HINGE_TAIL, 'valley', 180, RIGHT), outline: [HEAD_TIP, PU, TAIL_TIP] };
const whale = { ...tail, outline: [HEAD_TIP, PU, TAIL_TIP] };

export const WHALE_NAMED = { L, RIGHT, T, B, O, PU, PL };

export const WHALE_RECIPE: OrigamiRecipe = {
  id: 'origami-whale',
  name: 'Origami whale',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'horizontal', p0: L, p1: RIGHT, direction: 'valley' },
    { id: 'kite-upper', p0: RIGHT, p1: PU, direction: 'valley' },
    { id: 'kite-lower', p0: RIGHT, p1: PL, direction: 'valley' },
    { id: 'head', p0: H0, p1: H1, direction: 'valley' },
    { id: 'tail', p0: TAIL0, p1: TAIL1, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    triangle,
    'kite-upper': kiteUpper,
    kite,
    body,
    head,
    tail,
    whale,
  },
  finalSilhouette: [HEAD_TIP, PU, TAIL_TIP],
  silhouetteToleranceM: 0.035,
  steps: [
    step({
      id: 'diag-fold',
      ordinal: 1,
      progressStage: 1,
      title: 'Fold the diamond in half',
      instruction: 'Pinch the bottom corner and fold it up to the top corner along the dotted line.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'triangle',
      actionType: 'fold',
      hinge: HINGE_HORIZONTAL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-bottom',
        faceIds: ['bot-left', 'bot-right'],
        polygonUV: uvPoly([L, [B[0], B[1] - 0.02, 0], RIGHT]),
        allowedHands: 'either',
      },
      optionalHoldRegion: { id: 'hold-top', faceIds: ['top-left', 'top-right'], polygonUV: uvPoly([L, T, RIGHT]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: T }],
      arrowPathLocal: arc([B[0], B[1] + 0.01, 0.003], [T[0], T[1] - 0.01, 0.003], 0.08),
      lockCreaseIds: ['horizontal'],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 1: diamond, horizontal crease through left and right corners, bottom to top.',
    }),
    step({
      id: 'unfold-diag',
      ordinal: 2,
      progressStage: 2,
      title: 'Open the diamond',
      instruction: 'Open the triangle back into a diamond. The horizontal crease stays.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'diamond',
      actionType: 'unfold',
      hinge: { ...HINGE_HORIZONTAL, id: 'horizontal-open' },
      direction: 'valley',
      movingRegion: { id: 'moving-open', faceIds: ['bot-left'], polygonUV: uvPoly([L, T, RIGHT]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B }],
      arrowPathLocal: arc([0, 0.08, 0.002], [0, -0.1, 0.002], 0.05),
      extraCreaseLines: [
        [RIGHT, PU],
        [RIGHT, PL],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 2 opening. Unfold is required before the two kite folds; it does not complete stage 2.',
    }),
    step({
      id: 'kite-upper',
      ordinal: 3,
      progressStage: 2,
      title: 'Fold the upper edge in',
      instruction: 'Fold the upper-right edge down to the horizontal centerline.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'kite-upper',
      actionType: 'fold',
      hinge: HINGE_KITE_UPPER,
      direction: 'valley',
      movingRegion: { id: 'moving-upper', faceIds: ['top-right'], polygonUV: uvPoly([T, RIGHT, O]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-lower', faceIds: ['bot-right'], polygonUV: uvPoly([B, RIGHT, L]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'T', target: T_FOLDED }],
      arrowPathLocal: arc([0.04, 0.08, 0.002], [0.04, 0.01, 0.002], 0.04),
      creaseLineLocal: [RIGHT, PU],
      extraCreaseLines: [[RIGHT, PL]],
      lockCreaseIds: ['kite-upper'],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 2, first sub-fold. Upper-right edge to the remembered horizontal crease.',
    }),
    step({
      id: 'kite-lower',
      ordinal: 4,
      progressStage: 2,
      title: 'Fold the lower edge in',
      instruction: 'Fold the lower-right edge up to the horizontal centerline.',
      fromSnapshotId: 'kite-upper',
      toSnapshotId: 'kite',
      actionType: 'fold',
      hinge: HINGE_KITE_LOWER,
      direction: 'valley',
      movingRegion: { id: 'moving-lower', faceIds: ['bot-right'], polygonUV: uvPoly([B, RIGHT, O]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-kite', faceIds: ['top-right'], polygonUV: uvPoly([L, T, RIGHT]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: T_FOLDED }],
      arrowPathLocal: arc([0.04, -0.08, 0.002], [0.04, -0.01, 0.002], 0.04),
      creaseLineLocal: [RIGHT, PL],
      lockCreaseIds: ['kite-lower'],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 2, second sub-fold. Stage 2 completes only after this snap.',
    }),
    step({
      id: 'body-center',
      ordinal: 5,
      progressStage: 3,
      title: 'Fold the body in half',
      instruction: 'Fold the lower portion up along the horizontal centerline.',
      fromSnapshotId: 'kite',
      toSnapshotId: 'body',
      actionType: 'fold',
      hinge: HINGE_HORIZONTAL,
      direction: 'valley',
      movingRegion: { id: 'moving-body', faceIds: ['bot-left', 'bot-right'], polygonUV: uvBox(0, 0.15, 1.2, 0.5), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-body', faceIds: ['top-left'], polygonUV: uvBox(0, 0.5, 1.2, 0.85), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'PL', target: PU }],
      arrowPathLocal: arc([0, -0.06, 0.002], [0, 0.06, 0.002], 0.045),
      creaseLineLocal: [L, RIGHT],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 3: book-fold the kite on the remembered horizontal crease. Pointed end stays right.',
    }),
    step({
      id: 'head-in',
      ordinal: 6,
      progressStage: 4,
      title: 'Fold the head',
      instruction: 'Fold the left tip inward along the short dotted crease.',
      fromSnapshotId: 'body',
      toSnapshotId: 'head',
      actionType: 'fold',
      hinge: HINGE_HEAD,
      direction: 'valley',
      movingRegion: { id: 'moving-head', faceIds: ['top-left'], polygonUV: uvPoly([L, [HEAD_X, 0.05, 0], [HEAD_X, -0.04, 0]]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-body-head', faceIds: ['top-right'], polygonUV: uvBox(0.35, 0.4, 1.1, 0.7), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: HEAD_TIP }],
      arrowPathLocal: arc([-0.13, 0.01, 0.002], [-0.07, 0.01, 0.002], 0.03),
      lockCreaseIds: ['head'],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 4: short vertical crease near the left point. Head inset is estimated from the diagram.',
    }),
    step({
      id: 'tail-up',
      ordinal: 7,
      progressStage: 5,
      title: 'Fold the tail up',
      instruction: 'Fold the right point upward to form the tail. Do not flip the paper unless a Flip guide appears.',
      fromSnapshotId: 'head',
      toSnapshotId: 'tail',
      actionType: 'fold',
      hinge: HINGE_TAIL,
      direction: 'valley',
      movingRegion: { id: 'moving-tail', faceIds: ['top-right'], polygonUV: uvPoly([RIGHT, [0.06, 0.05, 0], [0.06, -0.02, 0]]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: TAIL_TIP }],
      arrowPathLocal: arc([0.12, 0.01, 0.002], [0.08, 0.07, 0.002], 0.04),
      lockCreaseIds: ['tail'],
      meshStrategy: 'hinge',
      validationNotes:
        'Panel 5: tail folds up. The diagram has a wrap-around arrow at the tip that may be a mountain fold or a turn-over. This candidate does not silently flip the packet.',
    }),
    step({
      id: 'complete-whale',
      ordinal: 8,
      progressStage: 6,
      title: 'Set the whale',
      instruction: 'Pinch and hold to flatten and set the whale, or drag along the arrow.',
      fromSnapshotId: 'tail',
      toSnapshotId: 'whale',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_HORIZONTAL, id: 'flatten' },
      direction: 'valley',
      movingRegion: { id: 'moving-whale', faceIds: ['top-left', 'top-right'], polygonUV: uvPoly([HEAD_TIP, PU, TAIL_TIP]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([0.02, 0.04, 0.008], [0.02, -0.01, 0.002], 0.02),
      meshStrategy: 'crease-press',
      validationNotes: 'Panel 6: silhouette check, then the folded sheet becomes the swimming whale. Eye is added on completion.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-whale',
};
