import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import {
  FOX_FINAL_SHAPE,
  FOX_SHAPE_INSPECTOR,
  foxFaceCentroid,
  foxFaceRole,
  validateFoxGeometry,
  type FoxFoldGroups,
  type FoxShapeReport,
} from '../origami/foxFinalShape.ts';
import type { FaceDefinition, MeshSnapshot, Vec3 } from '../origami/types.ts';

const LOWER_LEFT = '#ff6a3d';
const LOWER_RIGHT = '#3dbbff';
const STATIONARY = '#8a93a6';
const MOVING = '#7dff7a';

function polyline(color: string): Line {
  const object = new Line(
    new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
    new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  object.frustumCulled = false;
  object.renderOrder = 12;
  return object;
}

function setLoop(object: Line, points: Vec3[], z: number): void {
  const closed = points.length > 1 ? [...points, points[0]!] : points;
  object.geometry.dispose();
  object.geometry = new BufferGeometry().setFromPoints(closed.map((point) => new Vector3(point[0], point[1], point[2] + z)));
}

function expectedMesh(): Mesh {
  const shape = new Shape();
  FOX_FINAL_SHAPE.local.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point[0], point[1]);
    } else {
      shape.lineTo(point[0], point[1]);
    }
  });
  shape.closePath();
  const mesh = new Mesh(
    new ShapeGeometry(shape),
    new MeshBasicMaterial({
      color: '#f2c14e',
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.name = 'fox-expected-silhouette';
  mesh.renderOrder = 11;
  mesh.frustumCulled = false;
  return mesh;
}

function triangleMesh(color: string): Mesh {
  const mesh = new Mesh(
    new BufferGeometry(),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.38,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  return mesh;
}

function setTriangle(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, z: number): void {
  mesh.geometry.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([a[0], a[1], a[2] + z, b[0], b[1], b[2] + z, c[0], c[1], c[2] + z]),
      3,
    ),
  );
  mesh.geometry = geometry;
}

function faceVerts(snapshot: MeshSnapshot, face: FaceDefinition): Vec3[] | null {
  const verts = face.vertices.map((index) => snapshot.vertices[index]);
  if (verts.length < 3 || verts.some((vertex) => !vertex)) {
    return null;
  }
  return verts as Vec3[];
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function idSprite(text: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111827';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.font = '22px sans-serif';
    context.fillText(text, 8, 42);
  }
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(0.05, 0.0125, 1);
  sprite.renderOrder = 15;
  sprite.frustumCulled = false;
  return sprite;
}

export class FoxShapeInspector {
  readonly group = new Group();
  report: FoxShapeReport | null = null;
  private readonly expected = expectedMesh();
  private readonly expectedLine = polyline('#e6a317');
  private readonly actualLine = polyline('#3ec6c6');
  private readonly layers = new Group();
  private readonly hinges = new Group();
  private readonly lowerLeft = new Group();
  private readonly lowerRight = new Group();
  private readonly stationary = new Group();
  private readonly moving = new Group();
  private readonly normals = new Group();
  private readonly ids = new Group();
  private readonly symmetry = polyline('#f4f7fb');
  private readonly facing = polyline('#ff5a7a');
  private readonly markers: Mesh[] = [];
  private readonly label: Sprite;
  private readonly labelCanvas: HTMLCanvasElement;
  private readonly labelContext: CanvasRenderingContext2D | null;

  constructor() {
    this.group.name = 'fox-final-shape-inspector';
    this.group.raycast = () => {};
    this.layers.name = 'fox-layer-boundaries';
    this.hinges.name = 'fox-ear-hinges';
    this.lowerLeft.name = 'fox-lower-left-faces';
    this.lowerRight.name = 'fox-lower-right-faces';
    this.stationary.name = 'fox-stationary-faces';
    this.moving.name = 'fox-moving-ear-faces';
    this.normals.name = 'fox-triangle-normals';
    this.ids.name = 'fox-face-ids';
    for (let i = 0; i < FOX_FINAL_SHAPE.local.length; i += 1) {
      const marker = new Mesh(
        new SphereGeometry(0.0032, 8, 6),
        new MeshBasicMaterial({ color: '#ffffff', depthTest: false }),
      );
      marker.renderOrder = 13;
      marker.frustumCulled = false;
      this.markers.push(marker);
    }
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 640;
    this.labelCanvas.height = 256;
    this.labelContext = this.labelCanvas.getContext('2d');
    this.label = new Sprite(new SpriteMaterial({ map: new CanvasTexture(this.labelCanvas), depthTest: false, transparent: true }));
    this.label.name = 'fox-shape-errors';
    this.label.scale.set(0.16, 0.064, 1);
    this.label.renderOrder = 14;
    this.group.add(
      this.expected,
      this.expectedLine,
      this.actualLine,
      this.layers,
      this.hinges,
      this.lowerLeft,
      this.lowerRight,
      this.stationary,
      this.moving,
      this.normals,
      this.ids,
      this.symmetry,
      this.facing,
      this.label,
      ...this.markers,
    );
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible && FOX_SHAPE_INSPECTOR.enabled;
  }

  update(snapshot: MeshSnapshot, turn: number, judge: boolean, groups?: FoxFoldGroups | null): void {
    const lift = turn > 0.5 ? -0.004 : 0.004;
    this.report = judge ? validateFoxGeometry(snapshot) : null;
    const showExpected = FOX_SHAPE_INSPECTOR.expectedSilhouette;
    this.expected.visible = showExpected;
    this.expectedLine.visible = showExpected;
    this.expected.position.z = lift;
    setLoop(this.expectedLine, FOX_FINAL_SHAPE.local, lift);

    const actual = snapshot.outline ?? [];
    this.actualLine.visible = FOX_SHAPE_INSPECTOR.actualSilhouette && actual.length > 1;
    setLoop(this.actualLine, actual, lift + 0.001);

    this.drawSegments(this.layers, this.layerEdges(snapshot), '#7aa2ff', FOX_SHAPE_INSPECTOR.layerBoundaries, lift);
    this.drawSegments(
      this.hinges,
      [FOX_FINAL_SHAPE.earHingeLeft, FOX_FINAL_SHAPE.earHingeRight],
      '#ffb020',
      FOX_SHAPE_INSPECTOR.earHinges,
      lift,
    );

    const tips = FOX_FINAL_SHAPE.local;
    this.markers.forEach((marker, index) => {
      const point = tips[index];
      marker.visible = FOX_SHAPE_INSPECTOR.vertices && Boolean(point);
      if (point) {
        marker.position.set(point[0], point[1], lift);
      }
    });

    const top = Math.max(...FOX_FINAL_SHAPE.local.map((p) => p[1]));
    this.symmetry.visible = FOX_SHAPE_INSPECTOR.symmetryAxis;
    setLoop(this.symmetry, [[0, -0.01, 0], [0, top + 0.02, 0]], lift);
    this.facing.visible = FOX_SHAPE_INSPECTOR.faceOrientation;
    setLoop(this.facing, [[0, 0.03, 0], [0, 0.03, -0.045]], 0);

    this.drawRoleFaces(snapshot, lift, groups);
    this.drawNormals(snapshot, lift);
    this.drawFaceIds(snapshot, lift);
    this.drawErrors(lift, top);
  }

  private drawRoleFaces(snapshot: MeshSnapshot, lift: number, groups?: FoxFoldGroups | null): void {
    const moving = new Set(groups?.movingFaceIds ?? []);
    const stationary = new Set(groups?.stationaryFaceIds ?? []);
    const left: FaceDefinition[] = [];
    const right: FaceDefinition[] = [];
    const still: FaceDefinition[] = [];
    const ears: FaceDefinition[] = [];
    for (const face of snapshot.faces) {
      const role = foxFaceRole(snapshot, face);
      if (role === 'lower-left') {
        left.push(face);
      } else if (role === 'lower-right') {
        right.push(face);
      }
      if (FOX_SHAPE_INSPECTOR.movingEarGroups && (role === 'ear-left' || role === 'ear-right' || moving.has(face.id))) {
        ears.push(face);
      } else if (
        FOX_SHAPE_INSPECTOR.stationaryGroups &&
        (role === 'stationary-head' || role === 'lower-left' || role === 'lower-right' || stationary.has(face.id))
      ) {
        still.push(face);
      }
    }
    this.fillFaces(this.lowerLeft, left, snapshot, LOWER_LEFT, FOX_SHAPE_INSPECTOR.highlightLowerLeft, lift + 0.0012);
    this.fillFaces(this.lowerRight, right, snapshot, LOWER_RIGHT, FOX_SHAPE_INSPECTOR.highlightLowerRight, lift + 0.0014);
    this.fillFaces(this.stationary, still, snapshot, STATIONARY, FOX_SHAPE_INSPECTOR.stationaryGroups, lift + 0.0006);
    this.fillFaces(this.moving, ears, snapshot, MOVING, FOX_SHAPE_INSPECTOR.movingEarGroups, lift + 0.0018);
  }

  private fillFaces(
    group: Group,
    faces: FaceDefinition[],
    snapshot: MeshSnapshot,
    color: string,
    visible: boolean,
    lift: number,
  ): void {
    group.visible = visible;
    while (group.children.length < faces.length) {
      group.add(triangleMesh(color));
    }
    group.children.forEach((child, index) => {
      const face = faces[index];
      const verts = face ? faceVerts(snapshot, face) : null;
      child.visible = Boolean(verts);
      if (verts && child instanceof Mesh) {
        (child.material as MeshBasicMaterial).color.set(color);
        setTriangle(child, verts[0]!, verts[1]!, verts[2]!, lift);
      }
    });
  }

  private drawNormals(snapshot: MeshSnapshot, lift: number): void {
    const show = FOX_SHAPE_INSPECTOR.triangleNormals;
    this.normals.visible = show;
    if (!show) {
      this.normals.children.forEach((child) => {
        child.visible = false;
      });
      return;
    }
    while (this.normals.children.length < snapshot.faces.length) {
      this.normals.add(polyline('#ffd44a'));
    }
    snapshot.faces.forEach((face, index) => {
      const child = this.normals.children[index];
      const verts = faceVerts(snapshot, face);
      if (!child || !(child instanceof Line) || !verts) {
        if (child) {
          child.visible = false;
        }
        return;
      }
      child.visible = true;
      const centroid = foxFaceCentroid(snapshot, face);
      const normal = faceNormal(verts[0]!, verts[1]!, verts[2]!);
      setLoop(
        child,
        [
          [centroid[0], centroid[1], centroid[2] + lift],
          [centroid[0] + normal[0] * 0.018, centroid[1] + normal[1] * 0.018, centroid[2] + lift + normal[2] * 0.018],
        ],
        0,
      );
    });
    this.normals.children.slice(snapshot.faces.length).forEach((child) => {
      child.visible = false;
    });
  }

  private drawFaceIds(snapshot: MeshSnapshot, lift: number): void {
    const show = FOX_SHAPE_INSPECTOR.faceIds;
    this.ids.visible = show;
    if (!show) {
      this.ids.children.forEach((child) => {
        child.visible = false;
      });
      return;
    }
    while (this.ids.children.length < snapshot.faces.length) {
      this.ids.add(idSprite(''));
    }
    snapshot.faces.forEach((face, index) => {
      const child = this.ids.children[index];
      if (!(child instanceof Sprite)) {
        return;
      }
      child.visible = true;
      const centroid = foxFaceCentroid(snapshot, face);
      child.position.set(centroid[0], centroid[1], lift + 0.006);
      const map = child.material.map;
      const image = map?.image as HTMLCanvasElement | undefined;
      const context = image?.getContext('2d');
      if (context && image) {
        context.clearRect(0, 0, image.width, image.height);
        context.fillStyle = '#111827';
        context.fillRect(0, 0, image.width, image.height);
        context.fillStyle = '#f8fafc';
        context.font = '22px sans-serif';
        context.fillText(face.id, 8, 42);
        if (map) {
          map.needsUpdate = true;
        }
      }
    });
    this.ids.children.slice(snapshot.faces.length).forEach((child) => {
      child.visible = false;
    });
  }

  private drawErrors(lift: number, top: number): void {
    const context = this.labelContext;
    const report = this.report;
    this.label.visible = FOX_SHAPE_INSPECTOR.validationErrors && Boolean(context);
    this.label.position.set(0, top + 0.045, lift);
    if (!context) {
      return;
    }
    context.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    const waiting = report == null;
    context.fillStyle = waiting ? '#EFEAE5' : report.ok ? '#F7F3EF' : '#FFD3AD';
    context.fillRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    context.fillStyle = waiting ? '#77716E' : report.ok ? '#222222' : '#1F1F1F';
    context.font = '500 28px "Plus Jakarta Sans", sans-serif';
    const lines = waiting ? ['Fox shape is judged after both ears fold'] : report.ok ? ['Fox shape OK'] : report.errors;
    lines.slice(0, 6).forEach((line, index) => {
      context.fillText(line, 16, 40 + index * 34);
    });
    const map = this.label.material.map;
    if (map) {
      map.needsUpdate = true;
    }
  }

  private drawSegments(group: Group, segments: Array<[Vec3, Vec3]>, color: string, visible: boolean, lift: number): void {
    group.visible = visible;
    while (group.children.length < segments.length) {
      group.add(polyline(color));
    }
    group.children.forEach((child, index) => {
      const segment = segments[index];
      child.visible = Boolean(segment);
      if (segment && child instanceof Line) {
        setLoop(child, segment, lift);
      }
    });
  }

  private layerEdges(snapshot: MeshSnapshot): Array<[Vec3, Vec3]> {
    const owners = new Map<string, number[]>();
    snapshot.faces.forEach((face, faceIndex) => {
      const indices = face.vertices;
      for (let i = 0; i < indices.length; i += 1) {
        const a = indices[i];
        const b = indices[(i + 1) % indices.length];
        if (a === undefined || b === undefined) {
          continue;
        }
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const list = owners.get(key) ?? [];
        list.push(faceIndex);
        owners.set(key, list);
      }
    });
    const edges: Array<[Vec3, Vec3]> = [];
    for (const [key, faceIndices] of owners) {
      const layers = new Set(faceIndices.map((index) => snapshot.faces[index]?.layer));
      if (layers.size < 2) {
        continue;
      }
      const [a, b] = key.split(':').map(Number);
      const va = snapshot.vertices[a ?? -1];
      const vb = snapshot.vertices[b ?? -1];
      if (va && vb) {
        edges.push([va, vb]);
      }
    }
    return edges;
  }
}
