import { Quaternion, Vector3, type Object3D } from 'three';
import type { HandId } from '../input/HandOwnership.ts';
import type { HandSample } from '../input/HandTrackingAdapter.ts';
import type { TrackingLossMode } from '../input/trackingLoss.ts';
import { easeOutCubic } from '../utils/math.ts';

export const MENU_DRAG_CONFIG = {
  enabled: true,
  smoothing: 0.15,
  preserveGrabOffset: true,
  allowDepthMovement: true,
  allowRotation: false,
  allowScaling: false,
  restoreLastPosition: true,
};

export const MENU_DRAG_INSPECTOR = {
  handleCollider: false,
  boundingBox: false,
  handRay: false,
  rayHit: false,
};

export type MenuDragState = 'idle' | 'hover' | 'grabbed' | 'dragging' | 'released' | 'tracking-lost' | 'recenter';
export type MenuDragMode = 'direct' | 'raycast' | 'none';

const _rayDir = new Vector3();

/** Aim used for a distance grab. Prefers an input ray, then the index finger. */
export function pointingRay(sample: HandSample, origin: Vector3, direction: Vector3): boolean {
  if (sample.rayOrigin && sample.rayDirection) {
    origin.set(sample.rayOrigin[0], sample.rayOrigin[1], sample.rayOrigin[2]);
    direction.set(sample.rayDirection[0], sample.rayDirection[1], sample.rayDirection[2]);
  } else if (sample.indexTip && sample.wrist) {
    origin.set(sample.indexTip[0], sample.indexTip[1], sample.indexTip[2]);
    direction.set(
      sample.indexTip[0] - sample.wrist[0],
      sample.indexTip[1] - sample.wrist[1],
      sample.indexTip[2] - sample.wrist[2],
    );
  } else {
    return false;
  }
  if (direction.lengthSq() < 1e-8) {
    return false;
  }
  direction.normalize();
  return true;
}

/** Point at the captured ray depth, then apply the grab offset. Never the hand itself. */
export function rayDragPoint(
  origin: Vector3,
  direction: Vector3,
  depth: number,
  grabOffset: Vector3,
  target: Vector3,
): Vector3 {
  _rayDir.copy(direction);
  if (_rayDir.lengthSq() < 1e-8) {
    return target.copy(origin).add(grabOffset);
  }
  _rayDir.normalize();
  return target.copy(origin).addScaledVector(_rayDir, depth).add(grabOffset);
}

const SELECT_LOCK_MS = 280;
const RECENTER_SEC = 0.34;
const SAFE_MIN_M = 0.35;
const SAFE_MAX_M = 2.4;

const _offset = new Vector3();
const _target = new Vector3();
const _fromPos = new Vector3();
const _toPos = new Vector3();
const _fromQuat = new Quaternion();
const _toQuat = new Quaternion();

export function menuFollowAlpha(smoothing: number, dtSec: number): number {
  const rate = Math.min(Math.max(smoothing, 0.02), 0.95);
  return 1 - (1 - rate) ** Math.max(dtSec * 60, 0);
}

export function poseIsReachable(
  menuPos: Vector3,
  viewerPos: Vector3,
  forward: Vector3,
): boolean {
  const dx = menuPos.x - viewerPos.x;
  const dy = menuPos.y - viewerPos.y;
  const dz = menuPos.z - viewerPos.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < SAFE_MIN_M || distance > SAFE_MAX_M) {
    return false;
  }
  const facing = dx * forward.x + dy * forward.y + dz * forward.z;
  return facing > -0.15;
}

