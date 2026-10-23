import { PAPER_SIZE_M } from '../placement.ts';
import type {
  CoupledHinge,
  FaceDefinition,
  FoldStep,
  MeshSnapshot,
  OrigamiRecipe,
  Vec2,
  Vec3,
} from '../types.ts';

const H = PAPER_SIZE_M / 2;

const A: Vec3 = [-H, -H, 0];
const B: Vec3 = [H, -H, 0];
const C: Vec3 = [H, H, 0];
const D: Vec3 = [-H, H, 0];
const O: Vec3 = [0, 0, 0];
const ML: Vec3 = [-H, 0, 0];
const MR: Vec3 = [H, 0, 0];
const MB: Vec3 = [0, -H, 0];
const MT: Vec3 = [0, H, 0];

const TAIL_L: Vec3 = [-0.038, 0.022, 0];
const TAIL_R: Vec3 = [0.038, 0.022, 0];
const NOTCH: Vec3 = [0, 0.004, 0];
const MOUTH: Vec3 = MB;

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

type Named9 = {
  A: Vec3;
  B: Vec3;
  C: Vec3;
  D: Vec3;
  O: Vec3;
  ML: Vec3;
  MR: Vec3;
  MB: Vec3;
  MT: Vec3;
};

function verts9(named: Named9): Vec3[] {
  return [named.A, named.B, named.C, named.D, named.O, named.ML, named.MR, named.MB, named.MT];
}

const REST = { A, B, C, D, O, ML, MR, MB, MT };

const SQUARE_FACES: FaceDefinition[] = [
  { id: 'a-mb-o', vertices: [0, 7, 4], layer: 0, materialId: 'front' },
  { id: 'mb-b-o', vertices: [7, 1, 4], layer: 0, materialId: 'front' },
  { id: 'b-mr-o', vertices: [1, 6, 4], layer: 0, materialId: 'front' },
  { id: 'mr-c-o', vertices: [6, 2, 4], layer: 0, materialId: 'front' },
  { id: 'c-mt-o', vertices: [2, 8, 4], layer: 0, materialId: 'front' },
  { id: 'mt-d-o', vertices: [8, 3, 4], layer: 0, materialId: 'front' },
  { id: 'd-ml-o', vertices: [3, 5, 4], layer: 0, materialId: 'front' },
  { id: 'ml-a-o', vertices: [5, 0, 4], layer: 0, materialId: 'front' },
];

function layered(faces: FaceDefinition[], layer: number): FaceDefinition[] {
  return faces.map((face) => ({ ...face, id: `${face.id}@${layer}`, layer }));
}

function snap(named: Named9, faces: FaceDefinition[], outline: Vec3[]): MeshSnapshot {
  return { vertices: verts9(named), faces, named, outline };
}

function step(
  input: Omit<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM'> &
    Partial<Pick<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM'>>,
): FoldStep {
  return {
    angleToleranceDeg: 12,
    targetPointToleranceM: 0.018,
    ...input,
    creaseLineLocal: [input.hinge.p0, input.hinge.p1],
  };
}

const square = snap(REST, SQUARE_FACES, [A, B, C, D]);

const triangleAcNamed = {
  A,
  B: D,
  C,
  D,
  O,
  ML,
  MR: MT,
  MB: ML,
  MT,
};
const triangleAc = snap(triangleAcNamed, [...SQUARE_FACES, ...layered(SQUARE_FACES, 1)], [A, C, D]);

const triangleBdNamed = {
  A: C,
  B,
  C,
  D,
  O,
  ML: MT,
  MR,
  MB: MR,
  MT,
};
const triangleBd = snap(triangleBdNamed, [...SQUARE_FACES, ...layered(SQUARE_FACES, 1)], [B, C, D]);

const rectangleNamed = {
  A,
  B,
  C: B,
  D: A,
  O,
  ML,
  MR,
  MB,
  MT: MB,
};
const rectangle = snap(rectangleNamed, [...SQUARE_FACES, ...layered(SQUARE_FACES, 1)], [A, B, MR, ML]);

