import { landmarkAfterHinge } from '../CreaseSolver.ts';
import {
  FOX_EAR_HINGE_LEFT,
  FOX_EAR_HINGE_RIGHT,
  FOX_EAR_INNER_LEFT,
  FOX_EAR_INNER_RIGHT,
  FOX_FACE_LEFT,
  FOX_FACE_RIGHT,
  FOX_FINAL_SHAPE,
  FOX_NOSE,
  FOX_SHAPE_TOLERANCE_M,
  installFoxFinalShape,
} from '../foxFinalShape.ts';
import { applyHingeSnapshot } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const FOX_PAPER_COLOR = '#d9782f';

const H = PAPER_SIZE_M / 2;
const RAD = H * Math.SQRT2;

const L: Vec3 = [-RAD, 0, 0];
const RIGHT: Vec3 = [RAD, 0, 0];
const T: Vec3 = [0, RAD, 0];
const B: Vec3 = [0, -RAD, 0];
const O: Vec3 = [0, 0, 0];
const TL: Vec3 = FOX_FACE_LEFT;
const TR: Vec3 = FOX_FACE_RIGHT;
const AL: Vec3 = FOX_EAR_HINGE_LEFT;
const AR: Vec3 = FOX_EAR_HINGE_RIGHT;
const GL: Vec3 = FOX_EAR_INNER_LEFT;
const GR: Vec3 = FOX_EAR_INNER_RIGHT;

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, bulge], to];
}

type NamedFox = {
  L: Vec3;
  RIGHT: Vec3;
  T: Vec3;
  B: Vec3;
  O: Vec3;
  TL: Vec3;
  TR: Vec3;
};

function verts(named: NamedFox): Vec3[] {
  return [named.L, named.RIGHT, named.T, named.B, named.O, named.O, named.O, named.TL, named.TR];
}

const DIAMOND_FACES: FaceDefinition[] = [
  { id: 'top-left', vertices: [0, 2, 4], layer: 0, materialId: 'front' },
  { id: 'top-right', vertices: [2, 1, 4], layer: 0, materialId: 'front' },
  { id: 'bot-right', vertices: [1, 3, 4], layer: 0, materialId: 'front' },
  { id: 'bot-left', vertices: [3, 0, 4], layer: 0, materialId: 'front' },
];

