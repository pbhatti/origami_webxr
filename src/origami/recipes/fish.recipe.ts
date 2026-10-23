import { PAPER_SIZE_M } from '../placement.ts';
import type { FoldStep, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

const H = PAPER_SIZE_M / 2;
const Q = H / 2;
const HD = H / Math.SQRT2;
const LAYER = 0.00065;

const A: Vec3 = [-H, -H, 0];
const B: Vec3 = [H, -H, 0];
const C: Vec3 = [H, H, 0];
const D: Vec3 = [-H, H, 0];
const M0: Vec3 = [0, -H, 0];
const M1: Vec3 = [0, H, 0];
const L0: Vec3 = [-H, 0, 0];
const O: Vec3 = [0, 0, 0];

const sqSW: Vec3 = [-H, 0, 0];
const sqSE: Vec3 = [0, 0, 0];
const sqNE: Vec3 = [0, H, 0];
const sqNW: Vec3 = [-H, H, 0];
const sqC: Vec3 = [-Q, Q, 0];

const diaL: Vec3 = [-Q - HD, Q, 0];
const diaR: Vec3 = [-Q + HD, Q, 0];
const diaT: Vec3 = [-Q, Q + HD, 0];
const diaB: Vec3 = [-Q, Q - HD, 0];

const INSET = 0.35;
const creaseB: Vec3 = [-Q, diaB[1] + INSET * (Q - diaB[1]), 0.002];
const creaseT: Vec3 = [-Q, diaT[1] - INSET * (diaT[1] - Q), 0.002];
const foldedB: Vec3 = [-Q, 2 * creaseB[1] - diaB[1], LAYER];
const foldedT: Vec3 = [-Q, 2 * creaseT[1] - diaT[1], LAYER];

const tailX = diaR[0] - 0.028;
const tailFork = 0.022;
const fishMouth = diaL;
const fishBodyT: Vec3 = [foldedT[0], foldedT[1], 0];
const fishBodyB: Vec3 = [foldedB[0], foldedB[1], 0];
const fishTailC: Vec3 = [tailX, Q, 0];
const fishTailU: Vec3 = [diaR[0] + 0.01, Q + tailFork, 0];
const fishTailD: Vec3 = [diaR[0] + 0.01, Q - tailFork, 0];

function z(p: Vec3, layer: number): Vec3 {
  return [p[0], p[1], layer * LAYER];
}

function uvBox(u0: number, v0: number, u1: number, v1: number): Vec2[] {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}

function uvOf(point: Vec3): Vec2 {
  return [point[0] / PAPER_SIZE_M + 0.5, point[1] / PAPER_SIZE_M + 0.5];
}

function uvPoly(points: Vec3[]): Vec2[] {
  return points.map(uvOf);
}

function arc(from: Vec3, to: Vec3, bulge: number): Vec3[] {
  return [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, bulge], to];
}

function snap(
  vertices: Vec3[],
  faces: MeshSnapshot['faces'],
  named?: Record<string, Vec3>,
): MeshSnapshot {
  return { vertices, faces, named };
}

function step(input: Omit<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM'> & Partial<Pick<FoldStep, 'angleToleranceDeg' | 'targetPointToleranceM'>>): FoldStep {
  return {
    angleToleranceDeg: 12,
    targetPointToleranceM: 0.018,
    ...input,
    creaseLineLocal: [input.hinge.p0, input.hinge.p1],
  };
}

const square = snap(
  [A, B, C, D],
  [
    { id: 'left', vertices: [0, 3, 2, 1], layer: 0, materialId: 'front' },
    { id: 'right', vertices: [1, 2, 3, 0], layer: 0, materialId: 'front' },
  ],
  { A, B, C, D },
);

const rectangle = snap(
  [A, M0, O, L0, D, M1, z(A, 1), z(M0, 1), z(O, 1), z(L0, 1), z(D, 1), z(M1, 1)],
  [
    { id: 'front-bottom', vertices: [0, 1, 2, 3], layer: 0, materialId: 'front' },
    { id: 'front-top', vertices: [3, 2, 5, 4], layer: 0, materialId: 'front' },
    { id: 'folded-bottom', vertices: [6, 7, 8, 9], layer: 1, materialId: 'front' },
    { id: 'folded-top', vertices: [9, 8, 11, 10], layer: 1, materialId: 'front' },
  ],
  { A, D, M0, M1, L0, O, B: z(A, 1), C: z(D, 1) },
);

