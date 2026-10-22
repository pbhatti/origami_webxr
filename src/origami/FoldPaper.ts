import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { FOX_SHAPE_INSPECTOR } from './foxFinalShape.ts';
import { clamp, lerp3 } from '../utils/math.ts';
import { rotateAroundHinge } from './CreaseSolver.ts';
import { copy3 } from './creaseMath.ts';
import { deformByHinge, usesAxisAngleFold } from './MeshSplitter.ts';
import { interpolatesMesh, stepActionType, type FoldStep, type MeshSnapshot, type Vec3 } from './types.ts';

export const FOLD_PAPER_COLOR = '#e24a1a';

function paperMat(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.92,
    metalness: 0.02,
    side: DoubleSide,
  });
}

function triangulate(indices: number[]): number[] {
  if (indices.length === 3) {
    return [...indices];
  }
  const tris: number[] = [];
  for (let i = 1; i < indices.length - 1; i += 1) {
    const a = indices[0];
    const b = indices[i];
    const c = indices[i + 1];
    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }
    tris.push(a, b, c);
  }
  return tris;
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
  private geometry = new BufferGeometry();

  constructor() {
    this.group.name = 'fold-fly-paper-sheet';
    this.mesh = new Mesh(this.geometry, paperMat(FOLD_PAPER_COLOR));
    this.mesh.name = 'paper-faces';
    this.group.add(this.mesh);
  }

  get material(): MeshStandardMaterial {
    return this.mesh.material as MeshStandardMaterial;
  }

  get meshId(): string {
    return this.mesh.uuid;
  }

  setColor(color: string): void {
    this.material.color.set(color);
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
    const positions: number[] = [];
    const normals: number[] = [];
    for (const face of snapshot.faces) {
      const tris = triangulate(face.vertices);
      const lift = face.layer * 0.00065;
      for (let i = 0; i < tris.length; i += 3) {
        const ia = snapshot.vertices[tris[i] ?? 0] ?? [0, 0, 0];
        const ib = snapshot.vertices[tris[i + 1] ?? 0] ?? [0, 0, 0];
        const ic = snapshot.vertices[tris[i + 2] ?? 0] ?? [0, 0, 0];
        positions.push(ia[0], ia[1], ia[2] + lift, ib[0], ib[1], ib[2] + lift, ic[0], ic[1], ic[2] + lift);
        const abx = ib[0] - ia[0];
        const aby = ib[1] - ia[1];
        const abz = ib[2] - ia[2];
        const acx = ic[0] - ia[0];
        const acy = ic[1] - ia[1];
        const acz = ic[2] - ia[2];
        let nx = aby * acz - abz * acy;
        let ny = abz * acx - abx * acz;
        let nz = abx * acy - aby * acx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      }
    }
    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    this.geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.mesh.geometry = this.geometry;
  }
}