function snap(named: NamedFox, faces: FaceDefinition[], outline: Vec3[]): MeshSnapshot {
  return { vertices: verts(named), faces, named, outline };
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

const REST: NamedFox = { L, RIGHT, T, B, O, TL, TR };

const HINGE_HORIZONTAL: HingeDefinition = {
  id: 'horizontal',
  p0: L,
  p1: RIGHT,
  fixedFaces: ['top-left', 'top-right'],
  movingFaces: ['bot-left', 'bot-right'],
};

const FOX_PACKET_FACES = ['top-left', 'top-right', 'bot-left', 'bot-right'];

const HINGE_BROW: HingeDefinition = {
  id: 'brow',
  p0: TL,
  p1: TR,
  fixedFaces: [],
  movingFaces: FOX_PACKET_FACES,
  layerMode: 'packet',
};

const HINGE_EAR_LEFT: HingeDefinition = {
  id: 'ear-left',
  p0: AL,
  p1: GL,
  fixedFaces: ['top-right', 'bot-right'],
  movingFaces: ['top-left', 'bot-left'],
  layerMode: 'packet',
};

const HINGE_EAR_RIGHT: HingeDefinition = {
  id: 'ear-right',
  // Axis runs inner base → outer hinge. Mirroring AL→GL would reverse the
  // right-hand rule and send a valley fold away from the viewer.
  p0: GR,
  p1: AR,
  fixedFaces: ['top-left', 'bot-left'],
  movingFaces: ['top-right', 'bot-right'],
  layerMode: 'packet',
};

export const FOX_EAR_LEFT_CREASE: [Vec3, Vec3] = [AL, GL];
export const FOX_EAR_RIGHT_CREASE: [Vec3, Vec3] = [GR, AR];

const EAR_L = landmarkAfterHinge(L, HINGE_EAR_LEFT, 180, 'valley');
const EAR_R = landmarkAfterHinge(RIGHT, HINGE_EAR_RIGHT, 180, 'valley');

const diamond = snap(REST, DIAMOND_FACES, [L, T, RIGHT, B]);
const triangle = { ...applyHingeSnapshot(diamond, HINGE_HORIZONTAL, 'valley', 180, B), outline: [L, T, RIGHT] };
const brow = { ...applyHingeSnapshot(triangle, HINGE_BROW, 'valley', 180, T), outline: [L, TL, TR, RIGHT] };
const earLeft = { ...applyHingeSnapshot(brow, HINGE_EAR_LEFT, 'valley', 180, L), outline: [EAR_L, GL, TL, TR, RIGHT, O] };
const earRight = { ...applyHingeSnapshot(earLeft, HINGE_EAR_RIGHT, 'valley', 180, RIGHT), outline: [EAR_L, EAR_R, O] };
const fox = { ...earRight, outline: [EAR_L, EAR_R, O] };
installFoxFinalShape(fox);
earRight.outline = FOX_FINAL_SHAPE.local;
fox.outline = FOX_FINAL_SHAPE.local;

export const FOX_NAMED = REST;

export const FOX_RECIPE: OrigamiRecipe = {
  id: 'origami-fox',
  name: 'Origami fox',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'horizontal', p0: L, p1: RIGHT, direction: 'valley' },
    { id: 'brow', p0: TL, p1: TR, direction: 'valley' },
    { id: 'ear-left', p0: AL, p1: GL, direction: 'valley' },
    { id: 'ear-right', p0: GR, p1: AR, direction: 'valley' },
  ],
  snapshots: {
    diamond,
    triangle,
    brow,
    'ear-left': earLeft,
    'ear-right': earRight,
    fox,
  },
  finalSilhouette: FOX_FINAL_SHAPE.local,
  silhouetteToleranceM: FOX_SHAPE_TOLERANCE_M,
  steps: [
    step({
      id: 'fox-half',
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
      optionalHoldRegion: {
        id: 'hold-top',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([L, T, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: T }],
      arrowPathLocal: arc([B[0], B[1] + 0.01, 0.003], [T[0], T[1] - 0.01, 0.003], 0.08),
      lockCreaseIds: ['horizontal'],
      meshStrategy: 'hinge',
      validationNotes: 'Panel 1: diamond to triangle, valley fold along the horizontal diagonal.',
    }),
    step({
      id: 'fox-brow',
      ordinal: 2,
      progressStage: 2,
      title: 'Fold the top down',
      instruction: 'Fold the top point down to the center so a short brow crease appears.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'brow',
      actionType: 'fold',
      hinge: HINGE_BROW,
      direction: 'valley',
      movingRegion: {
        id: 'moving-tip',
        faceIds: FOX_PACKET_FACES,
        polygonUV: uvPoly([TL, T, TR]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-base',
        faceIds: FOX_PACKET_FACES,
        polygonUV: uvPoly([L, TL, TR, RIGHT]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'T', target: O },
        { sourceVertexId: 'B', target: O },
      ],
      arrowPathLocal: arc([0, RAD * 0.72, 0.003], [0, RAD * 0.18, 0.003], 0.05),
      lockCreaseIds: ['brow'],
      meshStrategy: 'hinge',
      validationNotes:
        'Panel 2: packet fold. Both stacked layers of the upper triangle rotate about TL–TR; the lower trapezoid stays.',
    }),
    step({
      id: 'fox-ear-left',
      ordinal: 3,
      progressStage: 3,
      title: 'Fold the left ear',
      instruction: 'Fold each side corner up along its dashed line to make the ears. Either ear can go first.',
      fromSnapshotId: 'brow',
      toSnapshotId: 'ear-left',
      actionType: 'fold',
      hinge: HINGE_EAR_LEFT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-left',
        faceIds: ['top-left', 'bot-left'],
        polygonUV: uvPoly([L, AL, GL]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-center',
        faceIds: FOX_PACKET_FACES,
        polygonUV: uvPoly([TL, TR, O]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'L', target: EAR_L }],
      arrowPathLocal: arc([-0.1, 0.02, 0.003], [EAR_L[0], EAR_L[1] - 0.02, 0.003], 0.04),
      lockCreaseIds: ['ear-left'],
      meshStrategy: 'hinge',
      parallelGroup: 'fox-ears',
      validationNotes:
        'Left ear. Both stacked layers of the left kite wing rotate about the edge hinge–inner base. The diamond cheeks stay.',
    }),
    step({
      id: 'fox-ear-right',
      ordinal: 4,
      progressStage: 3,
      title: 'Fold the right ear',
      instruction: 'Fold the remaining corner up along its dashed line to make the ear.',
      fromSnapshotId: 'brow',
      toSnapshotId: 'ear-right',
      actionType: 'fold',
      hinge: HINGE_EAR_RIGHT,
      direction: 'valley',
      movingRegion: {
        id: 'moving-right',
        faceIds: ['top-right', 'bot-right'],
        polygonUV: uvPoly([RIGHT, AR, GR]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-center',
        faceIds: FOX_PACKET_FACES,
        polygonUV: uvPoly([TL, TR, O]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'RIGHT', target: EAR_R }],
      arrowPathLocal: arc([0.1, 0.02, 0.003], [EAR_R[0], EAR_R[1] - 0.02, 0.003], 0.04),
      lockCreaseIds: ['ear-right'],
      meshStrategy: 'hinge',
      parallelGroup: 'fox-ears',
      validationNotes:
        'Right ear. Both stacked layers of the right kite wing rotate about the inner base–edge hinge. The diamond cheeks stay.',
    }),
    step({
      id: 'complete-fox',
      ordinal: 5,
      progressStage: 4,
      title: 'Turn over and set the face',
      instruction: 'Pinch and hold to turn the fox over. The ears stay up and the face appears on the side toward you.',
      fromSnapshotId: 'ear-right',
      toSnapshotId: 'fox',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_HORIZONTAL, id: 'fox-set' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-fox',
        faceIds: ['top-left', 'top-right'],
        polygonUV: uvPoly([TL, TR, FOX_NOSE]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([0.06, 0.04, 0.008], [0.1, 0.02, 0.002], 0.02),
      meshStrategy: 'crease-press',
      validationNotes: 'Turn the whole sheet over about its vertical axis. The fold topology stays as folded; eyes and nose are drawn on the side that then faces you.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-fox',
};
