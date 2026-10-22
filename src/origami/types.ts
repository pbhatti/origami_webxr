export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type FoldDirection = 'mountain' | 'valley';
export type CreaseLifecycle = 'latent' | 'active' | 'locked';
export type FoldActionType = 'fold' | 'unfold' | 'collapse' | 'flap-fold' | 'crease-press';
export type MeshStrategy =
  | 'hinge'
  | 'authored-interpolation'
  | 'coupled-collapse'
  | 'unfold'
  | 'flap-fold'
  | 'crease-press';

export interface FaceDefinition {
  id: string;
  vertices: number[];
  layer: number;
  materialId: string;
}

export type FoldLayerMode = 'single' | 'packet';

export interface HingeDefinition {
  id: string;
  p0: Vec3;
  p1: Vec3;
  fixedFaces: string[];
  movingFaces: string[];
  /** `packet` folds every stacked layer on the moving half-plane about one hinge. */
  layerMode?: FoldLayerMode;
}

export interface CoupledHinge extends HingeDefinition {
  targetAngleDeg: number;
}

export interface GrabRegion {
  id: string;
  faceIds: string[];
  polygonUV: Vec2[];
  allowedHands: 'either' | 'left' | 'right';
  layer?: number;
}

export interface RecipeCrease {
  id: string;
  p0: Vec3;
  p1: Vec3;
  direction: FoldDirection;
}

export interface FoldStep {
  id: string;
  ordinal: number;
  title: string;
  instruction: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  hinge: HingeDefinition;
  direction: FoldDirection;
  movingRegion: GrabRegion;
  optionalHoldRegion?: GrabRegion;
  startAngleDeg: number;
  targetAngleDeg: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  angleToleranceDeg: number;
  targetPointToleranceM: number;
  targetLandmarks: Array<{ sourceVertexId: string; target: Vec3 }>;
  arrowPathLocal: Vec3[];
  creaseLineLocal: [Vec3, Vec3];
  meshStrategy: MeshStrategy;
  actionType?: FoldActionType;
  coupledHinges?: CoupledHinge[];
  extraCreaseLines?: Array<[Vec3, Vec3]>;
  lockCreaseIds?: string[];
  creasePressHoldMs?: number;
  progressStage?: number;
  /** Steps that share a group can be completed in either order. */
  parallelGroup?: string;
  validationNotes: string;
}

export interface MeshSnapshot {
  vertices: Vec3[];
  faces: FaceDefinition[];
  named?: Record<string, Vec3>;
  outline?: Vec3[];
}

export interface OrigamiRecipe {
  id: string;
  name: string;
  sheetSizeM: number;
  snapshots: Record<string, MeshSnapshot>;
  steps: FoldStep[];
  creases?: RecipeCrease[];
  finalSilhouette?: Vec3[];
  silhouetteToleranceM?: number;
  finalCreatureAsset: string;
}

export function stepActionType(step: FoldStep): FoldActionType {
  return step.actionType ?? 'fold';
}

export function interpolatesMesh(step: FoldStep): boolean {
  return (
    step.meshStrategy === 'authored-interpolation' ||
    step.meshStrategy === 'coupled-collapse' ||
    step.meshStrategy === 'unfold' ||
    step.meshStrategy === 'flap-fold'
  );
}