export class MenuMover {
  private grabbing = false;
  private frozen = false;
  private hover = false;
  private state: MenuDragState = 'idle';
  private hand: HandId | null = null;
  private selectLockUntil = 0;
  private recenterElapsed = 0;
  private recentering = false;
  private readonly grabOffset = new Vector3();
  private readonly lastValid = new Vector3();
  private readonly lastQuat = new Quaternion();
  private readonly savedPos = new Vector3();
  private readonly savedQuat = new Quaternion();
  private readonly savedViewerLocal = new Vector3();
  private hasSaved = false;
  private readonly recenterFromPos = new Vector3();
  private readonly recenterToPos = new Vector3();
  private readonly recenterFromQuat = new Quaternion();
  private readonly recenterToQuat = new Quaternion();
  private mode: Exclude<MenuDragMode, 'none'> | null = null;
  private rayDepth = 0;

  get active(): boolean {
    return this.grabbing;
  }

  get dragState(): MenuDragState {
    if (this.recentering) {
      return 'recenter';
    }
    if (this.grabbing) {
      return this.state;
    }
    if (this.hover && this.state === 'idle') {
      return 'hover';
    }
    return this.state;
  }

  get activeHand(): HandId | null {
    return this.hand;
  }

  get dragMode(): MenuDragMode {
    return this.grabbing && this.mode ? this.mode : 'none';
  }

  get rayDistance(): number {
    return this.dragMode === 'raycast' ? this.rayDepth : 0;
  }

  get hasSavedPose(): boolean {
    return this.hasSaved;
  }

  get blocksSelection(): boolean {
    return this.grabbing || this.now() < this.selectLockUntil;
  }

  setHover(hover: boolean): void {
    this.hover = hover;
    if (!this.grabbing && !this.recentering && this.state !== 'tracking-lost') {
      this.state = hover ? 'hover' : this.state === 'hover' ? 'idle' : this.state;
    }
  }

  begin(menu: Object3D, handWorld: Vector3, hand: HandId): void {
    if (!MENU_DRAG_CONFIG.enabled) {
      return;
    }
    this.cancelRecenter(menu);
    menu.updateWorldMatrix(true, false);
    this.grabbing = true;
    this.frozen = false;
    this.hand = hand;
    this.state = 'grabbed';
    this.mode = 'direct';
    this.rayDepth = 0;
    this.grabOffset.copy(menu.position).sub(handWorld);
    this.lastValid.copy(menu.position);
    this.lastQuat.copy(menu.quaternion);
  }

  beginRay(menu: Object3D, hit: Vector3, depth: number, hand: HandId): void {
    if (!MENU_DRAG_CONFIG.enabled || !(depth > 0)) {
      return;
    }
    this.cancelRecenter(menu);
    menu.updateWorldMatrix(true, false);
    this.grabbing = true;
    this.frozen = false;
    this.hand = hand;
    this.state = 'grabbed';
    this.mode = 'raycast';
    this.rayDepth = depth;
    this.grabOffset.copy(menu.position).sub(hit);
    this.lastValid.copy(menu.position);
    this.lastQuat.copy(menu.quaternion);
  }

  update(
    menu: Object3D,
    handWorld: Vector3 | null,
    tracking: TrackingLossMode,
    dtSec: number,
  ): void {
    if (this.recentering) {
      this.tickRecenter(menu, dtSec);
      return;
    }
    if (!this.grabbing || this.mode === 'raycast') {
      return;
    }
    if (tracking !== 'ok' || !handWorld) {
      this.frozen = true;
      this.state = 'tracking-lost';
      menu.position.copy(this.lastValid);
      return;
    }
    if (this.frozen) {
      this.grabOffset.copy(menu.position).sub(handWorld);
      this.frozen = false;
    }
    _target.copy(handWorld);
    if (MENU_DRAG_CONFIG.preserveGrabOffset) {
      _target.add(this.grabOffset);
    }
    if (!MENU_DRAG_CONFIG.allowDepthMovement) {
      _target.z = menu.position.z;
    }
    const alpha = menuFollowAlpha(MENU_DRAG_CONFIG.smoothing, dtSec);
    menu.position.lerp(_target, alpha);
    this.lastValid.copy(menu.position);
    this.lastQuat.copy(menu.quaternion);
    this.state = 'dragging';
  }

