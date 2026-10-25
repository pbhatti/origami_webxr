import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';
import { createPaperMaterials, origamiPaperMaterial } from '../origami/OrigamiPaperMaterial.ts';
import { PAPER_DEPTH, buildPaperMesh, type PaperMeshBuffers } from '../origami/paperDepth.ts';
import { BAT_PAPER_COLOR, BAT_RECIPE } from '../origami/recipes/bat.recipe.ts';
import { OWL_BEAK_COLOR, OWL_EYE_COLOR, OWL_PAPER_COLOR, OWL_PUPIL_COLOR } from '../origami/recipes/owl.recipe.ts';
import { TURTLE_PAPER_COLOR, TURTLE_RECIPE } from '../origami/recipes/turtle.recipe.ts';
import { createTurtleEye, createTurtleShellPattern } from '../animation/turtleAppearance.ts';
import { FOX_PAPER_COLOR, FOX_RECIPE } from '../origami/recipes/fox.recipe.ts';
import {
  DINOSAUR_EYE,
  DINOSAUR_EYE_COLOR,
  DINOSAUR_EYE_HIGHLIGHT,
  DINOSAUR_MARK_COLOR,
  DINOSAUR_PAPER_COLOR,
  DINOSAUR_RECIPE,
  dinosaurSpineMarks,
} from '../origami/recipes/dinosaur.recipe.ts';
import {
  LADYBUG_EYES,
  LADYBUG_FEATURE_Z,
  LADYBUG_MARK_COLOR,
  LADYBUG_PAPER_COLOR,
  LADYBUG_RECIPE,
  LADYBUG_SEAM,
  LADYBUG_SPOTS,
} from '../origami/recipes/ladybug.recipe.ts';
import {
  PENGUIN_EYE_COLOR,
  PENGUIN_EYE_HIGHLIGHT,
  PENGUIN_EYE_L,
  PENGUIN_EYE_R,
  PENGUIN_FEATURE_Z,
  PENGUIN_PAPER_COLOR,
  PENGUIN_RECIPE,
} from '../origami/recipes/penguin.recipe.ts';
import { WHALE_RECIPE } from '../origami/recipes/whale.recipe.ts';
import type { MeshSnapshot } from '../origami/types.ts';
import { ANIMALS, type AnimalId } from './animals.ts';

type Tris = number[];

const shared = new Map<string, MeshStandardMaterial>();
const sharedGeo = new Map<string, BufferGeometry>();
let contactShadowMaterial: MeshBasicMaterial | null = null;

function contactShadows(): MeshBasicMaterial {
  if (!contactShadowMaterial) {
    contactShadowMaterial = new MeshBasicMaterial({
      color: new Color('#1a120c'),
      transparent: true,
      opacity: PAPER_DEPTH.contactShadowOpacity,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
      vertexColors: true,
    });
  }
  return contactShadowMaterial;
}

function paperMat(color: string): MeshStandardMaterial {
  const existing = shared.get(color);
  if (existing) {
    return existing;
  }
  const material = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
  });
  shared.set(color, material);
  return material;
}

function paperFromBuilt(built: PaperMeshBuffers, color: string): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(built.normals, 3));
  for (const group of built.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  return new Mesh(geometry, createPaperMaterials(origamiPaperMaterial(color)));
}

