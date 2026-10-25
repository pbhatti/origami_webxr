import { Group, type Object3D, Vector3 } from 'three';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { createTurtleEye, createTurtleShellPattern } from './turtleAppearance.ts';

function shellMarks(): Group {
  const group = new Group();
  group.name = 'turtle-shell';
  group.add(createTurtleShellPattern());
  return group;
}

function eye(): Group {
  return createTurtleEye();
}

export class TurtleCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly shell: Group;
  private readonly eyeGroup: Group;
  private elapsed = 0;
  private playing = false;
  private reveal = 0;
  private origin = new Vector3();
  private puppet: Object3D | null = null;
  private readonly puppetHome = new Vector3();
  private readonly motion = new Vector3();
  private held = false;

  constructor() {
    this.group.name = 'fold-play-turtle';
    this.group.visible = false;
    this.shell = shellMarks();
    this.eyeGroup = eye();
    this.features.name = 'turtle-features';
    this.features.visible = false;
    this.features.add(this.shell, this.eyeGroup);
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
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'turtle' });
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
    const tilt = Math.sin(this.elapsed * 0.85) * 0.03;
    this.features.rotation.z = tilt;
    this.puppetMotion(this.motion);
    if (this.puppet) {
      if (!this.held) {
        this.puppet.position.copy(this.puppetHome).add(this.motion);
        this.puppet.rotation.z = tilt * 0.35;
      }
      return;
    }
    this.group.position.set(this.origin.x, this.origin.y + this.motion.y, this.origin.z);
    this.group.rotation.z = tilt * 0.35;
  }

  private puppetMotion(target: Vector3): Vector3 {
    return target.set(0, Math.sin(this.elapsed * 1.05) * 0.004, 0);
  }

  private applyReveal(): void {
    const shown = this.reveal;
    const eyePop = 0.15 + 0.85 * (1 - (1 - Math.min(1, shown / 0.4)) ** 3);
    const shellPop = Math.min(1, Math.max(0, (shown - 0.22) / 0.55));
    this.eyeGroup.scale.setScalar(eyePop);
    this.shell.scale.setScalar(0.2 + 0.8 * shellPop);
    this.features.visible = shown > 0.02;
  }
}
