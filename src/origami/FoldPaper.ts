import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { MeshStandardMaterial } from 'three';
import { FOX_SHAPE_INSPECTOR } from './foxFinalShape.ts';
import { clamp, lerp3 } from '../utils/math.ts';
import { rotateAroundHinge } from './CreaseSolver.ts';
import { copy3 } from './creaseMath.ts';
import { deformByHinge } from './MeshSplitter.ts';
import { deformRollSnapshot } from './rollFold.ts';
import {
  FOLD_PAPER_COLOR,
  applyPaperMaterial,
  createPaperMaterials,
  origamiPaperMaterial,
} from './OrigamiPaperMaterial.ts';
import { PAPER_DEPTH, buildPaperMesh, paperDepthToken } from './paperDepth.ts';
import { interpolatesMesh, stepActionType, type FoldStep, type MeshSnapshot, type Vec3 } from './types.ts';

export { FOLD_PAPER_COLOR };

function contactShadowMat(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color('#1a120c'),
    transparent: true,
    opacity: PAPER_DEPTH.contactShadowOpacity,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    vertexColors: true,
  });
}

function coupledHingeDeform(step: FoldStep, fromSnap: MeshSnapshot, t: number): Vec3[] {
  let verts = fromSnap.vertices.map((vertex) => copy3(vertex));
  for (const hinge of step.coupledHinges ?? []) {
    const angle = t * hinge.targetAngleDeg;
    const signed = step.direction === 'valley' ? -angle : angle;
    const moving = new Set(hinge.movingFaces);
    const movingVerts = new Set<number>();
    for (const face of fromSnap.faces) {
      if (moving.has(face.id)) {
        face.vertices.forEach((index) => movingVerts.add(index));
      }
    }
    verts = verts.map((vertex, index) =>
      movingVerts.has(index) ? rotateAroundHinge(vertex, hinge.p0, hinge.p1, signed) : vertex,
    );
  }
  return verts;
}

function interpolate(fromSnap: MeshSnapshot, toSnap: MeshSnapshot, t: number): Vec3[] {
  const count = Math.min(fromSnap.vertices.length, toSnap.vertices.length);
  return Array.from({ length: count }, (_, i) => {
    const a = fromSnap.vertices[i] ?? [0, 0, 0];
    const b = toSnap.vertices[i] ?? a;
    return lerp3(a, b, t);
  });
}

export function deformFoldSnapshot(
  step: FoldStep,
  fromSnap: MeshSnapshot,
  toSnap: MeshSnapshot,
  angleDeg: number,
): MeshSnapshot {
  if (stepActionType(step) === 'crease-press') {
    return fromSnap;
  }
  if (step.meshStrategy === 'turn') {
    return turnSnapshot(fromSnap, angleDeg);
  }
  const t = clamp(angleDeg / Math.max(step.targetAngleDeg, 1e-6), 0, 1);
  if (step.meshStrategy === 'roll' && (step.rollSegments?.length ?? 0) > 0) {
    return deformRollSnapshot(fromSnap, step.rollSegments ?? [], t, step.rollDirection ?? 'close');
  }
  if (interpolatesMesh(step) && fromSnap.vertices.length === toSnap.vertices.length) {
    return { ...fromSnap, vertices: interpolate(fromSnap, toSnap, t), faces: blendLayers(fromSnap, toSnap, t) };
  }
  if ((step.coupledHinges?.length ?? 0) > 0) {
    return { ...fromSnap, vertices: coupledHingeDeform(step, fromSnap, t), faces: blendLayers(fromSnap, toSnap, t) };
  }
  const signed = step.direction === 'valley' ? -angleDeg : angleDeg;
  const hint = step.targetLandmarks[0]?.sourceVertexId
    ? fromSnap.named?.[step.targetLandmarks[0].sourceVertexId]
    : undefined;
  const result = deformByHinge(fromSnap, step.hinge, signed, hint);
  const faces = result.snapshot.faces.map((face) =>
    result.movingFaceIds.has(face.id) ? { ...face, layer: face.layer + t } : face,
  );
  return { ...result.snapshot, faces };
}

