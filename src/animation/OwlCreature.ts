import {
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
  Vector3,
} from 'three';
import {
  OWL_BEAK,
  OWL_BEAK_COLOR,
  OWL_EYE_COLOR,
  OWL_EYE_X,
  OWL_EYE_Y,
  OWL_FEATURE_Z,
  OWL_FOOT_X,
  OWL_FOOT_Y,
  OWL_PUPIL_COLOR,
} from '../origami/recipes/owl.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

function mat(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.45,
    metalness: 0.02,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function eye(): Group {
  const group = new Group();
  const ball = new Mesh(new SphereGeometry(0.011, 18, 14), mat(OWL_EYE_COLOR));
  const pupil = new Mesh(new SphereGeometry(0.0042, 12, 10), mat(OWL_PUPIL_COLOR));
  pupil.position.z = 0.008;
  const lid = new Mesh(new SphereGeometry(0.0114, 14, 10), mat(OWL_PUPIL_COLOR));
  lid.name = 'owl-lid';
  lid.scale.set(1.05, 0.22, 0.45);
  lid.position.set(0, 0.006, 0.006);
  group.add(ball, pupil, lid);
  return group;
}

function foot(): Mesh {
  const mesh = new Mesh(new SphereGeometry(0.008, 12, 10), mat(OWL_EYE_COLOR));
  mesh.scale.set(1.15, 0.55, 0.7);
  return mesh;
}

export class OwlCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly leftEye: Group;
  private readonly rightEye: Group;
  private readonly beak: Mesh;
  private readonly leftFoot: Mesh;
  private readonly rightFoot: Mesh;
  private elapsed = 0;
  private playing = false;
  private reveal = 0;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();
  private readonly motion = new Vector3();
  private held = false;

  constructor() {
    this.group.name = 'fold-play-owl';
    this.group.visible = false;
    this.leftEye = eye();
    this.rightEye = eye();
    this.leftEye.position.set(-OWL_EYE_X, OWL_EYE_Y, OWL_FEATURE_Z);
    this.rightEye.position.set(OWL_EYE_X, OWL_EYE_Y, OWL_FEATURE_Z);
    this.beak = new Mesh(new ConeGeometry(0.008, 0.016, 4), mat(OWL_BEAK_COLOR));
    this.beak.rotation.x = Math.PI;
    this.beak.rotation.y = Math.PI / 4;
    this.beak.position.set(OWL_BEAK[0], OWL_BEAK[1], OWL_FEATURE_Z + 0.002);
    this.leftFoot = foot();
    this.rightFoot = foot();
    this.leftFoot.name = 'owl-foot-left';
    this.rightFoot.name = 'owl-foot-right';
    this.leftFoot.position.set(-OWL_FOOT_X, OWL_FOOT_Y, OWL_FEATURE_Z);
    this.rightFoot.position.set(OWL_FOOT_X, OWL_FOOT_Y, OWL_FEATURE_Z);
    this.features.name = 'owl-features';
    this.features.visible = false;
    this.features.add(this.leftEye, this.rightEye, this.beak, this.leftFoot, this.rightFoot);
    this.group.add(this.features);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.origin.copy(from);
    this.puppet = puppet ?? null;
    this.elapsed = 0;
    this.playing = true;
    this.reveal = 1;
    this.applyReveal();
    if (puppet) {
      this.puppetHome.copy(puppet.position);
      this.group.visible = false;
      this.present(puppet, true);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'owl' });
  }

  stop(): void {
    this.playing = false;
    this.reveal = 0;
    this.elapsed = 0;
    this.group.visible = false;
    this.features.visible = false;
    this.features.removeFromParent();
    this.group.add(this.features);
    this.features.position.set(0, 0, 0);
    this.features.rotation.set(0, 0, 0);
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

  setReveal(amount: number): void {
    this.reveal = Math.min(1, Math.max(0, amount));
    this.applyReveal();
  }

  present(host: Object3D, visible: boolean): void {
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
    this.features.visible = this.reveal > 0.02;
  }

  tick(dtSec: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsed += dtSec;
    const blink = Math.pow(Math.max(0, Math.sin(this.elapsed * 1.7)), 18);
    for (const eyeGroup of [this.leftEye, this.rightEye]) {
      const lid = eyeGroup.getObjectByName('owl-lid');
      if (lid) {
        lid.scale.y = 0.22 + blink * 0.9;
      }
    }
    this.features.rotation.z = Math.sin(this.elapsed * 0.8) * 0.08;
    this.leftFoot.rotation.z = Math.sin(this.elapsed * 6.5) * 0.35;
    this.rightFoot.rotation.z = -Math.sin(this.elapsed * 6.5 + 0.6) * 0.35;
    const bob = Math.sin(this.elapsed * 1.5) * 0.008;
    const flutter = Math.sin(this.elapsed * 2.2) * 0.03;
    if (this.puppet) {
      if (!this.held) {
        this.puppetMotion(this.motion);
        this.puppet.position.copy(this.puppetHome).add(this.motion);
        this.puppet.rotation.y = flutter;
      }
      return;
    }
    this.group.position.set(this.origin.x, this.origin.y + bob, this.origin.z);
    this.group.rotation.y = flutter;
  }

  private puppetMotion(target: Vector3): Vector3 {
    return target.set(0, Math.sin(this.elapsed * 1.5) * 0.008, 0);
  }

  private applyReveal(): void {
    const shown = this.reveal;
    const pop = 0.2 + 0.8 * (1 - (1 - Math.min(1, shown / 0.45)) ** 3);
    const beakPop = Math.min(1, Math.max(0, (shown - 0.28) / 0.4));
    const footPop = Math.min(1, Math.max(0, (shown - 0.5) / 0.5));
    this.leftEye.scale.setScalar(pop);
    this.rightEye.scale.setScalar(pop);
    this.beak.scale.setScalar(0.2 + 0.8 * beakPop);
    this.leftFoot.scale.set(1.15 * footPop, 0.55 * footPop, 0.7 * footPop);
    this.rightFoot.scale.set(1.15 * footPop, 0.55 * footPop, 0.7 * footPop);
    const drop = (1 - footPop) * 0.012;
    this.leftFoot.position.y = OWL_FOOT_Y - drop;
    this.rightFoot.position.y = OWL_FOOT_Y - drop;
    const bounce = Math.sin(Math.min(1, shown) * Math.PI) * 0.012;
    this.features.position.y = bounce;
    this.features.visible = shown > 0.02;
  }
}
