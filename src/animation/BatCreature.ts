import {
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
import { debugEvents } from '../telemetry/DebugEvents.ts';

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

export class BatCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly leftEye: Mesh;
  private readonly rightEye: Mesh;
  private readonly smile: Mesh;
  private readonly leftFang: Mesh;
  private readonly rightFang: Mesh;
  private elapsed = 0;
  private playing = false;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();
  private reveal = 1;

  constructor() {
    this.group.name = 'fold-fly-bat';
    this.group.visible = false;
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
    this.group.add(this.features);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.origin.copy(from);
    this.puppet = puppet ?? null;
    this.elapsed = 0;
    this.playing = true;
    if (puppet) {
      this.puppetHome.copy(puppet.position);
      this.group.visible = false;
      this.presentFace(puppet, true);
      this.setReveal(1);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'bat' });
  }

  stop(): void {
    this.playing = false;
    this.group.visible = false;
    this.elapsed = 0;
    this.leftEye.scale.y = 1;
    this.rightEye.scale.y = 1;
    this.features.removeFromParent();
    this.group.add(this.features);
    this.features.visible = false;
    if (this.puppet) {
      this.puppet.position.copy(this.puppetHome);
      this.puppet.rotation.set(0, 0, 0);
    }
    this.puppet = null;
  }

  get active(): boolean {
    return this.playing;
  }

  setHeld(_held: boolean): void {}

  tick(dtSec: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsed += dtSec;
    const blink = Math.pow(Math.max(0, Math.sin(this.elapsed * 1.7)), 18);
    const eye = 1 - blink * 0.92;
    this.leftEye.scale.y = eye;
    this.rightEye.scale.y = eye;
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
}