/**
 * Parent yaw for a paper flip. Negative Y brings the right edge toward the
 * viewer; 180° lands on the same pose as `turnSnapshot`.
 */
export function paperFlipYawRad(angleDeg: number): number {
  return (-angleDeg * Math.PI) / 180;
}

/** Rotate the folded sheet around its vertical axis so the reverse side faces the viewer. */
export function turnSnapshot(snapshot: MeshSnapshot, angleDeg: number): MeshSnapshot {
  const theta = (Math.PI * angleDeg) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const mapPoint = (point: Vec3): Vec3 => [
    point[0] * cos + point[2] * sin,
    point[1],
    -point[0] * sin + point[2] * cos,
  ];
  return {
    ...snapshot,
    vertices: snapshot.vertices.map(mapPoint),
    named: snapshot.named
      ? Object.fromEntries(Object.entries(snapshot.named).map(([key, point]) => [key, mapPoint(point)]))
      : snapshot.named,
    outline: snapshot.outline?.map(mapPoint),
  };
}

function blendLayers(fromSnap: MeshSnapshot, toSnap: MeshSnapshot, t: number) {
  const target = new Map(toSnap.faces.map((face) => [face.id, face.layer]));
  return fromSnap.faces.map((face) => {
    const next = target.get(face.id);
    if (next == null) {
      return face;
    }
    return { ...face, layer: face.layer + (next - face.layer) * t };
  });
}

export function deformFoldMesh(
  step: FoldStep,
  fromSnap: MeshSnapshot,
  toSnap: MeshSnapshot,
  angleDeg: number,
): Vec3[] {
  return deformFoldSnapshot(step, fromSnap, toSnap, angleDeg).vertices;
}

export class FoldPaper {
  readonly group = new Group();
  private readonly mesh: Mesh;
  private readonly shadowMesh: Mesh;
  private readonly layerBounds: LineSegments;
  private readonly creaseAxes: LineSegments;
  private readonly materials: MeshStandardMaterial[];
  private geometry = new BufferGeometry();
  private shadowGeometry = new BufferGeometry();
  private builtKey = '';
  private faceCount = 0;
  private frontColor = FOLD_PAPER_COLOR;
  private lastSnapshot: MeshSnapshot | null = null;

