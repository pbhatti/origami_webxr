import { landmarkAfterHinge } from '../CreaseSolver.ts';
import { applyHingeSnapshot, deformByHinge } from '../MeshSplitter.ts';
import { PAPER_SIZE_M } from '../placement.ts';
import type { FaceDefinition, FoldStep, HingeDefinition, MeshSnapshot, OrigamiRecipe, Vec2, Vec3 } from '../types.ts';

export const TURTLE_PAPER_COLOR = '#91C943';
export const TURTLE_BACK_COLOR = '#B7DF7A';
export const TURTLE_EDGE_COLOR = '#648C38';
export const TURTLE_SHELL_ALT = '#7EBE45';
export const TURTLE_CREAM = '#F6F1D4';
export const TURTLE_EYE_COLOR = '#1C1A17';
export const TURTLE_EYE_HIGHLIGHT = '#F7F4EA';

const H = PAPER_SIZE_M / 2;

const TL: Vec3 = [-H, H, 0];
const TR: Vec3 = [H, H, 0];
const BR: Vec3 = [H, -H, 0];
const BL: Vec3 = [-H, -H, 0];
const O: Vec3 = [0, 0, 0];

/**
 * Step 4 crease from the reference diagram. The diagonal meets the left
 * sloping edge this far from the lower-left corner toward the apex, and the
 * lower edge this far from that corner toward the right. It stays in the
 * corner: it does not run on to the apex or the right point.
 */
const HEAD_LEG_FRAC = 0.227;
const HEAD_BASE_FRAC = 0.435;

const P_LEG: Vec3 = [
  BL[0] + (O[0] - BL[0]) * HEAD_LEG_FRAC,
  BL[1] + (O[1] - BL[1]) * HEAD_LEG_FRAC,
  0,
];
const P_BASE: Vec3 = [BL[0] + (BR[0] - BL[0]) * HEAD_BASE_FRAC, BL[1], 0];

