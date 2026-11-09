import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';
import { createPaperMaterials, origamiPaperMaterial } from '../origami/OrigamiPaperMaterial.ts';
import { PAPER_DEPTH, buildPaperMesh, type PaperMeshBuffers } from '../origami/paperDepth.ts';
import { BAT_PAPER_COLOR, BAT_RECIPE } from '../origami/recipes/bat.recipe.ts';
import {
  OWL_EYE_COLOR,
  OWL_EYE_X,
  OWL_EYE_Y,
  OWL_FEATHER_COLOR,
  OWL_FEATHER_YS,
  OWL_FEATURE_Z,
  OWL_PAPER_COLOR,
  OWL_PUPIL_COLOR,
  OWL_RECIPE,
  OWL_WING_FEATHER_X,
} from '../origami/recipes/owl.recipe.ts';
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
  const snapshot = DINOSAUR_RECIPE.snapshots.dinosaur;
  const group = snapshotModel('dinosaur', snapshot, DINOSAUR_PAPER_COLOR);
  if (!snapshot) {
    return group;
  }
  const decor = new Group();
  decor.name = 'dinosaur-preview-decor';
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
  eye.name = 'dinosaur-preview-eye';
  eye.position.set(DINOSAUR_EYE[0], DINOSAUR_EYE[1], DINOSAUR_EYE[2]);
  pupil.position.set(DINOSAUR_EYE[0], DINOSAUR_EYE[1], DINOSAUR_EYE[2] + 0.003);
  highlight.position.set(DINOSAUR_EYE[0] + 0.0012, DINOSAUR_EYE[1] + 0.0012, DINOSAUR_EYE[2] + 0.004);
  decor.add(eye, pupil, highlight);
  frameDecor(snapshot, decor);
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
  const snapshot = OWL_RECIPE.snapshots.owl;
  const group = snapshotModel('owl', snapshot, OWL_PAPER_COLOR);
  if (!snapshot) {
    return group;
  }
  const decor = new Group();
  decor.name = 'owl-preview-decor';
  const eyeMat = paperMat(OWL_EYE_COLOR);
  const pupilMat = paperMat(OWL_PUPIL_COLOR);
  const featherMat = paperMat(OWL_FEATHER_COLOR);
  for (const x of [-OWL_EYE_X, OWL_EYE_X]) {
    const eye = new Mesh(new CircleGeometry(0.014, 18), eyeMat);
    const pupil = new Mesh(new CircleGeometry(0.0065, 14), pupilMat);
    eye.position.set(x, OWL_EYE_Y, OWL_FEATURE_Z);
    pupil.position.set(x, OWL_EYE_Y, OWL_FEATURE_Z + 0.001);
    decor.add(eye, pupil);
  }
  OWL_FEATHER_YS.forEach((y, index) => {
    const xOffset = OWL_WING_FEATHER_X - index * 0.003;
    for (const sign of [-1, 1] as const) {
      const arc = new Mesh(
        new RingGeometry(0.0065, 0.0088, 18, 1, Math.PI * 1.15, Math.PI * 0.7),
        featherMat,
      );
      arc.position.set(sign * xOffset, y, OWL_FEATURE_Z + 0.001);
      arc.rotation.z = sign * 0.18;
      decor.add(arc);
    }
  });
  frameDecor(snapshot, decor);
  group.add(decor);
  return group;
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
