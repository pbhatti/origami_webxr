import { PAPER_SIZE_M } from '../placement.ts';
import type { OrigamiRecipe, Vec3 } from '../types.ts';

const half = PAPER_SIZE_M / 2;

export const FIXTURE_VERTICES = {
  A: [-half, -half, 0] as Vec3,
  B: [half, -half, 0] as Vec3,
  C: [half, half, 0] as Vec3,
  D: [-half, half, 0] as Vec3,
};

export const HALF_FOLD_RECIPE: OrigamiRecipe = {
  id: 'fixture-half-fold',
  name: 'Square to rectangle',
  sheetSizeM: PAPER_SIZE_M,
  snapshots: {
    square: {
      vertices: [FIXTURE_VERTICES.A, FIXTURE_VERTICES.B, FIXTURE_VERTICES.C, FIXTURE_VERTICES.D],
      faces: [
        { id: 'left', vertices: [0, 3, 2, 1], layer: 0, materialId: 'front' },
        { id: 'right', vertices: [1, 2, 3, 0], layer: 0, materialId: 'front' },
      ],
    },
    rectangle: {
      vertices: [
        [-half, -half, 0],
        [0, -half, 0],
        [0, half, 0],
        [-half, half, 0],
      ],
      faces: [
        { id: 'left', vertices: [0, 3, 2, 1], layer: 0, materialId: 'front' },
        { id: 'right', vertices: [0, 3, 2, 1], layer: 1, materialId: 'front' },
      ],
    },
  },
  steps: [
    {
      id: 'half-fold',
      ordinal: 1,
      title: 'Fold in half',
      instruction: 'Pinch this corner and fold along the dotted line.',
      fromSnapshotId: 'square',
      toSnapshotId: 'rectangle',
      hinge: {
        id: 'center-vertical',
        p0: [0, -half, 0],
        p1: [0, half, 0],
        fixedFaces: ['left'],
        movingFaces: ['right'],
      },
      direction: 'valley',
      movingRegion: {
        id: 'moving-right-half',
        faceIds: ['right'],
        polygonUV: [
          [0.5, 0],
          [1, 0],
          [1, 1],
          [0.5, 1],
        ],
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-left-half',
        faceIds: ['left'],
        polygonUV: [
          [0, 0],
          [0.5, 0],
          [0.5, 1],
          [0, 1],
        ],
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      angleToleranceDeg: 12,
      targetPointToleranceM: 0.018,
      targetLandmarks: [
        { sourceVertexId: 'B', target: [-half, -half, 0] },
        { sourceVertexId: 'C', target: [-half, half, 0] },
      ],
      arrowPathLocal: [
        [0.08, 0, 0.002],
        [0.055, 0, 0.045],
        [0, 0, 0.07],
        [-0.05, 0, 0.04],
        [-0.08, 0, 0.002],
      ],
      creaseLineLocal: [
        [0, -half, 0],
        [0, half, 0],
      ],
      meshStrategy: 'hinge',
      validationNotes: 'Engineering fixture: right half rotates 180° about x=0 onto the left half.',
    },
  ],
  finalCreatureAsset: 'procedural-paper-fish',
};
