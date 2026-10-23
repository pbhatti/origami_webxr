import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { BAT_EAR_CUT_PATH, BAT_PAPER_COLOR } from './recipes/bat.recipe.ts';
import type { Vec3 } from './types.ts';

export type CutVisualState =
  | 'HIDDEN'
  | 'SPAWNING'
  | 'READY'
  | 'HOVERED'
  | 'CUTTING'
  | 'CUT_COMPLETE'
  | 'DISAPPEARING';

export const BAT_CUT_INSPECTOR = {
  path: false,
  collider: false,
  geometry: false,
  layers: false,
};

const SPAWN_MS = 280;
const CUT_MS = 980;
const FADE_MS = 420;
const HIT_RADIUS_M = 0.032;

const _world = new Vector3();
const _local = new Vector3();
const _origin = new Vector3();
const _dir = new Vector3();

export class ScissorsCut {
  readonly group = new Group();
  private state: CutVisualState = 'HIDDEN';
  private elapsed = 0;
  private hover = false;
  private commitPending = false;
  private readonly blades: [Mesh, Mesh];
  private readonly guide: Line;
  private readonly scrap: Mesh;
  private readonly collider: Mesh;
  private readonly notchWire: Line;
  private readonly home = new Vector3();
  private audio: AudioContext | null = null;

