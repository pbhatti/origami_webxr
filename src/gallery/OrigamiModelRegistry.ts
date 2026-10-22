import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';
import { BAT_PAPER_COLOR, BAT_RECIPE } from '../origami/recipes/bat.recipe.ts';
import { OWL_BEAK_COLOR, OWL_EYE_COLOR, OWL_PAPER_COLOR, OWL_PUPIL_COLOR } from '../origami/recipes/owl.recipe.ts';
import { FOX_PAPER_COLOR, FOX_RECIPE } from '../origami/recipes/fox.recipe.ts';
import { WHALE_RECIPE } from '../origami/recipes/whale.recipe.ts';
import type { MeshSnapshot } from '../origami/types.ts';
import { ANIMALS, type AnimalId } from './animals.ts';

type Tris = number[];

const shared = new Map<string, MeshStandardMaterial>();
const sharedGeo = new Map<string, BufferGeometry>();

function paperMat(color: string): MeshStandardMaterial {
  const existing = shared.get(color);
  if (existing) {
    return existing;
  }
  const material = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.9,
    metalness: 0.03,
    side: DoubleSide,
  });
  shared.set(color, material);
  return material;
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

function geometryFromTris(tris: Tris): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(tris), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function meshFromTris(id: string, tris: Tris, color: string): Mesh {
  const key = `${id}:${tris.length}`;
  let geometry = sharedGeo.get(key);
  if (!geometry) {
    geometry = geometryFromTris(tris);
    sharedGeo.set(key, geometry);
  }
  return new Mesh(geometry, paperMat(color));
}

function snapshotGeometry(snapshot: MeshSnapshot): BufferGeometry {
  const positions: number[] = [];
  for (const face of snapshot.faces) {
    const tris = triangulate(face.vertices);
    const lift = face.layer * 0.00065;
    for (let i = 0; i < tris.length; i += 3) {
      const a = snapshot.vertices[tris[i] ?? 0] ?? [0, 0, 0];
      const b = snapshot.vertices[tris[i + 1] ?? 0] ?? [0, 0, 0];
      const c = snapshot.vertices[tris[i + 2] ?? 0] ?? [0, 0, 0];
      positions.push(a[0], a[1], a[2] + lift, b[0], b[1], b[2] + lift, c[0], c[1], c[2] + lift);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    const center = new Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    const size = new Vector3();
    box.getSize(size);
    const span = Math.max(size.x, size.y, size.z, 0.001);
    geometry.scale(0.078 / span, 0.078 / span, 0.078 / span);
  }
  return geometry;
}

function fit(group: Group, span = 0.078): Group {
  group.updateMatrixWorld(true);
  const boxMin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const boxMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  group.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.geometry) {
      return;
    }
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) {
      return;
    }
    boxMin.min(box.min);
    boxMax.max(box.max);
  });
  const size = boxMax.clone().sub(boxMin);
  const center = boxMin.clone().add(boxMax).multiplyScalar(0.5);
  const scale = span / Math.max(size.x, size.y, size.z, 0.001);
  group.children.forEach((child) => {
    child.position.sub(center);
  });
  group.scale.setScalar(scale);
  return group;
}

function poly(color: string, layers: Tris[]): Group {
  const group = new Group();
  layers.forEach((tris, index) => {
    const mesh = meshFromTris(`layer-${index}-${tris.join(',')}`, tris, color);
    mesh.position.z = index * 0.0012;
    group.add(mesh);
  });
  return fit(group);
}

function quad(x0: number, y0: number, x1: number, y1: number, z = 0): Tris {
  return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
}

function triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, z = 0): Tris {
  return [ax, ay, z, bx, by, z, cx, cy, z];
}