  constructor() {
    this.group.name = 'fold-fly-paper-sheet';
    this.materials = createPaperMaterials(origamiPaperMaterial(FOLD_PAPER_COLOR));
    this.mesh = new Mesh(this.geometry, this.materials);
    this.mesh.name = 'paper-faces';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.shadowMesh = new Mesh(this.shadowGeometry, contactShadowMat());
    this.shadowMesh.name = 'paper-contact-shadows';
    this.shadowMesh.castShadow = false;
    this.shadowMesh.receiveShadow = false;
    this.shadowMesh.renderOrder = 0;
    this.shadowMesh.frustumCulled = false;
    this.layerBounds = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: '#8a5a3a', transparent: true, opacity: 0.85 }),
    );
    this.layerBounds.name = 'paper-layer-bounds';
    this.layerBounds.visible = false;
    this.layerBounds.frustumCulled = false;
    this.creaseAxes = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: '#2f6fbe', transparent: true, opacity: 0.9 }),
    );
    this.creaseAxes.name = 'paper-crease-axes';
    this.creaseAxes.visible = false;
    this.creaseAxes.frustumCulled = false;
    this.group.add(this.mesh, this.shadowMesh, this.layerBounds, this.creaseAxes);
  }

  get material(): MeshStandardMaterial {
    return this.materials[0] ?? (this.mesh.material as MeshStandardMaterial);
  }

  get meshId(): string {
    return this.mesh.uuid;
  }

  get layerCount(): number {
    return this.faceCount;
  }

  setColor(color: string): void {
    this.frontColor = color;
    applyPaperMaterial(this.materials, origamiPaperMaterial(color));
  }

  /** Warm the paper slightly while it is held. The shell geometry stays put. */
  setGrabHighlight(active: boolean): void {
    for (const material of this.materials) {
      material.emissive.set(active ? 0x6a4332 : 0x000000);
      material.emissiveIntensity = active ? 0.22 : 0;
    }
  }

  syncDepthDebug(): void {
    this.layerBounds.visible = PAPER_DEPTH.showLayerBounds;
    this.creaseAxes.visible = PAPER_DEPTH.showCreaseAxes;
    this.shadowMesh.visible = PAPER_DEPTH.shadows && PAPER_DEPTH.showShadowMeshes;
    applyPaperMaterial(this.materials, origamiPaperMaterial(this.frontColor));
    const shadowMaterial = this.shadowMesh.material as MeshBasicMaterial;
    shadowMaterial.opacity = PAPER_DEPTH.contactShadowOpacity;
    if (this.lastSnapshot && paperDepthToken() !== this.shadowToken()) {
      this.builtKey = '';
      this.setSnapshot(this.lastSnapshot);
    }
  }

  applyInspector(active = true): void {
    const inspect = active && FOX_SHAPE_INSPECTOR.enabled;
    const side = inspect && !FOX_SHAPE_INSPECTOR.disableBackfaceCulling ? FrontSide : DoubleSide;
    for (const material of this.materials) {
      material.wireframe = inspect && FOX_SHAPE_INSPECTOR.wireframe;
      material.side = side;
      material.needsUpdate = true;
    }
  }

  apply(step: FoldStep | null, fromSnap: MeshSnapshot | null, toSnap: MeshSnapshot | null, angleDeg: number): void {
    if (!fromSnap) {
      return;
    }
    if (!step || !toSnap || step.meshStrategy === 'turn') {
      this.setSnapshot(fromSnap);
      return;
    }
    this.setSnapshot(deformFoldSnapshot(step, fromSnap, toSnap, angleDeg));
  }

  setSnapshot(snapshot: MeshSnapshot): void {
    this.lastSnapshot = snapshot;
    const key = `${snapshotKey(snapshot)}|${this.shadowToken()}`;
    if (key === this.builtKey) {
      return;
    }
    this.builtKey = key;
    const built = buildPaperMesh(snapshot, PAPER_DEPTH.shadows);
    this.faceCount = built.faceCount;
    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(built.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(built.normals, 3));
    for (const group of built.groups) {
      this.geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    this.mesh.geometry = this.geometry;
    this.shadowGeometry.dispose();
    this.shadowGeometry = new BufferGeometry();
    const shadowPositions = built.shadowPositions.length >= 9 ? built.shadowPositions : new Float32Array(9);
    const shadowColors = built.shadowColors.length >= 12 ? built.shadowColors : new Float32Array(12);
    this.shadowGeometry.setAttribute('position', new BufferAttribute(shadowPositions, 3));
    this.shadowGeometry.setAttribute('color', new BufferAttribute(shadowColors, 4));
    this.shadowMesh.geometry = this.shadowGeometry;
    this.shadowMesh.visible = PAPER_DEPTH.shadows && PAPER_DEPTH.showShadowMeshes && built.shadowPositions.length >= 9;
    replaceLines(this.layerBounds, built.layerLines);
    replaceLines(this.creaseAxes, built.creaseLines);
  }

  private shadowToken(): string {
    return paperDepthToken();
  }
}

function snapshotKey(snapshot: MeshSnapshot): string {
  let hash = snapshot.vertices.length * 131 + snapshot.faces.length;
  for (const vertex of snapshot.vertices) {
    hash = (Math.imul(hash, 33) + Math.round(vertex[0] * 1e5)) | 0;
    hash = (Math.imul(hash, 33) + Math.round(vertex[1] * 1e5)) | 0;
    hash = (Math.imul(hash, 33) + Math.round(vertex[2] * 1e5)) | 0;
  }
  for (const face of snapshot.faces) {
    hash = (Math.imul(hash, 33) + face.layer) | 0;
    hash = (Math.imul(hash, 33) + face.vertices.length) | 0;
  }
  return String(hash);
}

function replaceLines(lines: LineSegments, data: Float32Array): void {
  const geometry = new BufferGeometry();
  const source = data.length >= 6 ? data : new Float32Array(6);
  geometry.setAttribute('position', new BufferAttribute(source, 3));
  lines.geometry.dispose();
  lines.geometry = geometry;
}