  constructor() {
    this.group.name = 'fold-fly-scissors';
    this.group.visible = false;
    const anchor = pathAnchor(BAT_EAR_CUT_PATH);
    this.group.position.set(anchor[0] + 0.018, anchor[1] + 0.004, 0.02);
    this.home.copy(this.group.position);

    const handleMat = new MeshStandardMaterial({ color: '#fff6ec', roughness: 0.45, metalness: 0.08 });
    const bladeMat = new MeshStandardMaterial({ color: '#c9c2bc', roughness: 0.28, metalness: 0.55, side: DoubleSide });
    const leftHandle = new Mesh(new TorusGeometry(0.006, 0.0014, 8, 16), handleMat);
    const rightHandle = new Mesh(new TorusGeometry(0.006, 0.0014, 8, 16), handleMat.clone());
    leftHandle.position.set(-0.007, -0.012, 0);
    rightHandle.position.set(0.007, -0.012, 0);
    const leftBlade = new Mesh(new BoxGeometry(0.003, 0.02, 0.0012), bladeMat);
    const rightBlade = new Mesh(new BoxGeometry(0.003, 0.02, 0.0012), bladeMat.clone());
    leftBlade.position.y = 0.008;
    rightBlade.position.y = 0.008;
    leftBlade.geometry.translate(0, 0.01, 0);
    rightBlade.geometry.translate(0, 0.01, 0);
    const screw = new Mesh(
      new SphereGeometry(0.0022, 10, 8),
      new MeshStandardMaterial({ color: '#ff922e', roughness: 0.35, metalness: 0.2 }),
    );
    this.blades = [leftBlade, rightBlade];
    this.group.add(leftHandle, rightHandle, leftBlade, rightBlade, screw);
    this.setBlade(0.42);

    this.guide = dashedPath(BAT_EAR_CUT_PATH, '#ff922e');
    this.guide.position.z = 0.006;
    this.guide.visible = false;

    this.scrap = scrapTriangle(BAT_EAR_CUT_PATH);
    this.scrap.visible = false;

    this.collider = new Mesh(
      new SphereGeometry(HIT_RADIUS_M, 12, 8),
      new MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.collider.visible = false;
    this.collider.raycast = () => {};

    this.notchWire = dashedPath(BAT_EAR_CUT_PATH, '#22d3ee');
    this.notchWire.visible = false;
    this.group.add(this.collider);
  }

  attach(parent: Group): void {
    parent.add(this.group, this.guide, this.scrap, this.notchWire);
  }

  get visualState(): CutVisualState {
    return this.state;
  }

  get progress(): number {
    if (this.state === 'CUTTING') {
      return Math.min(1, this.elapsed / CUT_MS);
    }
    if (this.state === 'CUT_COMPLETE' || this.state === 'DISAPPEARING') {
      return 1;
    }
    return 0;
  }

  get done(): boolean {
    return this.state === 'CUT_COMPLETE' || this.state === 'DISAPPEARING' || this.commitPending;
  }

  get blocksPaperFold(): boolean {
    return this.state !== 'HIDDEN';
  }

  reset(): void {
    this.state = 'HIDDEN';
    this.elapsed = 0;
    this.hover = false;
    this.commitPending = false;
    this.group.visible = false;
    this.group.position.copy(this.home);
    this.group.scale.setScalar(1);
    this.scrap.visible = false;
    this.scrap.position.set(0, 0, 0.01);
    this.guide.visible = false;
    this.notchWire.visible = false;
    this.collider.visible = false;
  }

  setHover(hovered: boolean): void {
    this.hover = hovered;
  }

  sync(stepId: string | null): void {
    if (stepId !== 'bat-notch') {
      if (this.state !== 'HIDDEN' && this.state !== 'DISAPPEARING' && this.state !== 'CUTTING' && this.state !== 'CUT_COMPLETE') {
        this.reset();
      }
      return;
    }
    if (this.state === 'HIDDEN') {
      this.state = 'SPAWNING';
      this.elapsed = 0;
      this.group.visible = true;
      this.group.scale.setScalar(0.2);
    }
  }

  begin(): boolean {
    if (this.state !== 'READY' && this.state !== 'HOVERED') {
      return false;
    }
    this.state = 'CUTTING';
    this.elapsed = 0;
    this.playSnip();
    return true;
  }

  tick(dtMs: number): void {
    const dt = Math.max(0, dtMs);
    if (this.state === 'SPAWNING') {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / SPAWN_MS);
      this.group.visible = true;
      this.group.scale.setScalar(0.2 + 0.8 * t);
      this.guide.visible = t > 0.4;
      if (t >= 1) {
        this.state = this.hover ? 'HOVERED' : 'READY';
        this.elapsed = 0;
      }
    } else if (this.state === 'READY' || this.state === 'HOVERED') {
      this.elapsed += dt;
      this.state = this.hover ? 'HOVERED' : 'READY';
      const bob = Math.sin(this.elapsed / 280) * 0.003;
      this.group.position.z = 0.02 + bob;
      this.group.scale.setScalar(this.state === 'HOVERED' ? 1.08 : 1);
    } else if (this.state === 'CUTTING') {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / CUT_MS);
      this.followPath(t);
      this.setBlade(0.08 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.5);
      this.scrap.visible = t > 0.42;
      if (this.scrap.visible) {
        const away = (t - 0.42) / 0.58;
        this.scrap.position.set(0, away * 0.03, 0.01 + away * 0.02);
        (this.scrap.material as MeshBasicMaterial).opacity = 1 - away;
      }
      if (t >= 1) {
        this.state = 'CUT_COMPLETE';
        this.commitPending = true;
        this.elapsed = 0;
      }
    } else if (this.state === 'CUT_COMPLETE') {
      this.elapsed += dt;
      if (this.elapsed > 80) {
        this.state = 'DISAPPEARING';
        this.elapsed = 0;
      }
    } else if (this.state === 'DISAPPEARING') {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / FADE_MS);
      this.group.scale.setScalar(1 - t);
      this.scrap.visible = t < 1;
      if (t >= 1) {
        this.reset();
      }
    }
    this.syncDebug();
    this.tint(this.state === 'HOVERED' || this.state === 'CUTTING');
  }

  consumeCommit(): boolean {
    if (!this.commitPending) {
      return false;
    }
    this.commitPending = false;
    return true;
  }

  contains(worldPoint: Vector3): boolean {
    if (!this.group.visible || (this.state !== 'READY' && this.state !== 'HOVERED' && this.state !== 'SPAWNING')) {
      return false;
    }
    this.group.getWorldPosition(_world);
    return _world.distanceTo(worldPoint) <= HIT_RADIUS_M;
  }

  raycast(origin: Vector3, direction: Vector3): boolean {
    if (!this.group.visible || (this.state !== 'READY' && this.state !== 'HOVERED' && this.state !== 'SPAWNING')) {
      return false;
    }
    const parent = this.group.parent;
    if (!parent) {
      return false;
    }
    parent.updateWorldMatrix(true, false);
    const inverse = parent.matrixWorld.clone().invert();
    _origin.copy(origin).applyMatrix4(inverse);
    _dir.copy(direction).transformDirection(inverse);
    _local.copy(this.group.position).sub(_origin);
    const t = _local.dot(_dir);
    if (t < 0) {
      return false;
    }
    const closest = _origin.addScaledVector(_dir, t);
    return closest.distanceTo(this.group.position) <= HIT_RADIUS_M;
  }

  private followPath(t: number): void {
    const path = BAT_EAR_CUT_PATH;
    const count = Math.max(path.length - 1, 1);
    const cursor = t * count;
    const index = Math.min(count - 1, Math.floor(cursor));
    const local = cursor - index;
    const a = path[index] ?? path[0]!;
    const b = path[index + 1] ?? a;
    this.group.position.set(
      a[0] + (b[0] - a[0]) * local + 0.01,
      a[1] + (b[1] - a[1]) * local,
      0.02,
    );
  }

  private setBlade(open: number): void {
    this.blades[0].rotation.z = open;
    this.blades[1].rotation.z = -open;
  }

  private tint(hot: boolean): void {
    for (const blade of this.blades) {
      (blade.material as MeshStandardMaterial).color.set(hot ? '#ff922e' : '#c9c2bc');
    }
  }

  private syncDebug(): void {
    const active = this.state !== 'HIDDEN';
    const showing =
      this.state === 'READY' || this.state === 'HOVERED' || this.state === 'CUTTING' || this.state === 'SPAWNING';
    this.guide.visible = active && (showing || BAT_CUT_INSPECTOR.path);
    this.collider.visible = BAT_CUT_INSPECTOR.collider && active;
    this.notchWire.visible = active && (BAT_CUT_INSPECTOR.geometry || BAT_CUT_INSPECTOR.layers);
  }

  private playSnip(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return;
    }
    this.audio = this.audio ?? new Ctx();
    const ctx = this.audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    try {
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      osc.disconnect();
    }
  }
}

function pathAnchor(path: Vec3[]): Vec3 {
  const first = path[0] ?? [0, 0, 0];
  const last = path[path.length - 1] ?? first;
  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2, 0];
}

function dashedPath(path: Vec3[], color: string): Line {
  const geometry = new BufferGeometry();
  const positions = path.flatMap((point) => [point[0], point[1], point[2] + 0.004]);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const line = new Line(
    geometry,
    new LineDashedMaterial({ color, dashSize: 0.004, gapSize: 0.003, transparent: true }),
  );
  line.computeLineDistances();
  line.raycast = () => {};
  return line;
}

function scrapTriangle(path: Vec3[]): Mesh {
  const geometry = new BufferGeometry();
  const positions = path.flatMap((point) => [point[0], point[1], 0.012]);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({ color: BAT_PAPER_COLOR, transparent: true, opacity: 1, side: DoubleSide, depthWrite: false }),
  );
  mesh.name = 'bat-ear-scrap';
  mesh.raycast = () => {};
  return mesh;
}
