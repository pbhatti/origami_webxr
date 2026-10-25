import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
  Vector3,
} from 'three';
import {
  TURTLE_CREAM,
  TURTLE_EYE,
  TURTLE_EYE_COLOR,
  TURTLE_EYE_HIGHLIGHT,
  TURTLE_PAPER_COLOR,
  TURTLE_HEX_RADIUS,
  TURTLE_SHELL_ALT,
  turtleShellHexes,
} from '../origami/recipes/turtle.recipe.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';

const HEX_RADIUS = TURTLE_HEX_RADIUS;
const CREAM_Z = 0.0064;
const GREEN_Z = 0.0071;

function mat(color: string, offset = -2): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.72,
    metalness: 0,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

function hexGeometry(radius: number, z: number): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a0 = (Math.PI / 3) * i + Math.PI / 6;
    const a1 = (Math.PI / 3) * (i + 1) + Math.PI / 6;
    positions.push(0, 0, z, Math.cos(a0) * radius, Math.sin(a0) * radius, z, Math.cos(a1) * radius, Math.sin(a1) * radius, z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function shellMarks(): Group {
  const group = new Group();
  group.name = 'turtle-shell';
  const creamGeo = hexGeometry(HEX_RADIUS * 0.98, CREAM_Z);
  const greenGeo = hexGeometry(HEX_RADIUS * 0.8, GREEN_Z);
  const creamMat = mat(TURTLE_CREAM, -1);
  const leafMat = mat(TURTLE_PAPER_COLOR, -3);
  const altMat = mat(TURTLE_SHELL_ALT, -3);
  for (const mark of turtleShellHexes(HEX_RADIUS)) {
    const cream = new Mesh(creamGeo, creamMat);
    const fill = new Mesh(greenGeo, mark.alt ? altMat : leafMat);
    cream.position.set(mark.x, mark.y, 0);
    fill.position.set(mark.x, mark.y, 0);
    cream.renderOrder = 2;
    fill.renderOrder = 3;
    group.add(cream, fill);
  }
  return group;
}

function eye(): Group {
  const group = new Group();
  group.name = 'turtle-eye';
  const ball = new Mesh(new SphereGeometry(0.0092, 20, 16), mat(TURTLE_EYE_COLOR, -4));
  const pupil = new Mesh(new SphereGeometry(0.004, 14, 12), mat('#0c0b09', -4));
  pupil.position.z = 0.0065;
  const highlight = new Mesh(new SphereGeometry(0.0021, 10, 8), mat(TURTLE_EYE_HIGHLIGHT, -5));
  highlight.position.set(0.0024, 0.0026, 0.008);
  group.add(ball, pupil, highlight);
  group.position.set(TURTLE_EYE[0], TURTLE_EYE[1], TURTLE_EYE[2]);
  return group;
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
