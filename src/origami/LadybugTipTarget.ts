import { CircleGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { FOLD_ASSIST } from './foldAssist.ts';
import { LADYBUG_TIP_HIT_RADIUS_M, LADYBUG_TIP_TARGET_LIFT_M } from './recipes/ladybug.recipe.ts';
import type { HingeDefinition, Vec3 } from './types.ts';

const RADIUS = LADYBUG_TIP_HIT_RADIUS_M;
const PROGRESS_MARKS = [0.25, 0.5, 1] as const;

const _inverse = new Matrix4();
const _localOrigin = new Vector3();
const _localDir = new Vector3();
const _localHit = new Vector3();
const _worldHit = new Vector3();

export interface LadybugTipPointer {
  pinching: boolean;
  started: boolean;
  ended: boolean;
  raycastTarget: string;
  selected: boolean;
}

export interface LadybugTipFoldState {
  stepId: string | null;
  angleDeg: number;
  progress: number;
  phase: string;
  tipCommitted: boolean;
  hinge: HingeDefinition | null;
}

/**
 * Invisible grab volume for the ladybug head tip. It sits on the moving flap,
 * in front of the sheet, and is larger than the few-millimetre triangle so a
 * Quest pinch can catch it without reaching behind the paper.
 */
export class LadybugTipTarget {
  readonly group = new Group();
  readonly mesh: Mesh;
  private active = false;
  private watching = false;
  private angle = 0;
  private progress = 0;
  private phase = 'idle';
  private tipCommitted = false;
  private hingeText = 'none';
  private lastProgress = 0;
  private loggedSnap = false;
  private loggedCommit = false;
  private pointer: LadybugTipPointer = {
    pinching: false,
    started: false,
    ended: false,
    raycastTarget: 'none',
    selected: false,
  };

  constructor() {
    this.group.name = 'ladybug-tip-target';
    this.group.visible = false;
    this.mesh = new Mesh(
      new CircleGeometry(RADIUS, 20),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        colorWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.name = 'ladybug-tip-flap';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.foldId = 'ladybug-tip';
    this.mesh.raycast = (raycaster, intersects) => {
      const hit = this.raycast(raycaster.ray.origin, raycaster.ray.direction);
      if (!hit) {
        return;
      }
      intersects.push({
        distance: raycaster.ray.origin.distanceTo(hit),
        point: hit.clone(),
        object: this.mesh,
      });
    };
    this.group.add(this.mesh);
  }

  get meshId(): string {
    return this.mesh.name;
  }

  get isActive(): boolean {
    return this.active;
  }

  attach(parent: Group): void {
    parent.add(this.group);
  }

  reset(): void {
    this.active = false;
    this.watching = false;
    this.angle = 0;
    this.progress = 0;
    this.phase = 'idle';
    this.tipCommitted = false;
    this.hingeText = 'none';
    this.lastProgress = 0;
    this.loggedSnap = false;
    this.loggedCommit = false;
    this.pointer = {
      pinching: false,
      started: false,
      ended: false,
      raycastTarget: 'none',
      selected: false,
    };
    this.group.visible = false;
    this.group.position.set(0, 0, 0);
  }

  /** Place the pad on the current tip. `tip` is paper-local. */
  sync(stepId: string | null, tip: Vec3 | null): void {
    const on = stepId === 'ladybug-tip' && tip != null;
    this.active = on;
    this.group.visible = on;
    if (tip) {
      this.group.position.set(tip[0], tip[1], tip[2] + LADYBUG_TIP_TARGET_LIFT_M);
    }
  }

  observe(state: LadybugTipFoldState): void {
    if (state.stepId !== 'ladybug-tip') {
      if (this.watching && state.tipCommitted && !this.loggedCommit) {
        this.tipCommitted = true;
        this.loggedCommit = true;
        this.progress = 1;
        this.angle = 180;
        this.emit('commit');
      }
      this.watching = false;
      this.lastProgress = 0;
      this.loggedSnap = false;
      return;
    }
    this.angle = state.angleDeg;
    this.progress = state.progress;
    this.phase = state.phase;
    this.tipCommitted = state.tipCommitted;
    this.hingeText = formatHinge(state.hinge);
    if (!this.watching) {
      this.watching = true;
      this.lastProgress = 0;
      this.loggedSnap = false;
      this.loggedCommit = false;
      this.emit('active');
    }
    for (const mark of PROGRESS_MARKS) {
      if (this.progress + 1e-6 >= mark && this.lastProgress < mark) {
        this.emit(`progress-${Math.round(mark * 100)}`);
      }
    }
    const snapNow = this.phase === 'snapping' || this.progress >= FOLD_ASSIST.autoSnapThreshold;
    if (snapNow && !this.loggedSnap) {
      this.loggedSnap = true;
      this.emit('snap');
    }
    if (!snapNow && this.progress < FOLD_ASSIST.activationThreshold) {
      this.loggedSnap = false;
    }
    this.lastProgress = this.progress;
  }

  notePointer(input: LadybugTipPointer): void {
    if (!this.active && !this.watching) {
      return;
    }
    const becameSelected = input.selected && !this.pointer.selected;
    const pinchStarted = input.started;
    const pinchEnded = input.ended;
    this.pointer = input;
    if (becameSelected) {
      this.emit('selection');
    }
    if (pinchStarted) {
      this.emit('pinch-start');
    }
    if (pinchEnded) {
      this.emit('pinch-end');
    }
  }

  contains(worldPoint: Vector3): boolean {
    if (!this.active || !this.toLocal(worldPoint, _localHit)) {
      return false;
    }
    if (_localHit.z < -0.002 || _localHit.z > this.group.position.z + 0.035) {
      return false;
    }
    const dx = _localHit.x - this.group.position.x;
    const dy = _localHit.y - this.group.position.y;
    return dx * dx + dy * dy <= RADIUS * RADIUS;
  }

  /**
   * Hit the flap pad in front of the sheet. A ray aimed at the tip resolves
   * here before the body plane, crease guides, or decorations.
   */
  raycast(origin: Vector3, direction: Vector3): Vector3 | null {
    if (!this.active || !this.group.parent) {
      return null;
    }
    this.group.parent.updateWorldMatrix(true, false);
    _inverse.copy(this.group.parent.matrixWorld).invert();
    _localOrigin.copy(origin).applyMatrix4(_inverse);
    _localDir.copy(direction).transformDirection(_inverse);
    if (_localDir.lengthSq() < 1e-10) {
      return null;
    }
    _localDir.normalize();
    if (Math.abs(_localDir.z) < 1e-5) {
      return null;
    }
    const t = (this.group.position.z - _localOrigin.z) / _localDir.z;
    if (!Number.isFinite(t) || t < 0 || t > 0.8) {
      return null;
    }
    _localHit.copy(_localOrigin).addScaledVector(_localDir, t);
    const dx = _localHit.x - this.group.position.x;
    const dy = _localHit.y - this.group.position.y;
    if (dx * dx + dy * dy > RADIUS * RADIUS) {
      return null;
    }
    return _worldHit.copy(_localHit).applyMatrix4(this.group.parent.matrixWorld);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.group.removeFromParent();
  }

  private toLocal(worldPoint: Vector3, target: Vector3): boolean {
    if (!this.group.parent) {
      return false;
    }
    this.group.parent.updateWorldMatrix(true, false);
    _inverse.copy(this.group.parent.matrixWorld).invert();
    target.copy(worldPoint).applyMatrix4(_inverse);
    return true;
  }

  private emit(event: string): void {
    const snap = this.phase === 'snapping' || this.progress >= FOLD_ASSIST.autoSnapThreshold;
    const committed = event === 'commit' || this.tipCommitted;
    const transition = event === 'commit';
    const pinch = this.pointer.pinching ? 'yes' : 'no';
    const percent = Math.round(this.progress * 100);
    console.info(
      `[ladybug-step3] ${event} fold=ladybug-tip mesh=${this.meshId} pinch=${pinch} raycast=${this.pointer.raycastTarget} hinge=${this.hingeText} angle=${this.angle.toFixed(1)} progress=${percent}% snap=${snap ? 'yes' : 'no'} committed=${committed ? 'yes' : 'no'} transition=${transition ? 'yes' : 'no'}`,
    );
  }
}

function formatHinge(hinge: HingeDefinition | null): string {
  if (!hinge) {
    return 'none';
  }
  const fmt = (value: number) => value.toFixed(4);
  const point = (p: Vec3) => `(${fmt(p[0])},${fmt(p[1])},${fmt(p[2])})`;
  const mx = (hinge.p0[0] + hinge.p1[0]) / 2;
  const my = (hinge.p0[1] + hinge.p1[1]) / 2;
  const mz = (hinge.p0[2] + hinge.p1[2]) / 2;
  let ax = hinge.p1[0] - hinge.p0[0];
  let ay = hinge.p1[1] - hinge.p0[1];
  let az = hinge.p1[2] - hinge.p0[2];
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len;
  ay /= len;
  az /= len;
  return `pos(${fmt(mx)},${fmt(my)},${fmt(mz)}) axis(${fmt(ax)},${fmt(ay)},${fmt(az)}) ends${point(hinge.p0)}->${point(hinge.p1)}`;
}
