import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';

const BODY_COLOR = FOLD_PAPER_COLOR;

function paperMat(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.9,
    metalness: 0.02,
    side: DoubleSide,
  });
}

function whaleShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.09, 0.008);
  shape.lineTo(-0.07, 0.028);
  shape.lineTo(0.04, 0.022);
  shape.lineTo(0.08, 0.07);
  shape.lineTo(0.07, 0.012);
  shape.lineTo(0.085, 0);
  shape.lineTo(0.04, -0.01);
  shape.lineTo(-0.07, -0.008);
  shape.closePath();
  return shape;
}

export class WhaleCreature {
  readonly group = new Group();
  private readonly eye: Mesh;
  private elapsed = 0;
  private playing = false;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();

  constructor() {
    this.group.name = 'fold-fly-whale';
    this.group.visible = false;

    const body = new Mesh(new ShapeGeometry(whaleShape(), 12), paperMat(BODY_COLOR));
    body.position.z = 0.001;

    this.eye = new Mesh(
      new SphereGeometry(0.006, 10, 8),
      new MeshStandardMaterial({ color: '#1b1410', roughness: 0.6 }),
    );
    this.eye.position.set(-0.072, 0.016, 0.004);
    this.group.add(body, this.eye);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.origin.copy(from);
    this.puppet = puppet ?? null;
    this.elapsed = 0;
    this.playing = true;
    if (puppet) {
      this.puppetHome.copy(puppet.position);
      this.group.visible = false;
      this.attachEye(puppet);
    } else {
      this.group.position.copy(from);
      this.group.scale.setScalar(0.2);
      this.group.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z] });
  }

  stop(): void {
    this.playing = false;
    this.group.visible = false;
    this.group.scale.setScalar(1);
    this.elapsed = 0;
    this.eye.removeFromParent();
    this.group.add(this.eye);
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
    const tailWag = Math.sin(this.elapsed * 3.4) * 0.16;
    if (this.puppet) {
      const lift = Math.min(this.elapsed / 0.8, 1) * 0.12;
      const sway = Math.sin(this.elapsed * 1.6) * 0.03;
      this.puppet.position.set(
        this.puppetHome.x + sway,
        this.puppetHome.y + lift + Math.sin(this.elapsed * 1.3) * 0.012,
        this.puppetHome.z + Math.sin(this.elapsed * 0.9) * 0.04,
      );
      this.puppet.rotation.z = tailWag * 0.15;
      this.puppet.rotation.y = Math.sin(this.elapsed * 1.1) * 0.12;
      return;
    }
    const appear = Math.min(this.elapsed / 0.35, 1);
    this.group.scale.setScalar(0.2 + 0.8 * appear);
    const t = Math.min(this.elapsed / 4, 1);
    const sway = Math.sin(this.elapsed * 2.1) * 0.08;
    const loop = Math.sin(this.elapsed * 1.15) * 0.18;
    const forward = -0.12 * Math.sin(t * Math.PI);
    this.group.position.set(
      this.origin.x + sway,
      this.origin.y + 0.12 + 0.02 * Math.sin(this.elapsed * 1.4),
      this.origin.z + forward + loop * 0.15,
    );
    this.group.rotation.y = sway * 0.8;
    this.group.rotation.z = tailWag * 0.2;
    if (this.elapsed >= 4) {
      this.group.position.lerp(this.origin, 0.08);
    }
  }

  private attachEye(puppet: Object3D): void {
    this.eye.removeFromParent();
    this.eye.position.set(-0.09, 0.02, 0.004);
    puppet.add(this.eye);
  }
}
