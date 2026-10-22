import {
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { GUIDE_LIFT_M, liftForDisplay } from '../origami/creaseMath.ts';
import { FOLD_GEOMETRY_INSPECTOR } from '../origami/foldGeometryInspector.ts';
import { foldAxisDebug } from '../origami/MeshSplitter.ts';
import type { FoldStep, MeshSnapshot, Vec3 } from '../origami/types.ts';

function line(color: string, width: number): Line {
  const object = new Line(
    new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, 0.01, 0)]),
    new LineBasicMaterial({ color, linewidth: width, depthTest: false }),
  );
  object.renderOrder = 8;
  return object;
}

function setPoints(object: Line, a: Vec3, b: Vec3): void {
  object.geometry.dispose();
  object.geometry = new BufferGeometry().setFromPoints([new Vector3(...a), new Vector3(...b)]);
}

function faceMesh(snapshot: MeshSnapshot, ids: Set<string>, color: string, name: string, liftM: number): Mesh {
  const shape = new Shape();
  let started = false;
  for (const face of snapshot.faces) {
    if (!ids.has(face.id)) {
      continue;
    }
    const pts = face.vertices
      .map((index) => snapshot.vertices[index])
      .filter((vertex): vertex is Vec3 => Boolean(vertex));
    const first = pts[0];
    if (!first) {
      continue;
    }
    if (!started) {
      shape.moveTo(first[0], first[1]);
      started = true;
    } else {
      shape.moveTo(first[0], first[1]);
    }
    pts.slice(1).forEach((point) => shape.lineTo(point[0], point[1]));
    shape.closePath();
  }
  const mesh = new Mesh(
    new ShapeGeometry(shape),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: name === 'group-faces' ? 0.1 : 0.28,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.name = name;
  mesh.position.z = liftM;
  mesh.renderOrder = 6;
  return mesh;
}

export class CreaseDebugOverlay {
  readonly group = new Group();
  private readonly hinge: Line;
  private readonly visual: Line;
  private readonly mismatch: Line;
  private readonly start: Mesh;
  private readonly end: Mesh;
  private readonly siblings = new Group();
  private overlays = new Map<string, Mesh>();

  constructor() {
    this.group.name = 'fold-fly-crease-debug';
    this.hinge = line('#22d3ee', 2);
    this.visual = line('#eab308', 2);
    this.mismatch = line('#ef4444', 2);
    this.mismatch.visible = false;
    this.start = new Mesh(new SphereGeometry(0.004, 10, 10), new MeshBasicMaterial({ color: '#22d3ee' }));
    this.end = new Mesh(new SphereGeometry(0.004, 10, 10), new MeshBasicMaterial({ color: '#22d3ee' }));
    this.siblings.name = 'sibling-hinges';
    this.group.add(this.hinge, this.visual, this.mismatch, this.start, this.end, this.siblings);
    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(step: FoldStep | null, fromSnap: MeshSnapshot | null, angleDeg: number, siblings: FoldStep[] = []): void {
    if (!step || !fromSnap) {
      this.group.visible = false;
      return;
    }
    const debug = foldAxisDebug(step, fromSnap, angleDeg);
    const showHinge = FOLD_GEOMETRY_INSPECTOR.hingeAxis;
    this.hinge.visible = showHinge;
    this.visual.visible = showHinge;
    this.start.visible = showHinge;
    this.end.visible = showHinge;
    this.siblings.visible = showHinge;
    this.replaceSiblingHinges(step, fromSnap, siblings, showHinge);
    setPoints(this.hinge, liftForDisplay(debug.hinge[0], 0.0008), liftForDisplay(debug.hinge[1], 0.0008));
    setPoints(this.visual, liftForDisplay(debug.visual[0], 0.0012), liftForDisplay(debug.visual[1], 0.0012));
    this.start.position.set(...liftForDisplay(debug.hinge[0], 0.001));
    this.end.position.set(...liftForDisplay(debug.hinge[1], 0.001));
    this.mismatch.visible = debug.mismatch && showHinge;
    if (debug.mismatch) {
      setPoints(this.mismatch, liftForDisplay(debug.hinge[0], 0.002), liftForDisplay(debug.visual[0], 0.002));
    }

    const group = debug.foldGroup;
    const dualLayer = group.layers.length > 1;
    this.replaceOverlay(
      'front',
      debug.snapshot,
      new Set(FOLD_GEOMETRY_INSPECTOR.frontLayer ? group.frontFaceIds : []),
      '#22c55e',
      GUIDE_LIFT_M + 0.0016,
    );
    this.replaceOverlay(
      'back',
      debug.snapshot,
      new Set(FOLD_GEOMETRY_INSPECTOR.backLayer && dualLayer ? group.backFaceIds : []),
      '#3b82f6',
      GUIDE_LIFT_M + 0.0007,
    );
    this.replaceOverlay(
      'group',
      debug.snapshot,
      new Set(FOLD_GEOMETRY_INSPECTOR.foldGroup ? group.faceIds : []),
      '#a3e635',
      GUIDE_LIFT_M + 0.0003,
    );
    this.replaceOverlay(
      'stationary',
      debug.snapshot,
      new Set(debug.stationaryFaceIds),
      '#94a3b8',
      GUIDE_LIFT_M,
    );
  }

  private replaceOverlay(
    kind: string,
    snapshot: MeshSnapshot,
    ids: Set<string>,
    color: string,
    liftM: number,
  ): void {
    const current = this.overlays.get(kind);
    if (current) {
      this.group.remove(current);
      current.geometry.dispose();
      (current.material as MeshBasicMaterial).dispose();
      this.overlays.delete(kind);
    }
    if (ids.size === 0) {
      return;
    }
    const next = faceMesh(snapshot, ids, color, `${kind}-faces`, liftM);
    this.overlays.set(kind, next);
    this.group.add(next);
  }

  private replaceSiblingHinges(
    active: FoldStep,
    fromSnap: MeshSnapshot,
    siblings: FoldStep[],
    showHinge: boolean,
  ): void {
    [...this.siblings.children].forEach((child) => {
      this.siblings.remove(child);
      if (child instanceof Line) {
        child.geometry.dispose();
        (child.material as LineBasicMaterial).dispose();
      } else if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as MeshBasicMaterial).dispose();
      }
    });
    if (!showHinge) {
      return;
    }
    for (const sibling of siblings) {
      if (sibling.id === active.id) {
        continue;
      }
      const debug = foldAxisDebug(sibling, fromSnap, sibling.startAngleDeg);
      const hingeLine = line('#67e8f9', 2);
      setPoints(hingeLine, liftForDisplay(debug.hinge[0], 0.0008), liftForDisplay(debug.hinge[1], 0.0008));
      const visualLine = line('#facc15', 2);
      setPoints(visualLine, liftForDisplay(debug.visual[0], 0.0012), liftForDisplay(debug.visual[1], 0.0012));
      this.siblings.add(hingeLine, visualLine);
    }
  }
}