const triangleBaseNamed = {
  A: MB,
  B: MB,
  C: MB,
  D: MB,
  O,
  ML,
  MR,
  MB,
  MT: MB,
};
const triangleBaseFaces: FaceDefinition[] = [
  { id: 'left', vertices: [5, 7, 4], layer: 0, materialId: 'front' },
  { id: 'right', vertices: [6, 4, 7], layer: 0, materialId: 'front' },
  { id: 'left-back', vertices: [5, 7, 4], layer: 1, materialId: 'front' },
  { id: 'right-back', vertices: [6, 4, 7], layer: 1, materialId: 'front' },
];
const triangleBase = snap(triangleBaseNamed, triangleBaseFaces, [ML, MR, MB]);

const fishNamed = {
  A: MOUTH,
  B: MOUTH,
  C: MOUTH,
  D: MOUTH,
  O: NOTCH,
  ML: TAIL_L,
  MR,
  MB: MOUTH,
  MT: MOUTH,
};
const fishFlatNamed = {
  ...fishNamed,
  MR: TAIL_R,
};
const fishFaces: FaceDefinition[] = [
  { id: 'left-body', vertices: [7, 5, 4], layer: 0, materialId: 'front' },
  { id: 'right-body', vertices: [7, 4, 6], layer: 0, materialId: 'front' },
  { id: 'left-back', vertices: [7, 5, 4], layer: 1, materialId: 'front' },
  { id: 'right-back', vertices: [7, 4, 6], layer: 1, materialId: 'front' },
];
const fish = snap(fishNamed, fishFaces, [MOUTH, TAIL_L, MR]);
const fishFlat = snap(fishFlatNamed, fishFaces, [MOUTH, TAIL_L, TAIL_R]);

const collapseHinges: CoupledHinge[] = [
  {
    id: 'left-collapse',
    p0: ML,
    p1: MB,
    fixedFaces: ['right', 'right-back'],
    movingFaces: ['a-mb-o', 'ml-a-o'],
    targetAngleDeg: 180,
  },
  {
    id: 'right-collapse',
    p0: MR,
    p1: MB,
    fixedFaces: ['left', 'left-back'],
    movingFaces: ['mb-b-o', 'b-mr-o'],
    targetAngleDeg: 180,
  },
];

export const PINK_NAMED = { A, B, C, D, O, ML, MR, MB, MT };