  updateRay(
    menu: Object3D,
    origin: Vector3 | null,
    direction: Vector3 | null,
    tracking: TrackingLossMode,
    dtSec: number,
  ): void {
    if (this.recentering) {
      this.tickRecenter(menu, dtSec);
      return;
    }
    if (!this.grabbing || this.mode !== 'raycast') {
      return;
    }
    if (tracking !== 'ok' || !origin || !direction) {
      this.frozen = true;
      this.state = 'tracking-lost';
      menu.position.copy(this.lastValid);
      return;
    }
    const point = rayDragPoint(origin, direction, this.rayDepth, _offset.set(0, 0, 0), _target);
    if (this.frozen) {
      this.grabOffset.copy(menu.position).sub(point);
      this.frozen = false;
    }
    if (MENU_DRAG_CONFIG.preserveGrabOffset) {
      point.add(this.grabOffset);
    }
    const alpha = menuFollowAlpha(MENU_DRAG_CONFIG.smoothing, dtSec);
    menu.position.lerp(point, alpha);
    this.lastValid.copy(menu.position);
    this.lastQuat.copy(menu.quaternion);
    this.state = 'dragging';
  }

  end(menu: Object3D): void {
    if (this.grabbing) {
      this.remember(menu);
      this.selectLockUntil = this.now() + SELECT_LOCK_MS;
    }
    this.grabbing = false;
    this.frozen = false;
    this.hand = null;
    this.mode = null;
    this.rayDepth = 0;
    this.state = 'released';
  }

  remember(menu: Object3D, viewerPos?: Vector3 | null): void {
    this.savedPos.copy(menu.position);
    this.savedQuat.copy(menu.quaternion);
    this.hasSaved = true;
    if (viewerPos) {
      this.savedViewerLocal.copy(menu.position).sub(viewerPos);
    }
  }

  restore(menu: Object3D, viewerPos: Vector3, forward: Vector3, fallback: () => void): void {
    if (!MENU_DRAG_CONFIG.restoreLastPosition || !this.hasSaved) {
      fallback();
      this.remember(menu, viewerPos);
      return;
    }
    if (poseIsReachable(this.savedPos, viewerPos, forward)) {
      menu.position.copy(this.savedPos);
      menu.quaternion.copy(this.savedQuat);
      return;
    }
    _offset.copy(viewerPos).add(this.savedViewerLocal);
    if (poseIsReachable(_offset, viewerPos, forward)) {
      menu.position.copy(_offset);
      menu.quaternion.copy(this.savedQuat);
      return;
    }
    fallback();
    this.remember(menu, viewerPos);
  }

  startRecenter(menu: Object3D, toPos: Vector3, toQuat: Quaternion): void {
    this.cancelGrab();
    this.recentering = true;
    this.recenterElapsed = 0;
    this.recenterFromPos.copy(menu.position);
    this.recenterToPos.copy(toPos);
    this.recenterFromQuat.copy(menu.quaternion);
    this.recenterToQuat.copy(toQuat);
    this.state = 'recenter';
  }

  clearSaved(): void {
    this.hasSaved = false;
  }

  private tickRecenter(menu: Object3D, dtSec: number): void {
    this.recenterElapsed += dtSec;
    const t = easeOutCubic(Math.min(this.recenterElapsed / RECENTER_SEC, 1));
    menu.position.copy(_fromPos.copy(this.recenterFromPos).lerp(_toPos.copy(this.recenterToPos), t));
    menu.quaternion.copy(_fromQuat.copy(this.recenterFromQuat).slerp(_toQuat.copy(this.recenterToQuat), t));
    if (t >= 1) {
      this.recentering = false;
      this.state = 'idle';
      this.remember(menu);
    }
  }

  private cancelRecenter(menu: Object3D): void {
    if (!this.recentering) {
      return;
    }
    this.recentering = false;
    this.remember(menu);
  }

  private cancelGrab(): void {
    this.grabbing = false;
    this.frozen = false;
    this.hand = null;
    this.mode = null;
    this.rayDepth = 0;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
