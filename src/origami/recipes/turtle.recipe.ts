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

/** How far the lower-left tip travels when it becomes the head. */
const TIP = 0.034;

const LEG = Math.hypot(H, H);
const TIP_T = TIP / LEG;
const P_LEG: Vec3 = [BL[0] + (O[0] - BL[0]) * TIP_T, BL[1] + (O[1] - BL[1]) * TIP_T, 0];
const P_BASE: Vec3 = [BL[0] + TIP, BL[1], 0];

export const TURTLE_STEPS = [
  'diagonal-creases',
  'upper-right-corner',
  'shell-shape',
  'head-tip',
  'head-neck',
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

const headed = {
  ...foldStacked(shell, HINGE_HEAD, BL),
  outline: [O, BR, P_BASE, P_LEG],
};
const BL_UP = landmarkAfterHinge(BL, HINGE_HEAD, 180, 'valley');
headed.named = { ...shell.named, BL: BL_UP };

/**
 * The raised tip sits on top of the shell. A short crease just inside the
 * shell's left edge swings that flap out to the left. Only the raised layers
 * travel, so the shell underneath stays where it is.
 */
const NECK_X = P_LEG[0] + 0.0022;

function crossVertical(a: Vec3, b: Vec3, x: number): Vec3 | null {
  const dx = b[0] - a[0];
  if (Math.abs(dx) < 1e-6) {
    return null;
  }
  const t = (x - a[0]) / dx;
  if (t < -0.02 || t > 1.02) {
    return null;
  }
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0];
}

const NECK_HITS = [crossVertical(P_LEG, P_BASE, NECK_X), crossVertical(P_BASE, BL_UP, NECK_X), crossVertical(BL_UP, P_LEG, NECK_X)].filter(
  (point): point is Vec3 => point != null,
);
const NECK_A: Vec3 = NECK_HITS[0] ?? P_LEG;
const NECK_B: Vec3 = NECK_HITS[1] ?? P_BASE;
const NECK_CENTER: Vec3 = [(NECK_A[0] + NECK_B[0]) / 2, (NECK_A[1] + NECK_B[1]) / 2, 0];

const HINGE_NECK: HingeDefinition = faceViewer(
  {
    id: 'turtle-neck',
    p0: NECK_A,
    p1: NECK_B,
    fixedFaces: [],
    movingFaces: ['north', 'east', 'south', 'west'],
    minMovingLayer: 4,
  },
  BL_UP,
);

const BL_OUT = landmarkAfterHinge(BL_UP, HINGE_NECK, 180, 'valley');
const neck = {
  ...foldStacked(headed, HINGE_NECK, BL_UP),
  outline: [O, BR, P_BASE, BL_OUT, P_LEG],
};
neck.named = { ...headed.named, BL: BL_OUT };

const turtle = { ...neck, outline: neck.outline };

export const TURTLE_HEAD_TIP = BL_OUT;
export const TURTLE_FEATURE_Z = 0.012;
export const TURTLE_EYE: Vec3 = [
  BL_OUT[0] + (NECK_CENTER[0] - BL_OUT[0]) * 0.42,
  BL_OUT[1] + (NECK_CENTER[1] - BL_OUT[1]) * 0.42,
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
    { id: 'turtle-neck', p0: HINGE_NECK.p0, p1: HINGE_NECK.p1, direction: 'valley' },
  ],
  snapshots: {
    square,
    'diag-a': diagA,
    'diag-b': diagB,
    flap,
    shell,
    headed,
    neck,
    turtle,
  },
  finalSilhouette: [O, BR, P_BASE, BL_OUT, P_LEG],
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
        faceIds: ['south', 'west'],
        polygonUV: uvPoly([P_LEG, BL, P_BASE]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'BL', target: BL_UP }],
      arrowPathLocal: arc([BL[0] + 0.01, BL[1] + 0.008, 0.004], [BL_UP[0], BL_UP[1] - 0.006, 0.004], 0.02),
      meshStrategy: 'hinge',
      validationNotes: 'Step 4. The lower-left tip folds up around a short crease.',
    }),
    step({
      id: 'turtle-neck',
      ordinal: 8,
      progressStage: 5,
      title: 'Finish the head',
      instruction: "Complete the turtle's head.",
      fromSnapshotId: 'headed',
      toSnapshotId: 'neck',
      actionType: 'fold',
      hinge: HINGE_NECK,
      direction: 'valley',
      movingRegion: {
        id: 'moving-neck',
        faceIds: ['south', 'west'],
        polygonUV: uvPoly([P_LEG, BL_UP, P_BASE]),
        allowedHands: 'either',
      },
      startAngleDeg: 0,
      targetAngleDeg: 180,
      minAngleDeg: 0,
      maxAngleDeg: 180,
      targetLandmarks: [{ sourceVertexId: 'BL', target: BL_OUT }],
      arrowPathLocal: arc([BL_UP[0] + 0.006, BL_UP[1], 0.004], [BL_OUT[0] + 0.008, BL_OUT[1], 0.004], 0.016),
      meshStrategy: 'hinge',
      validationNotes: 'Step 5. A small adjustment points the head to the left. The shell stays one piece of paper.',
    }),
    step({
      id: 'turtle-decorate',
      ordinal: 9,
      progressStage: 6,
      title: 'Bring your turtle to life',
      instruction: 'Pinch to bring your turtle to life!',
      fromSnapshotId: 'neck',
      toSnapshotId: 'turtle',
      actionType: 'crease-press',
      creasePressHoldMs: 650,
      hinge: { ...HINGE_DIAG_A, id: 'turtle-decorate' },
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
      validationNotes: 'Step 6. One pinch reveals the eye and the shell markings, then the success state.',
    }),
  ],
  finalCreatureAsset: 'folded-paper-turtle',
};

export interface TurtleHexMark {
  x: number;
  y: number;
  alt: boolean;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / len2));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.hypot(px - qx, py - qy);
}

function insideTriangle(px: number, py: number, a: Vec3, b: Vec3, c: Vec3): boolean {
  const sign = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, a[0], a[1], b[0], b[1]);
  const d2 = sign(px, py, b[0], b[1], c[0], c[1]);
  const d3 = sign(px, py, c[0], c[1], a[0], a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export const TURTLE_HEX_RADIUS = 0.0088;

/** Hex centers on the shell, inset from the paper edge and clear of the head. */
export function turtleShellHexes(radius = TURTLE_HEX_RADIUS): TurtleHexMark[] {
  const shell: Vec3[] = [O, BR, BL];
  const margin = radius + 0.0035;
  const marks: TurtleHexMark[] = [];
  const pitchX = radius * 1.72;
  const pitchY = radius * Math.sqrt(3);
  for (let col = 0; col < 18; col += 1) {
    for (let row = 0; row < 14; row += 1) {
      const x = -0.1 + col * pitchX;
      const y = -0.1 + row * pitchY + (col % 2 === 0 ? 0 : pitchY * 0.5);
      if (!insideTriangle(x, y, shell[0]!, shell[1]!, shell[2]!)) {
        continue;
      }
      const clear = shell.every((start, edge) => {
        const end = shell[(edge + 1) % shell.length]!;
        return distToSegment(x, y, start[0], start[1], end[0], end[1]) >= margin;
      });
      if (!clear || (x < -0.048 && y < -0.07)) {
        continue;
      }
      marks.push({ x, y, alt: (col + row) % 2 === 1 });
    }
  }
  return marks;
}