const smallSquare = snap(
  [sqSW, sqSE, sqNE, sqNW, z(sqSW, 1), z(sqSE, 1), z(sqNE, 1), z(sqNW, 1)],
  [
    { id: 'back', vertices: [0, 1, 2, 3], layer: 0, materialId: 'front' },
    { id: 'front', vertices: [4, 5, 6, 7], layer: 1, materialId: 'front' },
  ],
  { sqSW, sqSE, sqNE, sqNW },
);

const triangle = snap(
  [diaL, sqSE, sqNE, diaL, z(diaL, 1), z(sqSE, 1), z(sqNE, 1), z(diaL, 1)],
  [
    { id: 'back', vertices: [0, 1, 2], layer: 0, materialId: 'front' },
    { id: 'front', vertices: [4, 5, 6], layer: 1, materialId: 'front' },
  ],
  { sqSW: diaL, sqSE, sqNE, sqNW: diaL, diaL },
);

const flipped = snap(
  [diaL, sqC, sqNE, sqSE, z(diaL, 1), z(sqC, 1), z(sqNE, 1), z(sqSE, 1)],
  [
    { id: 'upper', vertices: [0, 2, 1], layer: 0, materialId: 'front' },
    { id: 'lower', vertices: [0, 1, 3], layer: 0, materialId: 'front' },
    { id: 'upper-back', vertices: [4, 6, 5], layer: 1, materialId: 'front' },
    { id: 'lower-back', vertices: [4, 5, 7], layer: 1, materialId: 'front' },
  ],
  { diaL, sqC, sqNE, sqSE, sqSW: diaL, sqNW: diaL },
);

const diamond = snap(
  [diaL, diaR, diaT, diaB, z(diaL, 1), z(diaR, 1), z(diaT, 1), z(diaB, 1)],
  [
    { id: 'upper', vertices: [0, 2, 1], layer: 0, materialId: 'front' },
    { id: 'lower', vertices: [0, 1, 3], layer: 0, materialId: 'front' },
    { id: 'upper-back', vertices: [4, 6, 5], layer: 1, materialId: 'front' },
    { id: 'lower-back', vertices: [4, 5, 7], layer: 1, materialId: 'front' },
  ],
  { diaL, diaR, diaT, diaB, sqC: diaR, sqNE: diaT, sqSE: diaB },
);

const bodyLower = snap(
  [diaL, diaR, diaT, foldedB, z(diaL, 1), z(diaR, 1), z(diaT, 1), z(foldedB, 1)],
  [
    { id: 'upper', vertices: [0, 2, 1], layer: 0, materialId: 'front' },
    { id: 'lower', vertices: [0, 1, 3], layer: 1, materialId: 'front' },
  ],
  { diaL, diaR, diaT, diaB: foldedB },
);

const bodySlim = snap(
  [diaL, diaR, foldedT, foldedB, diaR, diaR, z(diaL, 1), z(diaR, 1)],
  [
    { id: 'upper', vertices: [0, 2, 1], layer: 1, materialId: 'front' },
    { id: 'lower', vertices: [0, 1, 3], layer: 1, materialId: 'front' },
    { id: 'tail-up', vertices: [1, 4, 2], layer: 1, materialId: 'front' },
    { id: 'tail-down', vertices: [1, 3, 5], layer: 1, materialId: 'front' },
  ],
  { diaL, diaR, diaT: foldedT, diaB: foldedB },
);

const fish = snap(
  [fishMouth, fishTailC, fishBodyT, fishBodyB, fishTailU, fishTailD, z(fishMouth, 1), z(fishTailC, 1)],
  [
    { id: 'body', vertices: [0, 2, 1, 3], layer: 0, materialId: 'front' },
    { id: 'tail-up', vertices: [1, 4, 2], layer: 1, materialId: 'front' },
    { id: 'tail-down', vertices: [1, 3, 5], layer: 1, materialId: 'front' },
  ],
  { diaL: fishMouth, diaR: fishTailC, diaT: fishBodyT, diaB: fishBodyB },
);

export const FISH_NAMED = { A, B, C, D };

