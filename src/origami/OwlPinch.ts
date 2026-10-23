import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3 } from 'three';
import { OWL_PINCH_AT } from './recipes/owl.recipe.ts';

export type OwlPinchState = 'hidden' | 'ready' | 'playing' | 'done';

const REVEAL_MS = 1100;
const HIT_RADIUS_M = 0.038;

const _world = new Vector3();
const _origin = new Vector3();
const _dir = new Vector3();
const _local = new Vector3();

export class OwlPinch {
  readonly group = new Group();
  private state: OwlPinchState = 'hidden';
  private elapsed = 0;
  private hover = false;
  private commitPending = false;
  private readonly ring: Mesh;
  private readonly glow: Mesh;

  constructor() {
    this.group.name = 'owl-pinch-target';
    this.group.position.set(OWL_PINCH_AT[0], OWL_PINCH_AT[1], OWL_PINCH_AT[2]);
    this.group.visible = false;
    this.ring = new Mesh(
      new RingGeometry(0.016, 0.024, 28),
      new MeshBasicMaterial({
        color: '#ffe08a',
        transparent: true,
        opacity: 0.85,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.glow = new Mesh(
      new SphereGeometry(0.012, 16, 12),
      new MeshBasicMaterial({
        color: '#fff4c8',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.ring.position.z = 0.001;
    this.group.add(this.glow, this.ring);
  }

  attach(parent: Group): void {
    parent.add(this.group);
  }

  reset(): void {
    this.state = 'hidden';
    this.elapsed = 0;
    this.hover = false;
    this.commitPending = false;
    this.group.visible = false;
    this.group.scale.setScalar(1);
  }

  sync(stepId: string | null): void {
    if (stepId !== 'owl-decorate') {
      if (this.state === 'playing') {
        return;
      }
      if (this.state !== 'done') {
        this.reset();
      } else {
        this.group.visible = false;
      }
      return;
    }
    if (this.state === 'hidden') {
      this.state = 'ready';
      this.elapsed = 0;
      this.group.visible = true;
      this.group.scale.setScalar(0.4);
    }
  }

  setHover(hovered: boolean): void {
    this.hover = hovered;
  }

  begin(): boolean {
    if (this.state !== 'ready') {
      return false;
    }
    this.state = 'playing';
    this.elapsed = 0;
    this.commitPending = false;
    this.group.visible = false;
    return true;
  }

  tick(dtMs: number): void {
    if (this.state === 'ready') {
      this.elapsed += dtMs;
      const pulse = 0.92 + Math.sin(this.elapsed / 180) * 0.08;
      const scale = (this.hover ? 1.12 : 1) * pulse;
      this.group.scale.setScalar(Math.min(1, this.elapsed / 220) * scale);
      return;
    }
    if (this.state !== 'playing') {
      return;
    }
    this.elapsed += dtMs;
    if (this.elapsed >= REVEAL_MS) {
      this.state = 'done';
      this.commitPending = true;
      this.group.visible = false;
    }
  }

  consumeCommit(): boolean {
    if (!this.commitPending) {
      return false;
    }
    this.commitPending = false;
    return true;
  }

  get visualState(): OwlPinchState {
    return this.state;
  }

  get progress(): number {
    if (this.state === 'done') {
      return 1;
    }
    if (this.state !== 'playing') {
      return 0;
    }
    return Math.min(1, this.elapsed / REVEAL_MS);
  }

  contains(worldPoint: Vector3): boolean {
    if (!this.group.visible || this.state !== 'ready') {
      return false;
    }
    this.group.getWorldPosition(_world);
    return _world.distanceTo(worldPoint) <= HIT_RADIUS_M;
  }

  raycast(origin: Vector3, direction: Vector3): boolean {
    if (!this.group.visible || this.state !== 'ready') {
      return false;
    }
    const parent = this.group.parent;
    if (!parent) {
      return false;
    }
    parent.updateWorldMatrix(true, false);
    const inverse = parent.matrixWorld.clone().invert();
    _origin.copy(origin).applyMatrix4(inverse);
    _dir.copy(direction).transformDirection(inverse).normalize();
    _local.copy(this.group.position).sub(_origin);
    const t = _local.dot(_dir);
    if (t < 0) {
      return false;
    }
    const closest = _origin.addScaledVector(_dir, t);
    return closest.distanceTo(this.group.position) <= HIT_RADIUS_M;
  }
}