function shadowFromBuilt(built: PaperMeshBuffers): Mesh | null {
  if (built.shadowPositions.length < 9) {
    return null;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(built.shadowPositions, 3));
  geometry.setAttribute('color', new BufferAttribute(built.shadowColors, 4));
  const shadow = new Mesh(geometry, contactShadows());
  shadow.renderOrder = 0;
  return shadow;
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
  const vertices: MeshSnapshot['vertices'] = [];
  const faces: MeshSnapshot['faces'] = [];
  layers.forEach((tris, layer) => {
    for (let index = 0; index + 8 < tris.length; index += 9) {
      const base = vertices.length;
      vertices.push(
        [tris[index] ?? 0, tris[index + 1] ?? 0, tris[index + 2] ?? 0],
        [tris[index + 3] ?? 0, tris[index + 4] ?? 0, tris[index + 5] ?? 0],
        [tris[index + 6] ?? 0, tris[index + 7] ?? 0, tris[index + 8] ?? 0],
      );
      faces.push({ id: `poly-${layer}-${index}`, vertices: [base, base + 1, base + 2], layer, materialId: 'paper' });
    }
  });
  const group = new Group();
  const built = buildPaperMesh({ vertices, faces }, true);
  const mesh = paperFromBuilt(built, color);
  group.add(mesh);
  const shadow = shadowFromBuilt(built);
  if (shadow) {
    shadow.name = 'poly-contact-shadow';
    group.add(shadow);
  }
  return fit(group);
}

function quad(x0: number, y0: number, x1: number, y1: number, z = 0): Tris {
  return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
}

function triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, z = 0): Tris {
  return [ax, ay, z, bx, by, z, cx, cy, z];
}

function framedPaper(id: string, snapshot: MeshSnapshot): { paper: BufferGeometry; shadow: BufferGeometry } {
  let paper = sharedGeo.get(`${id}-paper`);
  let shadow = sharedGeo.get(`${id}-shadow`);
  if (paper && shadow) {
    return { paper, shadow };
  }
  const built = buildPaperMesh(snapshot, true);
  paper = new BufferGeometry();
  paper.setAttribute('position', new BufferAttribute(built.positions, 3));
  paper.setAttribute('normal', new BufferAttribute(built.normals, 3));
  for (const group of built.groups) {
    paper.addGroup(group.start, group.count, group.materialIndex);
  }
  shadow = new BufferGeometry();
  const shadowPositions = built.shadowPositions.length >= 9 ? built.shadowPositions : new Float32Array(9);
  const shadowColors = built.shadowColors.length >= 12 ? built.shadowColors : new Float32Array(12);
  shadow.setAttribute('position', new BufferAttribute(shadowPositions, 3));
  shadow.setAttribute('color', new BufferAttribute(shadowColors, 4));
  paper.computeBoundingBox();
  const box = paper.boundingBox;
  if (box) {
    const center = new Vector3();
    box.getCenter(center);
    paper.translate(-center.x, -center.y, -center.z);
    shadow.translate(-center.x, -center.y, -center.z);
    const size = new Vector3();
    box.getSize(size);
    const span = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 0.078 / span;
    paper.scale(scale, scale, scale);
    shadow.scale(scale, scale, scale);
  }
  sharedGeo.set(`${id}-paper`, paper);
  sharedGeo.set(`${id}-shadow`, shadow);
  return { paper, shadow };
}

function addFramedPaper(group: Group, id: string, snapshot: MeshSnapshot, color: string): void {
  const framed = framedPaper(id, snapshot);
  const mesh = new Mesh(framed.paper, createPaperMaterials(origamiPaperMaterial(color)));
  const shadow = new Mesh(framed.shadow, contactShadows());
  mesh.rotation.x = -0.18;
  shadow.rotation.x = -0.18;
  shadow.renderOrder = 0;
  shadow.name = `${id}-contact-shadow`;
  group.add(mesh, shadow);
}

function snapshotModel(id: string, snapshot: MeshSnapshot | undefined, fallbackColor: string): Group {
  const group = new Group();
  if (!snapshot) {
    group.add(meshFromTris(`${id}-fallback`, triangle(-0.05, -0.02, 0.05, -0.02, 0, 0.05), fallbackColor));
    return fit(group);
  }
  addFramedPaper(group, id, snapshot, fallbackColor);
  return group;
}

function whaleModel(): Group {
  return snapshotModel('whale', WHALE_RECIPE.snapshots.whale, FOLD_PAPER_COLOR);
}

