import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type Object3D,
  Vector3,
} from 'three';
import { FOX_EYE_X, FOX_EYE_Y, FOX_FEATURE_Z, FOX_NOSE_MARK_Y } from '../origami/foxFinalShape.ts';
import { FOX_PAPER_COLOR } from '../origami/recipes/fox.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

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

function smileEye(): Mesh {
  const arc = Math.PI * 0.62;
  const mesh = new Mesh(new TorusGeometry(0.011, 0.0016, 8, 18, arc), ink());
  mesh.rotation.z = -Math.PI / 2 - arc / 2;
  return mesh;
}

export class FoxCreature {
  readonly group = new Group();
  private readonly leftEye: Mesh;
  private readonly rightEye: Mesh;
  private readonly nose: Mesh;
  private readonly features = new Group();
  private elapsed = 0;
  private playing = false;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();
  private readonly motion = new Vector3();
  private held = false;

  constructor() {
    this.group.name = 'fold-fly-fox';
    this.group.visible = false;
    this.leftEye = smileEye();
    this.rightEye = smileEye();
    this.nose = new Mesh(new CircleGeometry(0.009, 24), ink());
    this.leftEye.name = 'fox-eye-left';
    this.rightEye.name = 'fox-eye-right';
    this.nose.name = 'fox-nose';
    this.leftEye.position.set(-FOX_EYE_X, FOX_EYE_Y, FOX_FEATURE_Z);
    this.rightEye.position.set(FOX_EYE_X, FOX_EYE_Y, FOX_FEATURE_Z);
    this.nose.position.set(0, FOX_NOSE_MARK_Y, FOX_FEATURE_Z - 0.0004);
    this.features.name = 'fox-face';
    this.features.visible = false;
    this.features.add(this.leftEye, this.rightEye, this.nose);
    const body = new Mesh(new SphereGeometry(0.001, 4, 4), paperMat(FOX_PAPER_COLOR));
    body.visible = false;
    this.group.add(body, this.features);
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
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'fox' });
  }

  stop(): void {
    this.playing = false;
    this.group.visible = false;
    this.elapsed = 0;
    this.features.removeFromParent();
    this.group.add(this.features);
    if (this.puppet) {
      this.puppet.position.copy(this.puppetHome);
      this.puppet.rotation.set(0, 0, 0);
    }
    this.held = false;
    this.puppet = null;
  }

  get active(): boolean {
    return this.playing;
  }

  setHeld(held: boolean): void {
    if (held === this.held) {
      return;
    }
    if (this.held && !held && this.puppet) {
      this.puppetMotion(this.motion);
      this.puppetHome.copy(this.puppet.position).sub(this.motion);
    }
    this.held = held;
  }

  tick(dtSec: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsed += dtSec;
    if (this.puppet) {
      if (this.held) {
        return;
      }
      this.puppetMotion(this.motion);
      this.puppet.position.copy(this.puppetHome).add(this.motion);
      this.puppet.rotation.z = Math.sin(this.elapsed * 0.9) * 0.03;
      return;
    }
    const bob = Math.sin(this.elapsed * 1.4) * 0.008;
    this.group.position.set(this.origin.x, this.origin.y + 0.04 + bob, this.origin.z);
  }

  private puppetMotion(target: Vector3): Vector3 {
    return target.set(0, Math.sin(this.elapsed * 1.4) * 0.008, 0);
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
