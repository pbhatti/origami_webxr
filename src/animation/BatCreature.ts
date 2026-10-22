import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type Object3D,
  Vector3,
} from 'three';
import { BAT_EYE_X, BAT_EYE_Y, BAT_FACE_Z } from '../origami/batFinalShape.ts';
import { BAT_PAPER_COLOR } from '../origami/recipes/bat.recipe.ts';
import type { MeshSnapshot } from '../origami/types.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

const LIFT_M = 0.07;
const FLY_DELAY_SEC = 1.15;
const FLY_DURATION_SEC = 4.2;
const SAFE_TOWARD_M = 0.04;
const SAFE_AWAY_M = 0.14;
const SAFE_SIDE_M = 0.2;

function paperMat(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.9,
    metalness: 0.02,
    side: DoubleSide,
  });
}

function ink(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#1b1410',
    roughness: 0.55,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function sleepyEye(): Mesh {
  const arc = Math.PI * 0.7;
  const mesh = new Mesh(new TorusGeometry(0.009, 0.0015, 8, 16, arc), ink());
  mesh.rotation.z = -Math.PI / 2 - arc / 2;
  return mesh;
}

function fang(): Mesh {
  const mesh = new Mesh(new ConeGeometry(0.0032, 0.01, 8), ink());
  mesh.rotation.x = Math.PI;
  return mesh;
}

function geometryFromSnapshot(snapshot: MeshSnapshot, predicate: (x: number, y: number) => boolean): BufferGeometry {
  const positions: number[] = [];
  for (const face of snapshot.faces) {
    const pts = face.vertices.map((index) => snapshot.vertices[index]).filter(Boolean) as Array<[number, number, number]>;
    if (pts.length < 3) {
      continue;
    }
    const cx = pts.reduce((sum, point) => sum + point[0], 0) / pts.length;
    const cy = pts.reduce((sum, point) => sum + point[1], 0) / pts.length;
    if (!predicate(cx, cy)) {
      continue;
    }
    const lift = face.layer * 0.00065;
    const origin = pts[0]!;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const b = pts[i]!;
      const c = pts[i + 1]!;
      positions.push(origin[0], origin[1], origin[2] + lift, b[0], b[1], b[2] + lift, c[0], c[1], c[2] + lift);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions.length ? positions : [0, 0, 0, 0.001, 0, 0, 0, 0.001, 0]), 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class BatCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly leftEye: Mesh;
  private readonly rightEye: Mesh;
  private readonly smile: Mesh;
  private readonly leftFang: Mesh;
  private readonly rightFang: Mesh;
  private readonly rig = new Group();
  private readonly leftWing = new Group();
  private readonly rightWing = new Group();
  private elapsed = 0;
  private playing = false;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();
  private hiddenPaper: Object3D | null = null;
  private reveal = 1;

  constructor() {
    this.group.name = 'fold-fly-bat';
    this.group.visible = false;
    this.rig.name = 'bat-flight-rig';
    this.leftWing.name = 'bat-wing-left';
    this.rightWing.name = 'bat-wing-right';
    this.leftEye = sleepyEye();
    this.rightEye = sleepyEye();
    this.smile = new Mesh(new TorusGeometry(0.014, 0.0014, 8, 18, Math.PI * 0.55), ink());
    this.smile.rotation.z = Math.PI + (Math.PI - Math.PI * 0.55) / 2;
    this.leftFang = fang();
    this.rightFang = fang();
    this.leftEye.position.set(-BAT_EYE_X, BAT_EYE_Y, BAT_FACE_Z);
    this.rightEye.position.set(BAT_EYE_X, BAT_EYE_Y, BAT_FACE_Z);
    this.smile.position.set(0, BAT_EYE_Y - 0.016, BAT_FACE_Z);
    this.leftFang.position.set(-0.006, BAT_EYE_Y - 0.022, BAT_FACE_Z + 0.0004);
    this.rightFang.position.set(0.006, BAT_EYE_Y - 0.022, BAT_FACE_Z + 0.0004);
    this.features.name = 'bat-face';
    this.features.visible = false;
    this.features.add(this.leftEye, this.rightEye, this.smile, this.leftFang, this.rightFang);
    this.group.add(this.rig, this.features);
  }

  start(from: Vector3, puppet?: Object3D, snapshot?: MeshSnapshot): void {
    this.origin.copy(from);
    this.puppet = puppet ?? null;
    this.elapsed = 0;
    this.playing = true;
    this.buildRig(snapshot);
    if (puppet) {
      this.puppetHome.copy(puppet.position);
      this.group.visible = false;
      this.presentFace(puppet, true);
      this.attachRig(puppet);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
      this.rig.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'bat' });
  }

  stop(): void {
    this.playing = false;
    this.group.visible = false;
    this.elapsed = 0;
    this.features.removeFromParent();
    this.group.add(this.features);
    this.features.visible = false;
    this.detachRig();
    if (this.puppet) {
      this.puppet.position.copy(this.puppetHome);
      this.puppet.rotation.set(0, 0, 0);
    }
    this.puppet = null;
  }

  get active(): boolean {
    return this.playing;
  }

  tick(dtSec: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsed += dtSec;
    const flap = Math.sin(this.elapsed * 9.2) * 0.42;
    this.leftWing.rotation.y = flap;
    this.rightWing.rotation.y = -flap;
    const lift = Math.min(this.elapsed / 0.85, 1) * LIFT_M;
    let x = 0;
    let z = 0;
    if (this.elapsed > FLY_DELAY_SEC) {
      const u = Math.min((this.elapsed - FLY_DELAY_SEC) / FLY_DURATION_SEC, 1);
      const angle = u * Math.PI * 2;
      x = Math.sin(angle) * SAFE_SIDE_M;
      z = -SAFE_AWAY_M * (1 - Math.cos(angle)) * 0.5;
    }
    z = Math.min(SAFE_TOWARD_M, Math.max(-SAFE_AWAY_M, z));
    const bob = Math.sin(this.elapsed * 1.6) * 0.01;
    if (this.puppet) {
      this.puppet.position.set(this.puppetHome.x + x, this.puppetHome.y + lift + bob, this.puppetHome.z + z);
      this.puppet.rotation.z = Math.sin(this.elapsed * 1.1) * 0.04;
      this.puppet.rotation.y = x * 0.35;
      return;
    }
    this.group.position.set(this.origin.x + x, this.origin.y + lift + bob, this.origin.z + z);
  }

  setReveal(amount: number): void {
    this.reveal = Math.min(1, Math.max(0, amount));
    const scale = 0.2 + 0.8 * (1 - (1 - this.reveal) ** 3);
    this.features.scale.setScalar(this.reveal >= 1 ? 1 : scale);
  }

  presentFace(host: Object3D, visible: boolean): void {
    if (!visible) {
      if (!this.playing) {
        this.features.visible = false;
      }
      return;
    }
    if (this.features.parent !== host) {
      this.features.removeFromParent();
      host.add(this.features);
    }
    this.features.visible = true;
  }

  private buildRig(snapshot?: MeshSnapshot): void {
    this.rig.clear();
    this.leftWing.clear();
    this.rightWing.clear();
    const source = snapshot;
    if (!source) {
      return;
    }
    const body = new Mesh(geometryFromSnapshot(source, (x) => Math.abs(x) <= 0.028), paperMat(BAT_PAPER_COLOR));
    const left = new Mesh(geometryFromSnapshot(source, (x) => x < -0.028), paperMat(BAT_PAPER_COLOR));
    const right = new Mesh(geometryFromSnapshot(source, (x) => x > 0.028), paperMat(BAT_PAPER_COLOR));
    body.name = 'bat-rig-body';
    this.leftWing.add(left);
    this.rightWing.add(right);
    this.rig.add(body, this.leftWing, this.rightWing);
  }

  private attachRig(puppet: Object3D): void {
    this.hiddenPaper = puppet.getObjectByName('paper-faces') ?? null;
    if (this.hiddenPaper) {
      this.hiddenPaper.visible = false;
    }
    this.rig.removeFromParent();
    puppet.add(this.rig);
    this.rig.visible = true;
  }

  private detachRig(): void {
    if (this.hiddenPaper) {
      this.hiddenPaper.visible = true;
      this.hiddenPaper = null;
    }
    this.rig.removeFromParent();
    this.group.add(this.rig);
    this.rig.visible = false;
  }
}