function foxModel(): Group {
  return snapshotModel('fox', FOX_RECIPE.snapshots.fox, FOX_PAPER_COLOR);
}

function paperGroupFromSnapshot(snapshot: MeshSnapshot, color: string, name: string): Group {
  const group = new Group();
  const built = buildPaperMesh(snapshot, true);
  const mesh = paperFromBuilt(built, color);
  mesh.name = name;
  group.add(mesh);
  const shadow = shadowFromBuilt(built);
  if (shadow) {
    shadow.name = `${name}-shadow`;
    group.add(shadow);
  }
  return group;
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
    const buckets: Record<'body' | 'left' | 'right', MeshSnapshot['faces']> = { body: [], left: [], right: [] };
    for (const face of snapshot.faces) {
      const pts = face.vertices.map((index) => snapshot.vertices[index]).filter((point) => point != null);
      if (pts.length < 3) {
        continue;
      }
      const cx = pts.reduce((sum, point) => sum + point[0], 0) / pts.length;
      const bucket = cx < -0.028 ? 'left' : cx > 0.028 ? 'right' : 'body';
      buckets[bucket].push(face);
    }
    const add = (parent: Group, faces: MeshSnapshot['faces'], id: string) => {
      if (faces.length === 0) {
        return;
      }
      parent.add(paperGroupFromSnapshot({ ...snapshot, faces }, BAT_PAPER_COLOR, id));
    };
    add(body, buckets.body, 'bat-body');
    add(left, buckets.left, 'bat-left');
    add(right, buckets.right, 'bat-right');
  }
  root.add(body, left, right);
  root.userData.flutterWings = true;
  return fit(root);
}

function turtleModel(): Group {
  const group = new Group();
  const snapshot = TURTLE_RECIPE.snapshots.turtle;
  if (!snapshot) {
    return fit(group);
  }
  const built = buildPaperMesh(snapshot, true);
  const mesh = paperFromBuilt(built, TURTLE_PAPER_COLOR);
  mesh.rotation.x = -0.18;
  group.add(mesh);
  const shadow = shadowFromBuilt(built);
  if (shadow) {
    shadow.rotation.x = -0.18;
    shadow.renderOrder = 0;
    shadow.name = 'turtle-contact-shadow';
    group.add(shadow);
  }
  const decor = new Group();
  decor.name = 'turtle-preview-decor';
  decor.rotation.x = -0.18;
  decor.add(createTurtleShellPattern(), createTurtleEye());
  group.add(decor);
  return fit(group);
}

