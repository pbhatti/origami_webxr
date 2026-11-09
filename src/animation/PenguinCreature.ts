import { CircleGeometry, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, type Object3D, type Vector3 } from 'three';
import {
  PENGUIN_EYE_COLOR,
  PENGUIN_EYE_HIGHLIGHT,
  PENGUIN_EYE_L,
  PENGUIN_EYE_R,
  PENGUIN_FEATURE_Z,
} from '../origami/recipes/penguin.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

function mat(color: string, offset: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.45,
    metalness: 0,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

function eye(at: readonly [number, number, number]): Group {
  const group = new Group();
  const pupil = new Mesh(new CircleGeometry(0.0098, 24), mat(PENGUIN_EYE_COLOR, -4));
  const highlight = new Mesh(new CircleGeometry(0.0034, 14), mat(PENGUIN_EYE_HIGHLIGHT, -6));
  pupil.position.set(at[0], at[1], PENGUIN_FEATURE_Z);
  highlight.position.set(at[0] + 0.0024, at[1] + 0.0024, PENGUIN_FEATURE_Z + 0.001);
  pupil.renderOrder = 3;
  highlight.renderOrder = 4;
  group.add(pupil, highlight);
  return group;
}

export class PenguinCreature {
  readonly group = new Group();
  private readonly features = new Group();
  private readonly eyeGroup: Group;
  private elapsed = 0;
  private playing = false;
  private reveal = 0;
  private held = false;
  private puppet: Object3D | null = null;

  constructor() {
    this.group.name = 'fold-play-penguin';
    this.group.visible = false;
    this.eyeGroup = new Group();
    this.eyeGroup.name = 'penguin-eyes';
    this.eyeGroup.add(eye(PENGUIN_EYE_L), eye(PENGUIN_EYE_R));
    this.features.name = 'penguin-features';
    this.features.visible = false;
    this.features.add(this.eyeGroup);
    this.group.add(this.features);
  }

  start(from: Vector3, puppet?: Object3D): void {
    this.elapsed = 0;
    this.playing = true;
    this.reveal = 1;
    this.applyReveal();
    this.puppet = puppet ?? null;
    if (puppet) {
      this.group.visible = false;
      this.present(puppet, true);
    } else {
      this.group.position.copy(from);
      this.group.visible = true;
      this.features.visible = true;
    }
    debugEvents.emit('creatureStarted', { at: [from.x, from.y, from.z], animal: 'penguin' });
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
      this.puppet.rotation.set(0, 0, 0);
    }
    this.puppet = null;
    this.held = false;
  }

  get active(): boolean {
    return this.playing;
  }

  setHeld(held: boolean): void {
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
    if (!this.playing || !this.puppet) {
      return;
    }
    if (this.held) {
      this.puppet.rotation.y = 0;
      this.puppet.rotation.z = 0;
      return;
    }
    this.elapsed += dtSec;
    this.puppet.rotation.z = Math.sin(this.elapsed * 1.4) * 0.045;
    this.puppet.rotation.y = Math.sin(this.elapsed) * 0.08;
  }

  private applyReveal(): void {
    const shown = this.reveal;
    const eyePop = 0.15 + 0.85 * (1 - (1 - Math.min(1, shown / 0.4)) ** 3);
    this.eyeGroup.scale.setScalar(eyePop);
    this.features.visible = shown > 0.02;
  }
}