export const FISH_RECIPE: OrigamiRecipe = {
  id: 'seda-fish',
  name: 'Origami fish (Seda diagram)',
  sheetSizeM: PAPER_SIZE_M,
  snapshots: {
    square,
    rectangle,
    'small-square': smallSquare,
    triangle,
    flipped,
    diamond,
    'body-lower': bodyLower,
    'body-slim': bodySlim,
    fish,
  },
  steps: [
    step({
      id: 'book-fold',
      ordinal: 1,
      title: 'Fold in half',
      instruction: 'Fold the right edge to the left edge along the dotted line.',
      fromSnapshotId: 'square',
      toSnapshotId: 'rectangle',
      hinge: {
        id: 'center-vertical',
        p0: [0, -H, 0],
        p1: [0, H, 0],
        fixedFaces: ['left'],
        movingFaces: ['right'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-right', faceIds: ['right'], polygonUV: uvBox(0.5, 0, 1, 1), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-left', faceIds: ['left'], polygonUV: uvBox(0, 0, 0.5, 1), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'B', target: [-H, -H, 0] },
        { sourceVertexId: 'C', target: [-H, H, 0] },
      ],
      arrowPathLocal: arc([0.08, 0, 0.002], [-0.08, 0, 0.002], 0.07),
      creaseLineLocal: [
        [0, -H, 0.002],
        [0, H, 0.002],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Diagram ②: book fold. Valley right half onto left about x=0.',
    }),
    step({
      id: 'packet-square',
      ordinal: 2,
      title: 'Fold into a square',
      instruction: 'Fold the bottom short edge up to the top short edge.',
      fromSnapshotId: 'rectangle',
      toSnapshotId: 'small-square',
      hinge: {
        id: 'center-horizontal',
        p0: [-H, 0, 0],
        p1: [0, 0, 0],
        fixedFaces: ['front-top', 'folded-top'],
        movingFaces: ['front-bottom', 'folded-bottom'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-bottom', faceIds: ['front-bottom'], polygonUV: uvBox(0, 0, 0.5, 0.5), allowedHands: 'either' },
      optionalHoldRegion: { id: 'hold-top', faceIds: ['front-top'], polygonUV: uvBox(0, 0.5, 0.5, 1), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'A', target: [-H, H, 0] },
        { sourceVertexId: 'M0', target: [0, H, 0] },
      ],
      arrowPathLocal: arc([-0.05, -0.08, 0.002], [-0.05, 0.08, 0.002], 0.055),
      creaseLineLocal: [
        [-H, 0, 0.002],
        [0, 0, 0.002],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Diagram ③–④: fold the rectangle’s short edges together into a 10 cm packet.',
    }),
    step({
      id: 'squash-front',
      ordinal: 3,
      title: 'Open and squash',
      instruction: 'Pinch the square and squash it into a triangle. Drag toward the ghost until it snaps.',
      fromSnapshotId: 'small-square',
      toSnapshotId: 'triangle',
      hinge: {
        id: 'square-right',
        p0: [0, 0, 0],
        p1: [0, H, 0],
        fixedFaces: ['back'],
        movingFaces: ['front'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-packet',
        faceIds: ['front'],
        polygonUV: uvPoly([
          [-H - 0.03, -0.02, 0],
          [0.02, -0.02, 0],
          [0.02, H + 0.02, 0],
          [-H - 0.03, H + 0.02, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'sqNW', target: diaL },
        { sourceVertexId: 'sqSW', target: diaL },
      ],
      arrowPathLocal: arc([-0.03, 0.05, 0.002], [-0.11, 0.05, 0.002], 0.05),
      creaseLineLocal: [
        [0, 0, 0.002],
        [0, H, 0.002],
      ],
      meshStrategy: 'authored-interpolation',
      validationNotes: 'Diagram ⑤–⑥: squash fold. Hand angle drives interpolation to the triangle.',
    }),
    step({
      id: 'flip-packet',
      ordinal: 4,
      title: 'Turn the paper over',
      instruction: 'Turn the triangle over. Pinch it and drag along the arrow until it flips.',
      fromSnapshotId: 'triangle',
      toSnapshotId: 'flipped',
      hinge: {
        id: 'flip-x',
        p0: [-H, Q, 0],
        p1: [0, Q, 0],
        fixedFaces: ['back'],
        movingFaces: ['front'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-flip',
        faceIds: ['front'],
        polygonUV: uvPoly([
          [diaL[0] - 0.02, Q - 0.06, 0],
          [0.03, -0.02, 0],
          [0.03, H + 0.02, 0],
          [diaL[0] - 0.02, Q + 0.06, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.05, 0.02, 0.002], [-0.05, 0.08, 0.05], 0.04),
      creaseLineLocal: [
        [-H, Q, 0.002],
        [0, Q, 0.002],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Diagram ⑦: turn over. Angle-only; layers swap.',
    }),
    step({
      id: 'squash-back',
      ordinal: 5,
      title: 'Squash the other square',
      instruction: 'Open the remaining square and squash it into a triangle.',
      fromSnapshotId: 'flipped',
      toSnapshotId: 'diamond',
      hinge: {
        id: 'square-right-b',
        p0: [0, 0, 0],
        p1: [0, H, 0],
        fixedFaces: ['upper-back', 'lower-back'],
        movingFaces: ['upper', 'lower'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-packet-b',
        faceIds: ['upper', 'lower'],
        polygonUV: uvPoly([
          [diaL[0] - 0.02, 0, 0],
          [0.04, 0, 0],
          [0.04, H + 0.04, 0],
          [diaL[0] - 0.02, H + 0.04, 0],
        ]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [
        { sourceVertexId: 'sqC', target: diaR },
        { sourceVertexId: 'sqSE', target: diaB },
        { sourceVertexId: 'sqNE', target: diaT },
      ],
      arrowPathLocal: arc([-0.03, 0.05, 0.002], [0.02, 0.05, 0.002], 0.05),
      creaseLineLocal: [
        [0, 0, 0.002],
        [0, H, 0.002],
      ],
      meshStrategy: 'authored-interpolation',
      validationNotes: 'Diagram ⑧–⑨: second squash. Packet becomes a diamond / kite.',
    }),
    step({
      id: 'tuck-bottom',
      ordinal: 6,
      title: 'Fold the lower edge in',
      instruction: 'Fold the marked lower edge up toward the center line.',
      fromSnapshotId: 'diamond',
      toSnapshotId: 'body-lower',
      hinge: {
        id: 'lower-inset',
        p0: [diaL[0], creaseB[1], 0],
        p1: [diaR[0], creaseB[1], 0],
        fixedFaces: ['upper'],
        movingFaces: ['lower'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-lower', faceIds: ['lower'], polygonUV: uvBox(0.15, 0.35, 0.6, 0.55), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'diaB', target: foldedB }],
      arrowPathLocal: arc([-0.05, -0.01, 0.002], [-0.05, 0.04, 0.002], 0.04),
      creaseLineLocal: [
        [diaL[0], creaseB[1], 0.002],
        [diaR[0], creaseB[1], 0.002],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Diagram ⑩: fold the lower side of the kite inward.',
    }),
    step({
      id: 'tuck-top',
      ordinal: 7,
      title: 'Fold the upper edge in',
      instruction: 'Fold the marked upper edge down toward the center line.',
      fromSnapshotId: 'body-lower',
      toSnapshotId: 'body-slim',
      hinge: {
        id: 'upper-inset',
        p0: [diaL[0], creaseT[1], 0],
        p1: [diaR[0], creaseT[1], 0],
        fixedFaces: ['lower'],
        movingFaces: ['upper'],
      },
      direction: 'valley',
      movingRegion: { id: 'moving-upper', faceIds: ['upper'], polygonUV: uvBox(0.15, 0.55, 0.6, 0.75), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'diaT', target: foldedT }],
      arrowPathLocal: arc([-0.05, 0.11, 0.002], [-0.05, 0.06, 0.002], 0.04),
      creaseLineLocal: [
        [diaL[0], creaseT[1], 0.002],
        [diaR[0], creaseT[1], 0.002],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Diagram ⑪: fold the upper side of the kite inward.',
    }),
    step({
      id: 'tail-back',
      ordinal: 8,
      title: 'Fold the tail back',
      instruction: 'Fold the short tail flaps back, then the fish is ready.',
      fromSnapshotId: 'body-slim',
      toSnapshotId: 'fish',
      hinge: {
        id: 'tail',
        p0: [tailX, foldedB[1], 0],
        p1: [tailX, foldedT[1], 0],
        fixedFaces: ['upper', 'lower'],
        movingFaces: ['tail-up', 'tail-down'],
      },
      direction: 'mountain',
      movingRegion: { id: 'moving-tail', faceIds: ['upper'], polygonUV: uvBox(0.48, 0.42, 0.72, 0.62), allowedHands: 'either' },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([0.02, 0.05, 0.002], [-0.02, 0.05, 0.03], 0.035),
      creaseLineLocal: [
        [tailX, foldedB[1], 0.002],
        [tailX, foldedT[1], 0.002],
      ],
      meshStrategy: 'authored-interpolation',
      validationNotes: 'Diagram ⑬–⑭: reverse the short tail layers. Final snapshot is the fish silhouette.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-fish',
};