function dinosaurModel(): Group {
  const group = snapshotModel('dinosaur', DINOSAUR_RECIPE.snapshots.dinosaur, DINOSAUR_PAPER_COLOR);
  const decor = new Group();
  const markMat = paperMat(DINOSAUR_MARK_COLOR);
  for (const mark of dinosaurSpineMarks()) {
    const positions = mark.points.flatMap((point) => [point[0], point[1], point[2]]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    const plate = new Mesh(geometry, markMat);
    plate.position.z = 0.001;
    decor.add(plate);
  }
  const eye = new Mesh(new SphereGeometry(0.0042, 14, 12), paperMat(DINOSAUR_EYE_COLOR));
  const pupil = new Mesh(new SphereGeometry(0.0018, 10, 8), paperMat('#0c0b09'));
  const highlight = new Mesh(new SphereGeometry(0.001, 8, 8), paperMat(DINOSAUR_EYE_HIGHLIGHT));
  eye.position.set(DINOSAUR_EYE[0], DINOSAUR_EYE[1], DINOSAUR_EYE[2]);
  pupil.position.set(DINOSAUR_EYE[0], DINOSAUR_EYE[1], DINOSAUR_EYE[2] + 0.003);
  highlight.position.set(DINOSAUR_EYE[0] + 0.0012, DINOSAUR_EYE[1] + 0.0012, DINOSAUR_EYE[2] + 0.004);
  decor.add(eye, pupil, highlight);
  group.add(decor);
  return group;
}

function frameDecor(snapshot: MeshSnapshot, decor: Group): void {
  const built = buildPaperMesh(snapshot, true);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < built.positions.length; index += 3) {
    const x = built.positions[index] ?? 0;
    const y = built.positions[index + 1] ?? 0;
    const z = built.positions[index + 2] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const scale = 0.078 / span;
  const pivot = new Group();
  pivot.rotation.x = -0.18;
  const fitted = new Group();
  fitted.scale.setScalar(scale);
  for (const child of [...decor.children]) {
    child.position.x -= (minX + maxX) / 2;
    child.position.y -= (minY + maxY) / 2;
    child.position.z -= (minZ + maxZ) / 2;
    fitted.add(child);
  }
  pivot.add(fitted);
  decor.add(pivot);
}

function penguinModel(): Group {
  const snapshot = PENGUIN_RECIPE.snapshots.penguin;
  const group = snapshotModel('penguin', snapshot, PENGUIN_PAPER_COLOR);
  if (!snapshot) {
    return group;
  }
  const decor = new Group();
  decor.name = 'penguin-preview-eyes';
  const pupil = paperMat(PENGUIN_EYE_COLOR);
  const highlight = paperMat(PENGUIN_EYE_HIGHLIGHT);
  for (const at of [PENGUIN_EYE_L, PENGUIN_EYE_R]) {
    const eye = new Mesh(new CircleGeometry(0.0065, 18), pupil);
    const glint = new Mesh(new CircleGeometry(0.0022, 12), highlight);
    eye.position.set(at[0], at[1], PENGUIN_FEATURE_Z);
    glint.position.set(at[0] + 0.002, at[1] + 0.002, PENGUIN_FEATURE_Z + 0.001);
    decor.add(eye, glint);
  }
  frameDecor(snapshot, decor);
  group.add(decor);
  return group;
}

function ladybugModel(): Group {
  const snapshot = LADYBUG_RECIPE.snapshots.ladybug;
  const group = snapshotModel('ladybug', snapshot, LADYBUG_PAPER_COLOR);
  if (!snapshot) {
    return group;
  }
  const decor = new Group();
  decor.name = 'ladybug-preview-decor';
  const mark = paperMat(LADYBUG_MARK_COLOR);
  for (const eye of LADYBUG_EYES) {
    const mesh = new Mesh(new CircleGeometry(eye.radius, 18), mark);
    mesh.position.set(eye.at[0], eye.at[1], LADYBUG_FEATURE_Z);
    decor.add(mesh);
  }
  for (const spot of LADYBUG_SPOTS) {
    const mesh = new Mesh(new CircleGeometry(spot.radius, 18), mark);
    mesh.position.set(spot.at[0], spot.at[1], LADYBUG_FEATURE_Z);
    decor.add(mesh);
  }
  const { from, to, width } = LADYBUG_SEAM;
  const half = width / 2;
  const seamGeo = new BufferGeometry();
  seamGeo.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        from[0] - half, from[1], LADYBUG_FEATURE_Z,
        from[0] + half, from[1], LADYBUG_FEATURE_Z,
        to[0] + half, to[1], LADYBUG_FEATURE_Z,
        from[0] - half, from[1], LADYBUG_FEATURE_Z,
        to[0] + half, to[1], LADYBUG_FEATURE_Z,
        to[0] - half, to[1], LADYBUG_FEATURE_Z,
      ]),
      3,
    ),
  );
  const seam = new Mesh(seamGeo, paperMat(LADYBUG_MARK_COLOR));
  seam.name = 'ladybug-preview-seam';
  decor.add(seam);
  frameDecor(snapshot, decor);
  group.add(decor);
  return group;
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
  turtle: () => turtleModel(),
  dinosaur: () => dinosaurModel(),
  ladybug: () => ladybugModel(),
  penguin: () => penguinModel(),
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