function snapshotModel(id: string, snapshot: MeshSnapshot | undefined, fallbackColor: string): Group {
  const group = new Group();
  if (!snapshot) {
    group.add(meshFromTris(`${id}-fallback`, triangle(-0.05, -0.02, 0.05, -0.02, 0, 0.05), fallbackColor));
    return fit(group);
  }
  let geometry = sharedGeo.get(`${id}-snapshot`);
  if (!geometry) {
    geometry = snapshotGeometry(snapshot);
    sharedGeo.set(`${id}-snapshot`, geometry);
  }
  const mesh = new Mesh(geometry, paperMat(fallbackColor));
  mesh.rotation.x = -0.18;
  group.add(mesh);
  return group;
}

function whaleModel(): Group {
  return snapshotModel('whale', WHALE_RECIPE.snapshots.whale, FOLD_PAPER_COLOR);
}

function foxModel(): Group {
  return snapshotModel('fox', FOX_RECIPE.snapshots.fox, FOX_PAPER_COLOR);
}

function batModel(): Group {
  const snapshot = BAT_RECIPE.snapshots.faced ?? BAT_RECIPE.snapshots.eared;
  const root = new Group();
  const body = new Group();
  const left = new Group();
  const right = new Group();
  left.userData.batWing = 'left';
  right.userData.batWing = 'right';
  if (snapshot) {
    const positions = { body: [] as number[], left: [] as number[], right: [] as number[] };
    for (const face of snapshot.faces) {
      const pts = face.vertices.map((index) => snapshot.vertices[index]).filter(Boolean) as Array<[number, number, number]>;
      if (pts.length < 3) {
        continue;
      }
      const cx = pts.reduce((sum, point) => sum + point[0], 0) / pts.length;
      const bucket = cx < -0.028 ? 'left' : cx > 0.028 ? 'right' : 'body';
      const origin = pts[0]!;
      for (let i = 1; i < pts.length - 1; i += 1) {
        const b = pts[i]!;
        const c = pts[i + 1]!;
        positions[bucket].push(origin[0], origin[1], origin[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      }
    }
    const add = (parent: Group, tris: number[], id: string) => {
      if (tris.length === 0) {
        return;
      }
      parent.add(meshFromTris(id, tris, BAT_PAPER_COLOR));
    };
    add(body, positions.body, 'bat-body');
    add(left, positions.left, 'bat-left');
    add(right, positions.right, 'bat-right');
  }
  root.add(body, left, right);
  root.userData.flutterWings = true;
  return fit(root);
}

function owlModel(): Group {
  const group = new Group();
  group.add(
    meshFromTris(
      'owl-body',
      [
        ...triangle(-0.038, -0.01, 0.038, -0.01, 0, 0.046),
        ...triangle(-0.042, 0.004, 0.042, 0.004, 0, -0.048),
        ...triangle(-0.046, 0.01, -0.008, -0.02, -0.02, -0.036),
        ...triangle(0.046, 0.01, 0.02, -0.036, 0.008, -0.02),
      ],
      OWL_PAPER_COLOR,
    ),
  );
  const eyeMat = paperMat(OWL_EYE_COLOR);
  const pupilMat = paperMat(OWL_PUPIL_COLOR);
  const beakMat = paperMat(OWL_BEAK_COLOR);
  const leftEye = new Mesh(new SphereGeometry(0.009, 12, 10), eyeMat);
  const rightEye = new Mesh(new SphereGeometry(0.009, 12, 10), eyeMat);
  const leftPupil = new Mesh(new SphereGeometry(0.0035, 8, 8), pupilMat);
  const rightPupil = new Mesh(new SphereGeometry(0.0035, 8, 8), pupilMat);
  leftEye.position.set(-0.012, 0.02, 0.012);
  rightEye.position.set(0.012, 0.02, 0.012);
  leftPupil.position.set(-0.012, 0.02, 0.02);
  rightPupil.position.set(0.012, 0.02, 0.02);
  const beak = new Mesh(new ConeGeometry(0.007, 0.014, 4), beakMat);
  beak.rotation.x = Math.PI;
  beak.position.set(0, 0.004, 0.014);
  const leftFoot = new Mesh(new SphereGeometry(0.006, 8, 8), eyeMat);
  const rightFoot = new Mesh(new SphereGeometry(0.006, 8, 8), eyeMat);
  leftFoot.scale.set(1.2, 0.55, 0.7);
  rightFoot.scale.set(1.2, 0.55, 0.7);
  leftFoot.position.set(-0.012, -0.046, 0.01);
  rightFoot.position.set(0.012, -0.046, 0.01);
  group.add(leftEye, rightEye, leftPupil, rightPupil, beak, leftFoot, rightFoot);
  return fit(group, 0.082);
}

const BUILDERS: Record<AnimalId, (color: string) => Group> = {
  whale: () => whaleModel(),
  fox: () => foxModel(),
  bat: () => batModel(),
  owl: () => owlModel(),
  rabbit: (color) =>
    poly(color, [
      triangle(-0.03, -0.02, 0.03, -0.02, 0, 0.03),
      triangle(-0.018, 0.02, -0.008, 0.02, -0.02, 0.07),
      triangle(0.008, 0.02, 0.018, 0.02, 0.016, 0.068),
      triangle(-0.01, -0.02, 0.01, -0.02, 0, -0.04),
    ]),
  elephant: (color) =>
    poly(color, [
      quad(-0.03, -0.01, 0.03, 0.03),
      triangle(-0.05, 0.01, -0.03, 0.03, -0.028, -0.01),
      triangle(0.03, 0.01, 0.055, 0.0, 0.03, -0.015),
      triangle(0.048, 0.0, 0.07, -0.03, 0.042, -0.012),
      triangle(-0.02, -0.01, -0.01, -0.01, -0.018, -0.035),
    ]),
  swan: (color) =>
    poly(color, [
      triangle(-0.04, -0.02, 0.04, -0.015, 0.01, 0.02),
      triangle(0.01, 0.018, 0.03, 0.05, 0.018, 0.022),
      triangle(0.028, 0.048, 0.042, 0.07, 0.022, 0.05),
      triangle(0.038, 0.068, 0.055, 0.062, 0.04, 0.055),
    ]),
  crane: (color) =>
    poly(color, [
      triangle(-0.05, 0.0, 0.05, 0.0, 0, 0.02),
      triangle(0, 0.02, 0.012, 0.055, -0.012, 0.055),
      triangle(0.012, 0.05, 0.05, 0.07, 0.008, 0.06),
      triangle(-0.012, 0.05, -0.008, 0.06, -0.045, 0.068),
      triangle(-0.01, 0.0, 0.01, 0.0, 0, -0.04),
    ]),
  boat: (color) =>
    poly(color, [
      triangle(-0.05, -0.01, 0.05, -0.01, 0, 0.02),
      triangle(-0.035, -0.01, 0.035, -0.01, 0, -0.03),
      triangle(-0.01, 0.018, 0.01, 0.018, 0, 0.045),
    ]),
  bird: (color) =>
    poly(color, [
      triangle(-0.055, 0.01, 0, 0.0, -0.01, 0.025),
      triangle(0.055, 0.01, 0.01, 0.025, 0, 0.0),
      triangle(-0.01, 0.0, 0.02, 0.01, 0.03, -0.02),
      triangle(-0.008, 0.02, 0.008, 0.02, 0, 0.045),
    ]),
  frog: (color) =>
    poly(color, [
      quad(-0.03, -0.01, 0.03, 0.025),
      triangle(-0.03, -0.01, -0.05, -0.03, -0.012, -0.018),
      triangle(0.03, -0.01, 0.012, -0.018, 0.05, -0.03),
      triangle(-0.02, 0.025, 0.02, 0.025, 0, 0.045),
      triangle(-0.028, 0.02, -0.038, 0.04, -0.018, 0.028),
    ]),
  cat: (color) =>
    poly(color, [
      triangle(-0.028, -0.02, 0.03, -0.018, 0, 0.028),
      triangle(-0.02, 0.02, -0.006, 0.028, -0.016, 0.05),
      triangle(0.006, 0.028, 0.02, 0.02, 0.016, 0.05),
      triangle(0.02, -0.01, 0.05, 0.0, 0.024, 0.01),
    ]),
  dog: (color) =>
    poly(color, [
      triangle(-0.03, -0.018, 0.028, -0.016, 0, 0.024),
      triangle(0.02, 0.01, 0.05, 0.004, 0.026, -0.01),
      triangle(-0.018, 0.02, -0.004, 0.024, -0.02, 0.045),
      triangle(0.004, 0.024, 0.018, 0.02, 0.012, 0.04),
      triangle(-0.01, -0.018, 0.01, -0.016, 0, -0.038),
    ]),
  horse: (color) =>
    poly(color, [
      triangle(-0.04, -0.02, 0.02, -0.016, -0.01, 0.02),
      triangle(-0.01, 0.018, 0.02, 0.05, 0.012, 0.016),
      triangle(0.018, 0.048, 0.042, 0.06, 0.02, 0.03),
      triangle(-0.03, -0.02, -0.038, -0.045, -0.018, -0.02),
      triangle(0.01, -0.016, 0.018, -0.042, 0.02, -0.014),
    ]),
  'dog-sitting': (color) =>
    poly(color, [
      quad(-0.02, -0.03, 0.022, 0.02),
      triangle(-0.02, 0.018, 0.018, 0.02, 0, 0.045),
      triangle(0.016, 0.012, 0.045, 0.008, 0.02, -0.01),
      triangle(-0.012, 0.04, 0, 0.044, -0.008, 0.058),
      triangle(0.004, 0.044, 0.014, 0.038, 0.01, 0.056),
    ]),
  mouse: (color) =>
    poly(color, [
      triangle(-0.025, -0.015, 0.03, -0.012, 0, 0.028),
      triangle(0.022, 0.0, 0.05, 0.01, 0.028, 0.016),
      triangle(-0.01, 0.022, 0.01, 0.022, 0, 0.04),
      triangle(-0.03, 0.0, -0.048, 0.03, -0.02, 0.018),
    ]),
  'cat-sitting': (color) =>
    poly(color, [
      quad(-0.024, -0.028, 0.026, 0.018),
      triangle(-0.02, 0.016, 0.02, 0.016, 0, 0.04),
      triangle(-0.016, 0.036, -0.004, 0.04, -0.014, 0.055),
      triangle(0.004, 0.04, 0.016, 0.034, 0.014, 0.055),
      triangle(0.02, -0.01, 0.04, -0.004, 0.022, 0.008),
    ]),
  'dog-standing': (color) =>
    poly(color, [
      triangle(-0.045, -0.01, 0.03, -0.008, -0.01, 0.02),
      triangle(0.02, 0.008, 0.055, 0.004, 0.028, -0.01),
      triangle(-0.04, -0.01, -0.048, -0.038, -0.03, -0.012),
      triangle(0.01, -0.008, 0.018, -0.036, 0.022, -0.006),
      triangle(-0.02, 0.016, -0.004, 0.02, -0.018, 0.04),
    ]),
};

export class OrigamiModelRegistry {
  readonly approximations: AnimalId[] = ANIMALS.filter((animal) => animal.approximation).map((animal) => animal.id);

  create(id: AnimalId, color: string): Group {
    const group = BUILDERS[id](color);
    group.name = `origami-${id}`;
    return group;
  }

  get loadedCount(): number {
    return ANIMALS.length;
  }

  get triangleCount(): number {
    let count = 0;
    sharedGeo.forEach((geometry) => {
      const position = geometry.getAttribute('position');
      count += Math.floor((position?.count ?? 0) / 3);
    });
    return count;
  }
}

export const origamiModels = new OrigamiModelRegistry();