export const PINK_RECIPE: OrigamiRecipe = {
  id: 'fish-pink-reference',
  name: 'Origami fish (pink-paper screenshot candidate)',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'ac', p0: A, p1: C, direction: 'valley' },
    { id: 'bd', p0: B, p1: D, direction: 'valley' },
    { id: 'y0', p0: ML, p1: MR, direction: 'valley' },
    { id: 'left-collapse', p0: ML, p1: MB, direction: 'valley' },
    { id: 'right-collapse', p0: MR, p1: MB, direction: 'valley' },
  ],
  snapshots: {
    square,
    'triangle-ac': triangleAc,
    'triangle-bd': triangleBd,
    rectangle,
    'triangle-base': triangleBase,
    fish,
    'fish-flat': fishFlat,
  },
  finalSilhouette: [MOUTH, TAIL_L, TAIL_R],
  silhouetteToleranceM: 0.03,
  steps: [
    step({
      id: 'diag-ac',
      ordinal: 1,
      title: 'Fold the first diagonal',
      instruction: 'Fold corner B to corner D along the dotted diagonal.',
      fromSnapshotId: 'square',
      toSnapshotId: 'triangle-ac',
      actionType: 'fold',
      hinge: {
        id: 'ac',
        p0: A,
        p1: C,
        fixedFaces: ['ml-a-o', 'd-ml-o', 'mt-d-o', 'c-mt-o'],
        movingFaces: ['a-mb-o', 'mb-b-o', 'b-mr-o', 'mr-c-o'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-b', faceIds: ['mb-b-o'], polygonUV: uvPoly([A, B, C]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-d', faceIds: ['mt-d-o'], polygonUV: uvPoly([A, C, D]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: D }],
      arrowPathLocal: arc([0.07, -0.07, 0.002], [-0.07, 0.07, 0.002], 0.06),
      creaseLineLocal: [A, C],
      lockCreaseIds: ['ac'],
      meshStrategy: 'hinge',
      validationNotes:
        'Candidate stage 2 from screenshot 2.png. Corner-to-corner hinge. Not video-verified.',
    }),
    step({
      id: 'unfold-ac',
      ordinal: 2,
      title: 'Open the triangle',
      instruction: 'Open the paper back toward a square. The diagonal crease stays.',
      fromSnapshotId: 'triangle-ac',
      toSnapshotId: 'square',
      actionType: 'unfold',
      hinge: {
        id: 'ac-open',
        p0: A,
        p1: C,
        fixedFaces: ['ml-a-o', 'd-ml-o', 'mt-d-o', 'c-mt-o'],
        movingFaces: ['a-mb-o', 'mb-b-o', 'b-mr-o', 'mr-c-o'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-open-ac', faceIds: ['a-mb-o'], polygonUV: uvPoly([A, C, D]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-open-ac', faceIds: ['mt-d-o'], polygonUV: uvBox(0.35, 0.55, 0.55, 0.85), allowedHands: 'either', layer: 0 },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'B', target: B }],
      arrowPathLocal: arc([-0.06, 0.06, 0.002], [0.07, -0.07, 0.002], 0.05),
      creaseLineLocal: [A, C],
      meshStrategy: 'unfold',
      validationNotes:
        'Candidate stage 3 opening. Unfold preserves crease AC as locked. Keyframe 4.png.',
    }),
    step({
      id: 'diag-bd',
      ordinal: 3,
      title: 'Fold the other diagonal',
      instruction: 'Fold corner A to corner C along the opposite dotted diagonal.',
      fromSnapshotId: 'square',
      toSnapshotId: 'triangle-bd',
      actionType: 'fold',
      hinge: {
        id: 'bd',
        p0: B,
        p1: D,
        fixedFaces: ['b-mr-o', 'mr-c-o', 'c-mt-o', 'mt-d-o'],
        movingFaces: ['ml-a-o', 'a-mb-o', 'mb-b-o', 'd-ml-o'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-a', faceIds: ['ml-a-o'], polygonUV: uvPoly([A, B, D]), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-c', faceIds: ['mr-c-o'], polygonUV: uvPoly([B, C, D]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'A', target: C }],
      arrowPathLocal: arc([-0.07, -0.07, 0.002], [0.07, 0.07, 0.002], 0.06),
      creaseLineLocal: [B, D],
      lockCreaseIds: ['bd'],
      meshStrategy: 'hinge',
      validationNotes: 'Candidate stage 3: opposite diagonal. Crease AC remains locked.',
    }),
    step({
      id: 'unfold-bd',
      ordinal: 4,
      title: 'Open to a square',
      instruction: 'Open back into a square. Both diagonal creases stay visible.',
      fromSnapshotId: 'triangle-bd',
      toSnapshotId: 'square',
      actionType: 'unfold',
      hinge: {
        id: 'bd-open',
        p0: B,
        p1: D,
        fixedFaces: ['b-mr-o', 'mr-c-o', 'c-mt-o', 'mt-d-o'],
        movingFaces: ['ml-a-o', 'a-mb-o', 'mb-b-o', 'd-ml-o'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-open-bd', faceIds: ['ml-a-o'], polygonUV: uvPoly([B, C, D]), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'A', target: A }],
      arrowPathLocal: arc([0.06, 0.06, 0.002], [-0.07, -0.07, 0.002], 0.05),
      creaseLineLocal: [B, D],
      meshStrategy: 'unfold',
      validationNotes: 'Candidate stage 4 / screenshot 4.png. Square with both diagonals locked.',
    }),
    step({
      id: 'book-horizontal',
      ordinal: 5,
      title: 'Fold into a rectangle',
      instruction: 'Fold the top edge down to the bottom edge along the dotted midline.',
      fromSnapshotId: 'square',
      toSnapshotId: 'rectangle',
      actionType: 'fold',
      hinge: {
        id: 'y0',
        p0: ML,
        p1: MR,
        fixedFaces: ['a-mb-o', 'mb-b-o', 'b-mr-o', 'ml-a-o'],
        movingFaces: ['mr-c-o', 'c-mt-o', 'mt-d-o', 'd-ml-o'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-top', faceIds: ['c-mt-o'], polygonUV: uvBox(0, 0.5, 1, 1), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-bottom', faceIds: ['mb-b-o'], polygonUV: uvBox(0, 0, 1, 0.5), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'C', target: B },
        { sourceVertexId: 'D', target: A },
      ],
      arrowPathLocal: arc([0, 0.08, 0.002], [0, -0.08, 0.002], 0.055),
      creaseLineLocal: [ML, MR],
      lockCreaseIds: ['y0'],
      meshStrategy: 'hinge',
      validationNotes: 'Candidate stage 5 / screenshot 5.png. Edge-to-edge book fold after precreases.',
    }),
    step({
      id: 'triangle-collapse',
      ordinal: 6,
      title: 'Collapse into a triangle',
      instruction: 'Pinch the packet and collapse it. Several creases move together into a triangle.',
      fromSnapshotId: 'rectangle',
      toSnapshotId: 'triangle-base',
      actionType: 'collapse',
      hinge: {
        id: 'collapse-guide',
        p0: ML,
        p1: MR,
        fixedFaces: ['mr-c-o', 'c-mt-o'],
        movingFaces: ['a-mb-o', 'mb-b-o', 'ml-a-o', 'b-mr-o'],
      },
      coupledHinges: collapseHinges,
      extraCreaseLines: [
        [ML, MB],
        [MR, MB],
      ],
      direction: 'valley',
      movingRegion: {
        id: 'moving-collapse',
        faceIds: ['a-mb-o', 'mb-b-o'],
        polygonUV: uvBox(0, 0, 1, 0.5),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-crease',
        faceIds: ['d-ml-o'],
        polygonUV: uvBox(0, 0.42, 1, 0.58),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'A', target: MB },
        { sourceVertexId: 'B', target: MB },
      ],
      arrowPathLocal: arc([-0.07, -0.09, 0.002], [0, -0.1, 0.002], 0.04),
      creaseLineLocal: [ML, MR],
      lockCreaseIds: ['left-collapse', 'right-collapse'],
      meshStrategy: 'coupled-collapse',
      validationNotes:
        'Candidate stage 6. Multi-crease collapse via pinch-driven snapshot interpolation. Not video-verified; 51s source would lock the order.',
    }),
    step({
      id: 'tail-flaps',
      ordinal: 7,
      title: 'Fold the tail flaps',
      instruction: 'Pinch the highlighted top flap and fold it to form the tail. The other layer stays put.',
      fromSnapshotId: 'triangle-base',
      toSnapshotId: 'fish',
      actionType: 'flap-fold',
      hinge: {
        id: 'tail-left',
        p0: O,
        p1: MB,
        fixedFaces: ['right', 'right-back'],
        movingFaces: ['left', 'left-back'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-left-flap',
        faceIds: ['left'],
        polygonUV: uvPoly([ML, O, MB]),
        allowedHands: 'either',
        layer: 1,
      },
      optionalHoldRegion: {
        id: 'hold-right-flap',
        faceIds: ['right'],
        polygonUV: uvPoly([MR, MB, O]),
        allowedHands: 'either',
        layer: 0,
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'ML', target: TAIL_L }],
      arrowPathLocal: arc([-0.09, 0.01, 0.002], [-0.04, 0.02, 0.002], 0.03),
      creaseLineLocal: [O, ML],
      meshStrategy: 'flap-fold',
      extraCreaseLines: [[O, TAIL_L]],
      validationNotes:
        'Candidate stage 7. Only the highlighted left flap interpolates; the right layer is the hold region and stays put until flatten.',
    }),
    step({
      id: 'flatten-body',
      ordinal: 8,
      title: 'Flatten the fish',
      instruction: 'Pinch and hold to flatten and set the creases, or drag along the arrow.',
      fromSnapshotId: 'fish',
      toSnapshotId: 'fish-flat',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: {
        id: 'flatten',
        p0: ML,
        p1: MR,
        fixedFaces: ['right-body', 'right-back'],
        movingFaces: ['left-body', 'left-back'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-body',
        faceIds: ['left-body', 'right-body'],
        polygonUV: uvPoly([MOUTH, TAIL_L, TAIL_R]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'MR', target: TAIL_R }],
      arrowPathLocal: arc([0, 0.03, 0.01], [0, -0.04, 0.002], 0.02),
      creaseLineLocal: [TAIL_L, TAIL_R],
      meshStrategy: 'crease-press',
      validationNotes:
        'Candidate stage 8. Crease-press via pinch-and-hold (~650ms) or 0–180 flatten. No force sensors. Stage 9 is silhouette validation before swim.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-fish',
};
