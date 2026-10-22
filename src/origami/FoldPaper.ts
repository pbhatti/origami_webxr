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
  MeshStandardMaterial,
} from 'three';
import { FOX_SHAPE_INSPECTOR } from './foxFinalShape.ts';
import { clamp, lerp3 } from '../utils/math.ts';
import { rotateAroundHinge } from './CreaseSolver.ts';
import { copy3 } from './creaseMath.ts';
import { deformByHinge, usesAxisAngleFold } from './MeshSplitter.ts';
import { PAPER_DEPTH, buildPaperMesh } from './paperDepth.ts';
import { interpolatesMesh, stepActionType, type FoldStep, type MeshSnapshot, type Vec3 } from './types.ts';

export const FOLD_PAPER_COLOR = '#e24a1a';

function paperMat(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.96,
    metalness: 0,
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
  const t = clamp(angleDeg / Math.max(step.targetAngleDeg, 1e-6), 0, 1);
  if (interpolatesMesh(step) && fromSnap.vertices.length === toSnap.vertices.length) {
    return { ...fromSnap, vertices: interpolate(fromSnap, toSnap, t) };
  }
  if ((step.coupledHinges?.length ?? 0) > 0) {
    return { ...fromSnap, vertices: coupledHingeDeform(step, fromSnap, t) };
  }
  if (usesAxisAngleFold(step)) {
    const signed = step.direction === 'valley' ? -angleDeg : angleDeg;
    const hint = step.targetLandmarks[0]?.sourceVertexId
      ? fromSnap.named?.[step.targetLandmarks[0].sourceVertexId]
      : undefined;
    return deformByHinge(fromSnap, step.hinge, signed, hint).snapshot;
  }
  const signed = step.direction === 'valley' ? -angleDeg : angleDeg;
  const hint = step.targetLandmarks[0]?.sourceVertexId
    ? fromSnap.named?.[step.targetLandmarks[0].sourceVertexId]
    : undefined;
  return deformByHinge(fromSnap, step.hinge, signed, hint).snapshot;
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
  private readonly layerBounds: LineSegments;
  private readonly creaseAxes: LineSegments;
  private geometry = new BufferGeometry();
  private builtKey = '';
  private faceCount = 0;
  private lastSnapshot: MeshSnapshot | null = null;

  constructor() {
    this.group.name = 'fold-fly-paper-sheet';
    this.mesh = new Mesh(this.geometry, paperMat(FOLD_PAPER_COLOR));
    this.mesh.name = 'paper-faces';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
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
    this.group.add(this.mesh, this.layerBounds, this.creaseAxes);
  }

  get material(): MeshStandardMaterial {
    return this.mesh.material as MeshStandardMaterial;
  }

  get meshId(): string {
    return this.mesh.uuid;
  }

  get layerCount(): number {
    return this.faceCount;
  }

  setColor(color: string): void {
    this.material.color.set(color);
  }

  /** Warm the paper slightly while it is held. The shell geometry stays put. */
  setGrabHighlight(active: boolean): void {
    this.material.emissive.set(active ? 0x6a4332 : 0x000000);
    this.material.emissiveIntensity = active ? 0.22 : 0;
  }

  syncDepthDebug(): void {
    this.layerBounds.visible = PAPER_DEPTH.showLayerBounds;
    this.creaseAxes.visible = PAPER_DEPTH.showCreaseAxes;
    if (this.lastSnapshot && (PAPER_DEPTH.shadows ? '1' : '0') !== this.shadowToken()) {
      this.setSnapshot(this.lastSnapshot);
    }
  }

  applyInspector(active = true): void {
    const inspect = active && FOX_SHAPE_INSPECTOR.enabled;
    this.material.wireframe = inspect && FOX_SHAPE_INSPECTOR.wireframe;
    this.material.side = inspect && !FOX_SHAPE_INSPECTOR.disableBackfaceCulling ? FrontSide : DoubleSide;
    this.material.needsUpdate = true;
  }

  apply(step: FoldStep | null, fromSnap: MeshSnapshot | null, toSnap: MeshSnapshot | null, angleDeg: number): void {
    if (!fromSnap) {
      return;
    }
    if (!step || !toSnap) {
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
    this.geometry.setAttribute('color', new BufferAttribute(built.colors, 3));
    this.mesh.geometry = this.geometry;
    replaceLines(this.layerBounds, built.layerLines);
    replaceLines(this.creaseAxes, built.creaseLines);
  }

  private shadowToken(): string {
    return PAPER_DEPTH.shadows ? '1' : '0';
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