export const TURTLE_STEPS = [
  'diagonal-creases',
  'upper-right-corner',
  'shell-shape',
  'head-tip',
  'turtle-decoration',
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

const SQUARE_FACES: FaceDefinition[] = [
  { id: 'north', vertices: [0, 1, 4], layer: 0, materialId: 'front' },
  { id: 'east', vertices: [1, 2, 4], layer: 0, materialId: 'front' },
  { id: 'south', vertices: [2, 3, 4], layer: 0, materialId: 'front' },
  { id: 'west', vertices: [3, 0, 4], layer: 0, materialId: 'front' },
];

const REST = { TL, TR, BR, BL, O };
const square: MeshSnapshot = {
  vertices: [TL, TR, BR, BL, O],
  faces: SQUARE_FACES,
  named: REST,
  outline: [TL, TR, BR, BL],
};

const HINGE_DIAG_A: HingeDefinition = faceViewer(
  {
    id: 'turtle-diag-a',
    p0: TL,
    p1: BR,
    fixedFaces: ['south', 'west'],
    movingFaces: ['north', 'east'],
  },
  TR,
);

const HINGE_DIAG_B: HingeDefinition = faceViewer(
  {
    id: 'turtle-diag-b',
    p0: TR,
    p1: BL,
    fixedFaces: ['east', 'south'],
    movingFaces: ['north', 'west'],
  },
  TL,
);

const HINGE_SHELL: HingeDefinition = faceViewer(
  {
    id: 'turtle-shell',
    p0: BL,
    p1: O,
    fixedFaces: ['south', 'east'],
    movingFaces: ['west', 'north'],
    layerMode: 'packet',
  },
  TL,
);

const HINGE_HEAD: HingeDefinition = faceViewer(
  {
    id: 'turtle-head',
    p0: P_LEG,
    p1: P_BASE,
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    layerMode: 'packet',
    // Only the corner beside this short segment. The half-plane beyond it stays put.
    reachM: 0.045,
  },
  BL,
);

const diagA = {
  ...applyHingeSnapshot(square, HINGE_DIAG_A, 'valley', 180, TR),
  outline: [TL, BL, BR],
};
const TR_DOWN = landmarkAfterHinge(TR, HINGE_DIAG_A, 180, 'valley');
diagA.named = { ...REST, TR: TR_DOWN };

const diagB = {
  ...applyHingeSnapshot(square, HINGE_DIAG_B, 'valley', 180, TL),
  outline: [TR, BR, BL],
};
const TL_DOWN = landmarkAfterHinge(TL, HINGE_DIAG_B, 180, 'valley');
diagB.named = { ...REST, TL: TL_DOWN };

const flap = {
  ...applyHingeSnapshot(square, HINGE_DIAG_A, 'valley', 180, TR),
  outline: [TL, BL, BR],
};
flap.named = { ...REST, TR: TR_DOWN };

const shell = {
  ...foldStacked(flap, HINGE_SHELL, TL),
  outline: [O, BR, BL],
};
const TL_SHELL = landmarkAfterHinge(TL, HINGE_SHELL, 180, 'valley');
shell.named = { ...flap.named, TL: TL_SHELL };

const BL_UP = landmarkAfterHinge(BL, HINGE_HEAD, 180, 'valley');

function segmentCross(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const den = abx * cdy - aby * cdx || 1;
  const t = ((c[0] - a[0]) * cdy - (c[1] - a[1]) * cdx) / den;
  return [a[0] + abx * t, a[1] + aby * t, 0];
}

/** Where the folded flap crosses the shell's left edge. The tip sits outside that edge. */
const HEAD_EDGE = segmentCross(BL_UP, P_BASE, O, BL);
const HEAD_MID: Vec3 = [
  (BL_UP[0] + P_LEG[0] + HEAD_EDGE[0]) / 3,
  (BL_UP[1] + P_LEG[1] + HEAD_EDGE[1]) / 3,
  0,
];

/**
 * Outer boundary of the folded sheet. The corner triangle is gone, so the
 * crease is an edge, and the head is the part of the flap past the left slope.
 * Joining the tip straight to the crease endpoint crosses that slope.
 */
const TURTLE_OUTLINE: Vec3[] = [O, BR, P_BASE, P_LEG, BL_UP, HEAD_EDGE];

const headed = {
  ...foldStacked(shell, HINGE_HEAD, BL),
  outline: TURTLE_OUTLINE,
};
headed.named = { ...shell.named, BL: BL_UP };

const turtle = { ...headed, outline: TURTLE_OUTLINE };

export const TURTLE_HEAD_TIP = BL_UP;
export const TURTLE_FEATURE_Z = 0.012;
/** On the protruding head, toward the tip, where the reference places the eye. */
export const TURTLE_EYE: Vec3 = [
  HEAD_MID[0] + (BL_UP[0] - HEAD_MID[0]) * 0.62,
  HEAD_MID[1] + (BL_UP[1] - HEAD_MID[1]) * 0.62,
  TURTLE_FEATURE_Z,
];
export const TURTLE_SHELL: Vec3[] = [O, BR, P_BASE, P_LEG];
export const TURTLE_PINCH_AT: Vec3 = [0.01, -0.055, 0.012];
export const TURTLE_NAMED = REST;

const DIAG_A_LINE: [Vec3, Vec3] = [HINGE_DIAG_A.p0, HINGE_DIAG_A.p1];
const DIAG_B_LINE: [Vec3, Vec3] = [HINGE_DIAG_B.p0, HINGE_DIAG_B.p1];

export const TURTLE_RECIPE: OrigamiRecipe = {
  id: 'origami-turtle',
  name: 'Origami turtle',
  sheetSizeM: PAPER_SIZE_M,
  creases: [
    { id: 'turtle-diag-a', p0: HINGE_DIAG_A.p0, p1: HINGE_DIAG_A.p1, direction: 'valley' },
    { id: 'turtle-diag-b', p0: HINGE_DIAG_B.p0, p1: HINGE_DIAG_B.p1, direction: 'valley' },
    { id: 'turtle-shell', p0: HINGE_SHELL.p0, p1: HINGE_SHELL.p1, direction: 'valley' },
    { id: 'turtle-head', p0: HINGE_HEAD.p0, p1: HINGE_HEAD.p1, direction: 'valley' },
  ],
  snapshots: {
    square,
    'diag-a': diagA,
    'diag-b': diagB,
    flap,
    shell,
    headed,
    turtle,
  },
  finalSilhouette: TURTLE_OUTLINE,
  silhouetteToleranceM: 0.04,
  steps: [
    step({
      id: 'turtle-diag-a-fold',
      ordinal: 1,
      progressStage: 1,
      title: 'Create the diagonal creases',
      instruction: 'Fold along both diagonals, then unfold.',
      fromSnapshotId: 'square',
      toSnapshotId: 'diag-a',
      actionType: 'fold',
      hinge: HINGE_DIAG_A,
      direction: 'valley',
      movingRegion: {
        id: 'moving-upper-right',
        faceIds: ['north', 'east'],
        polygonUV: uvPoly([TL, TR, BR]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-lower-left',
        faceIds: ['south', 'west'],
        polygonUV: uvPoly([TL, BL, BR]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: BL }],
      arrowPathLocal: arc([TR[0] - 0.02, TR[1] - 0.02, 0.004], [BL[0] + 0.03, BL[1] + 0.03, 0.004], 0.05),
      extraCreaseLines: [DIAG_B_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1a. First diagonal. The other diagonal stays as a guide.',
    }),
    step({
      id: 'turtle-diag-a-open',
      ordinal: 2,
      progressStage: 1,
      title: 'Create the diagonal creases',
      instruction: 'The paper opens. The first diagonal stays as a guide.',
      fromSnapshotId: 'diag-a',
      toSnapshotId: 'square',
      actionType: 'unfold',
      hinge: { ...HINGE_DIAG_A, id: 'turtle-diag-a-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-a',
        faceIds: ['north', 'east'],
        polygonUV: uvPoly([TL, BL, BR]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: TR }],
      arrowPathLocal: arc([BL[0] + 0.03, BL[1] + 0.04, 0.004], [TR[0] - 0.03, TR[1] - 0.03, 0.004], 0.045),
      extraCreaseLines: [DIAG_B_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. The square returns.',
    }),
    step({
      id: 'turtle-diag-b-fold',
      ordinal: 3,
      progressStage: 1,
      title: 'Create the diagonal creases',
      instruction: 'Fold along the other diagonal.',
      fromSnapshotId: 'square',
      toSnapshotId: 'diag-b',
      actionType: 'fold',
      hinge: HINGE_DIAG_B,
      direction: 'valley',
      movingRegion: {
        id: 'moving-upper-left',
        faceIds: ['north', 'west'],
        polygonUV: uvPoly([TR, TL, BL]),
        allowedHands: 'either',
      },
      optionalHoldRegion: {
        id: 'hold-lower-right',
        faceIds: ['east', 'south'],
        polygonUV: uvPoly([TR, BR, BL]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TL', target: BR }],
      arrowPathLocal: arc([TL[0] + 0.02, TL[1] - 0.02, 0.004], [BR[0] - 0.03, BR[1] + 0.03, 0.004], 0.05),
      extraCreaseLines: [DIAG_A_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 1b. Second diagonal.',
    }),
    step({
      id: 'turtle-diag-b-open',
      ordinal: 4,
      progressStage: 1,
      title: 'Create the diagonal creases',
      instruction: 'The paper opens into a square. Both diagonals are creased.',
      fromSnapshotId: 'diag-b',
      toSnapshotId: 'square',
      actionType: 'unfold',
      hinge: { ...HINGE_DIAG_B, id: 'turtle-diag-b-open' },
      direction: 'valley',
      movingRegion: {
        id: 'moving-reopen-b',
        faceIds: ['north', 'west'],
        polygonUV: uvPoly([TR, BR, BL]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TL', target: TL }],
      arrowPathLocal: arc([BR[0] - 0.03, BR[1] + 0.04, 0.004], [TL[0] + 0.03, TL[1] - 0.03, 0.004], 0.045),
      extraCreaseLines: [DIAG_A_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Automatic reopen. Flat square with both diagonal guides.',
    }),
    step({
      id: 'turtle-corner',
      ordinal: 5,
      progressStage: 2,
      title: 'Fold the upper-right corner',
      instruction: 'Fold the upper-right corner inward.',
      fromSnapshotId: 'square',
      toSnapshotId: 'flap',
      actionType: 'fold',
      hinge: HINGE_DIAG_A,
      direction: 'valley',
      movingRegion: {
        id: 'moving-corner',
        faceIds: ['north', 'east'],
        polygonUV: uvPoly([TL, TR, BR]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TR', target: BL }],
      arrowPathLocal: arc([TR[0] - 0.025, TR[1] - 0.03, 0.004], [BL[0] + 0.035, BL[1] + 0.035, 0.004], 0.05),
      extraCreaseLines: [DIAG_B_LINE],
      meshStrategy: 'hinge',
      validationNotes: 'Step 2. Upper-right corner folds across the diagonal onto the lower-left triangle.',
    }),
    step({
      id: 'turtle-shell',
      ordinal: 6,
      progressStage: 3,
      title: 'Shape the shell',
      instruction: 'Fold the opposite corner inward to shape the shell.',
      fromSnapshotId: 'flap',
      toSnapshotId: 'shell',
      actionType: 'fold',
      hinge: HINGE_SHELL,
      direction: 'valley',
      movingRegion: {
        id: 'moving-shell-corner',
        faceIds: ['west', 'north'],
        polygonUV: uvPoly([TL, BL, O]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'TL', target: TL_SHELL }],
      arrowPathLocal: arc([TL[0] + 0.02, TL[1] - 0.03, 0.004], [BR[0] - 0.04, BR[1] + 0.03, 0.004], 0.04),
      meshStrategy: 'hinge',
      validationNotes: 'Step 3. The top corner folds down. The body becomes a compact upward triangle.',
    }),
    step({
      id: 'turtle-head',
      ordinal: 7,
      progressStage: 4,
      title: 'Shape the head',
      instruction: 'Fold the small tip upward to form the head.',
      fromSnapshotId: 'shell',
      toSnapshotId: 'headed',
      actionType: 'fold',
      hinge: HINGE_HEAD,
      direction: 'valley',
      movingRegion: {
        id: 'moving-head-tip',
        faceIds: ['north', 'east', 'south', 'west'],
        polygonUV: uvPoly([P_LEG, BL, P_BASE]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'BL', target: BL_UP }],
      arrowPathLocal: arc([BL[0] - 0.008, BL[1] + 0.002, 0.008], [BL_UP[0] - 0.004, BL_UP[1] + 0.01, 0.016], 0.024),
      meshStrategy: 'hinge',
      validationNotes: 'Step 4. The lower-left corner folds up around a short diagonal. The tip becomes the head.',
    }),
    step({
      id: 'turtle-decorate',
      ordinal: 8,
      progressStage: 5,
      title: 'Bring your turtle to life',
      instruction: 'Pinch to bring your turtle to life!',
      fromSnapshotId: 'headed',
      toSnapshotId: 'turtle',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_HEAD, id: 'turtle-decorate', movingFaces: [], fixedFaces: ['north', 'east', 'south', 'west'] },
      direction: 'valley',
      movingRegion: {
        id: 'moving-turtle-body',
        faceIds: ['north', 'east', 'south', 'west'],
        polygonUV: uvPoly([O, BR, P_BASE, P_LEG]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [],
      arrowPathLocal: arc([-0.02, TURTLE_PINCH_AT[1], 0.01], [0.02, TURTLE_PINCH_AT[1], 0.01], 0.012),
      meshStrategy: 'crease-press',
      validationNotes: 'Step 5. One pinch reveals the eye and the shell markings, then the success state.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-turtle',
};

