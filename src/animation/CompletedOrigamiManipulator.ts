import {
  AxesHelper,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Euler,
  Group,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import type { TrackingLossMode } from '../input/trackingLoss.ts';
import { PAPER_MOVE_MAX_DISTANCE_M, PAPER_MOVE_MIN_DISTANCE_M } from '../origami/placement.ts';
import { PAPER_DEPTH } from '../origami/paperDepth.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { FONT_SANS, theme } from '../theme/tokens.ts';
import { clamp, easeOutCubic } from '../utils/math.ts';

/** Two-hand scale for a finished origami animal. Visualizations stay off until debug flags are set. */
export const CREATURE_SCALE = {
  enabled: true,
  showPinchPoints: false,
  showHandDistance: false,
  showScaleMultiplier: false,
  minScale: 0.4,
  maxScale: 3,
  defaultScale: 1,
  smoothing: 14,
};

export const CREATURE_PINCH_MARGIN_M = 0.05;
export const CREATURE_HOVER_MARGIN_M = 0.08;
export const CREATURE_MIN_HAND_SPAN_M = 0.03;
export const CREATURE_SAFE_CLEARANCE_M = 0.18;
const INDICATOR_HOLD_SEC = 0.18;
const INDICATOR_FADE_SEC = 0.24;

export type OrigamiInteractionState =
  | 'folding'
  | 'completed-idle'
  | 'one-hand-grab'
  | 'two-hand-transform'
  | 'released';

export type PlayInteractionState = OrigamiInteractionState;

export interface PlayHandSample {
  pinching: boolean;
  tracking: TrackingLossMode;
  point: Vector3 | null;
  /** Wrist-to-palm direction in world space. Supplies the roll axis for two-hand rotation. */
  palmUp?: Vector3 | null;
}

export interface PlayManipulationFrame {
  left: PlayHandSample;
  right: PlayHandSample;
  dtSec: number;
  viewer: Vector3 | null;
}

export interface PlayScaleDebug {
  state: OrigamiInteractionState;
  scale: number;
  handDistanceM: number | null;
  initialHandDistanceM: number | null;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  root: string;
  layerCount: number;
  shadows: boolean;
  trackingLost: boolean;
  leftTracking: string;
  rightTracking: string;
  leftPinch: boolean;
  rightPinch: boolean;
}

interface HandRead {
  pinching: boolean;
  cancelled: boolean;
  point: Vector3 | null;
  live: boolean;
  hit: boolean;
  near: boolean;
}

const _size = new Vector3();
const _center = new Vector3();
const _corner = new Vector3();
const _grabWorld = new Vector3();
const _delta = new Vector3();
const _mid = new Vector3();
const _axisX = new Vector3();
const _axisY = new Vector3();
const _axisZ = new Vector3();
const _upHint = new Vector3();
const _basis = new Matrix4();
const _handFrame = new Quaternion();
const _qDelta = new Quaternion();
const _qTarget = new Quaternion();
const _parentQuat = new Quaternion();
const _worldScale = new Vector3();
const _euler = new Euler();
const _worldUp = new Vector3(0, 1, 0);
const _min = new Vector3();
const _max = new Vector3();
const _fallbackMin = new Vector3(-0.1, -0.1, -0.02);
const _fallbackMax = new Vector3(0.1, 0.1, 0.02);
const _bounds = {
  min: new Vector3(),
  max: new Vector3(),
  center: new Vector3(),
  empty: true,
};

const EDGE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

let toneContext: AudioContext | null = null;

/**
 * Uniform scale from the distance between the two pinch points.
 * The reference distance is the span captured when the gesture began.
 */
export function nextUniformScale(
  initialScale: number,
  initialHandDistance: number,
  currentHandDistance: number,
  minScale = CREATURE_SCALE.minScale,
  maxScale = CREATURE_SCALE.maxScale,
): number {
  const reference = Math.max(initialHandDistance, 1e-4);
  const distance = Math.max(currentHandDistance, 0);
  const factor = distance / reference;
  return clamp(initialScale * factor, minScale, maxScale);
}

/**
 * Orthonormal frame for two hands. X follows the pinch span. The palm
 * directions supply the remaining axis so the gesture can pitch, yaw, and roll.
 * World up is the fallback when a palm normal is not available.
 */
export function handFrameQuaternion(
  left: Vector3,
  right: Vector3,
  leftPalm: Vector3 | null,
  rightPalm: Vector3 | null,
  target: Quaternion,
): Quaternion {
  _axisX.subVectors(right, left);
  if (_axisX.lengthSq() < 1e-8) {
    return target.identity();
  }
  _axisX.normalize();
  _upHint.set(0, 0, 0);
  if (leftPalm) {
    _upHint.add(leftPalm);
  }
  if (rightPalm) {
    _upHint.add(rightPalm);
  }
  if (_upHint.lengthSq() < 1e-6) {
    _upHint.copy(_worldUp);
  }
  _upHint.normalize();
  _axisY.copy(_upHint).addScaledVector(_axisX, -_upHint.dot(_axisX));
  if (_axisY.lengthSq() < 1e-6) {
    _upHint.set(0, 0, 1);
    _axisY.copy(_upHint).addScaledVector(_axisX, -_upHint.dot(_axisX));
  }
  if (_axisY.lengthSq() < 1e-6) {
    return target.identity();
  }
  _axisY.normalize();
  _axisZ.crossVectors(_axisX, _axisY).normalize();
  _basis.makeBasis(_axisX, _axisY, _axisZ);
  return target.setFromRotationMatrix(_basis);
}

/**
 * Shared completed-animal control. Translation, rotation, and uniform scale
 * are applied to `scaleRoot` (the origami assembly) so panels that stay on
 * `animalRoot` are left alone. Whale, fox, bat, owl, and later models share it.
 */
export class CompletedOrigamiManipulator {
  private readonly feedback = new Group();
  private readonly outline: LineSegments;
  private readonly label: Mesh;
  private readonly labelMaterial: MeshBasicMaterial;
  private readonly labelTexture: CanvasTexture;
  private readonly leftMarker: Mesh;
  private readonly rightMarker: Mesh;
  private readonly distanceLine: LineSegments;
  private readonly leftPoint = new Vector3();
  private readonly rightPoint = new Vector3();
  private readonly grabLocal = new Vector3();
  private readonly viewer = new Vector3();
  private leftActive = false;
  private rightActive = false;
  private hasViewer = false;
  private gesture: 'none' | 'grab' | 'scale' = 'none';
  private grabHand: 'left' | 'right' | null = null;
  private stateValue: OrigamiInteractionState = 'completed-idle';
  private scaleValue = CREATURE_SCALE.defaultScale;
  private initialScale = CREATURE_SCALE.defaultScale;
  private initialDistance = 1;
  private handDistance: number | null = null;
  private scaleSession = false;
  private suppressUntilOpen = false;
  private opacity = 0;
  private fading = false;
  private fadeHold = 0;
  private fadeElapsed = 0;
  private labelText = '';
  private playing = false;
  private trackingLost = false;
  private highlighted = false;
  private assemblyLayers = 0;
  private referenceDistance: number | null = null;
  private leftTracking = 'ok';
  private rightTracking = 'ok';
  private leftPinch = false;
  private rightPinch = false;
  private leftPalmOk = false;
  private rightPalmOk = false;
  private readonly leftPalm = new Vector3();
  private readonly rightPalm = new Vector3();
  private readonly initialHandFrame = new Quaternion();
  private readonly initialWorldQuat = new Quaternion();
  private readonly initialWorldPos = new Vector3();
  private readonly initialMid = new Vector3();
  private readonly initialOffset = new Vector3();
  private readonly pivot: AxesHelper;
  private highlight: ((active: boolean) => void) | null = null;

  constructor(
    private readonly animalRoot: Object3D,
    private readonly scaleRoot: Object3D,
  ) {
    this.feedback.name = 'origami-scale-feedback';
    this.outline = new LineSegments(boxGeometry(), lineMaterial(theme.colors.accent));
    this.outline.name = 'origami-scale-outline';
    this.outline.visible = false;
    this.outline.frustumCulled = false;
    this.labelTexture = makeLabelTexture('1.0×');
    this.labelMaterial = new MeshBasicMaterial({
      map: this.labelTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.label = new Mesh(new PlaneGeometry(0.072, 0.026), this.labelMaterial);
    this.label.name = 'origami-scale-indicator';
    this.label.visible = false;
    this.label.raycast = () => {};
    this.label.renderOrder = 12;
    this.label.frustumCulled = false;
    this.leftMarker = marker('origami-pinch-left');
    this.rightMarker = marker('origami-pinch-right');
    this.distanceLine = new LineSegments(new BufferGeometry(), lineMaterial(theme.colors.accentSoft));
    this.distanceLine.name = 'origami-hand-distance';
    this.distanceLine.visible = false;
    this.distanceLine.frustumCulled = false;
    this.distanceLine.geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    this.feedback.add(this.outline, this.label, this.leftMarker, this.rightMarker, this.distanceLine);
    this.animalRoot.add(this.feedback);
    this.pivot = new AxesHelper(0.035);
    this.pivot.name = 'origami-pivot';
    this.pivot.visible = false;
    this.scaleRoot.add(this.pivot);
    this.scaleRoot.scale.setScalar(this.scaleValue);
  }

  setHighlight(handler: (active: boolean) => void): void {
    this.highlight = handler;
  }

  setAssembly(layerCount: number): void {
    this.assemblyLayers = layerCount;
  }

  get state(): OrigamiInteractionState {
    return this.stateValue;
  }

  get scale(): number {
    return this.scaleValue;
  }

  get blocksUi(): boolean {
    return this.gesture !== 'none';
  }

  debugView(): PlayScaleDebug {
    this.scaleRoot.updateWorldMatrix(true, false);
    this.scaleRoot.getWorldPosition(_grabWorld);
    this.scaleRoot.getWorldQuaternion(_qTarget);
    _euler.setFromQuaternion(_qTarget, 'YXZ');
    const degrees = 180 / Math.PI;
    return {
      state: this.stateValue,
      scale: this.scaleValue,
      handDistanceM: this.handDistance,
      initialHandDistanceM: this.referenceDistance,
      position: [_grabWorld.x, _grabWorld.y, _grabWorld.z],
      rotationDeg: [_euler.x * degrees, _euler.y * degrees, _euler.z * degrees],
      root: this.scaleRoot.name || 'origami-root',
      layerCount: this.assemblyLayers,
      shadows: PAPER_DEPTH.shadows,
      trackingLost: this.trackingLost,
      leftTracking: this.leftTracking,
      rightTracking: this.rightTracking,
      leftPinch: this.leftPinch,
      rightPinch: this.rightPinch,
    };
  }

  face(cameraWorld: Vector3): void {
    this.viewer.copy(cameraWorld);
    this.hasViewer = true;
    this.pivot.visible = PAPER_DEPTH.showPivot;
    if (this.label.visible) {
      this.label.lookAt(cameraWorld);
    }
  }

  /** Drop an in-progress gesture without changing the committed scale. */
  sleep(): void {
    this.playing = false;
    const ending = this.gesture !== 'none';
    if (ending) {
      this.stopGesture(true);
      this.suppressUntilOpen = true;
    } else if (!this.fading) {
      this.opacity = 0;
      this.handDistance = null;
    }
    this.stateValue = 'folding';
    this.syncHighlight();
    if (ending || this.fading || this.outline.visible || this.label.visible) {
      this.tickVisuals(0);
    } else {
      this.hideVisuals();
    }
  }

  /** Fold Again and a new animal both return to the original size. */
  reset(): void {
    this.gesture = 'none';
    this.grabHand = null;
    this.scaleSession = false;
    this.suppressUntilOpen = true;
    this.trackingLost = false;
    this.referenceDistance = null;
    this.stateValue = 'completed-idle';
    this.fading = false;
    this.fadeHold = 0;
    this.fadeElapsed = 0;
    this.opacity = 0;
    this.handDistance = null;
    this.scaleValue = CREATURE_SCALE.defaultScale;
    this.initialScale = this.scaleValue;
    this.scaleRoot.position.set(0, 0, 0);
    this.scaleRoot.quaternion.identity();
    this.scaleRoot.scale.setScalar(this.scaleValue);
    this.syncHighlight();
    this.hideVisuals();
  }

  update(frame: PlayManipulationFrame): void {
    this.playing = true;
    this.capture(frame);
    this.refreshBounds();
    const left = this.describe(frame.left, this.leftPoint, this.leftActive);
    const right = this.describe(frame.right, this.rightPoint, this.rightActive);
    this.handDistance = left.point && right.point ? left.point.distanceTo(right.point) : null;

    if (!CREATURE_SCALE.enabled) {
      this.stopGesture(true);
      this.syncHighlight();
      this.tickVisuals(frame.dtSec);
      return;
    }

    if (this.suppressUntilOpen) {
      if (!frame.left.pinching && !frame.right.pinching) {
        this.suppressUntilOpen = false;
        this.trackingLost = false;
      } else {
        this.tickVisuals(frame.dtSec);
        return;
      }
    }

    if (this.trackingFailed(left, right)) {
      this.loseTracking();
      this.syncHighlight();
      this.tickVisuals(frame.dtSec);
      return;
    }

    const twoHand = PAPER_DEPTH.twoHand;
    const span = this.handDistance ?? 0;
    const continueScale = twoHand && this.gesture === 'scale' && left.live && right.live && left.point != null && right.point != null;
    const canScale =
      twoHand &&
      this.gesture !== 'scale' &&
      left.live &&
      right.live &&
      left.hit &&
      right.hit &&
      span >= CREATURE_MIN_HAND_SPAN_M;

    if ((canScale || continueScale) && left.point && right.point) {
      if (this.gesture !== 'scale') {
        this.beginTwoHand(left.point, right.point);
      }
      this.applyTwoHand(left.point, right.point, frame.dtSec);
      this.stateValue = 'two-hand-transform';
      this.syncHighlight();
      this.tickVisuals(frame.dtSec);
      return;
    }

    const frozenHold =
      this.gesture === 'scale' &&
      frame.left.pinching &&
      frame.right.pinching &&
      !left.cancelled &&
      !right.cancelled &&
      (frame.left.tracking === 'frozen' || frame.right.tracking === 'frozen');
    if (frozenHold) {
      this.stateValue = 'two-hand-transform';
      this.tickVisuals(frame.dtSec);
      return;
    }

    if (this.gesture === 'scale') {
      this.stopGesture(true);
      const remaining = this.remainingHand(left, right);
      if (remaining?.point) {
        this.beginGrab(remaining.id, remaining.point);
        this.applyGrab(remaining.point);
        this.stateValue = 'one-hand-grab';
      }
      this.syncHighlight();
      this.tickVisuals(frame.dtSec);
      return;
    }

    const grab = this.grabCandidate(left, right);
    if (grab?.point) {
      if (this.gesture !== 'grab' || this.grabHand !== grab.id) {
        this.beginGrab(grab.id, grab.point);
      }
      this.applyGrab(grab.point);
      this.stateValue = 'one-hand-grab';
      this.syncHighlight();
      this.tickVisuals(frame.dtSec);
      return;
    }

    let justReleased = false;
    if (this.gesture === 'grab') {
      this.gesture = 'none';
      this.grabHand = null;
      this.stateValue = 'released';
      this.syncHighlight();
      justReleased = true;
    }

    if (!justReleased) {
      this.settleIdle(left, right);
    }
    this.syncHighlight();
    this.tickVisuals(frame.dtSec);
  }

  dispose(): void {
    this.labelTexture.dispose();
  }

  private capture(frame: PlayManipulationFrame): void {
    this.leftActive = frame.left.point != null;
    this.rightActive = frame.right.point != null;
    if (frame.left.point) {
      this.leftPoint.copy(frame.left.point);
    }
    if (frame.right.point) {
      this.rightPoint.copy(frame.right.point);
    }
    this.leftTracking = frame.left.tracking;
    this.rightTracking = frame.right.tracking;
    this.leftPinch = frame.left.pinching;
    this.rightPinch = frame.right.pinching;
    this.leftPalmOk = frame.left.palmUp != null;
    this.rightPalmOk = frame.right.palmUp != null;
    if (frame.left.palmUp) {
      this.leftPalm.copy(frame.left.palmUp);
    }
    if (frame.right.palmUp) {
      this.rightPalm.copy(frame.right.palmUp);
    }
    this.hasViewer = frame.viewer != null;
    if (frame.viewer) {
      this.viewer.copy(frame.viewer);
    }
  }

  private describe(input: PlayHandSample, point: Vector3, active: boolean): HandRead {
    const cancelled = input.tracking === 'cancelled';
    const located = active && !cancelled ? point : null;
    const pinching = input.pinching && !cancelled;
    return {
      pinching,
      cancelled,
      point: located,
      live: Boolean(pinching && located),
      hit: Boolean(located && pinching && this.contains(located, CREATURE_PINCH_MARGIN_M)),
      near: Boolean(located && this.contains(located, CREATURE_HOVER_MARGIN_M)),
    };
  }

  private trackingFailed(left: HandRead, right: HandRead): boolean {
    if (this.gesture === 'scale') {
      return left.cancelled || right.cancelled;
    }
    if (this.gesture === 'grab') {
      return (this.grabHand === 'left' && left.cancelled) || (this.grabHand === 'right' && right.cancelled);
    }
    return false;
  }

  private grabCandidate(left: HandRead, right: HandRead): { id: 'left' | 'right'; point: Vector3 | null } | null {
    if (this.gesture === 'grab' && this.grabHand) {
      const owner = this.grabHand === 'left' ? left : right;
      if (owner.live && owner.point) {
        return { id: this.grabHand, point: owner.point };
      }
      return null;
    }
    if (left.live && left.hit && left.point && !(right.live && right.hit)) {
      return { id: 'left', point: left.point };
    }
    if (right.live && right.hit && right.point) {
      return { id: 'right', point: right.point };
    }
    return null;
  }

  private remainingHand(left: HandRead, right: HandRead): { id: 'left' | 'right'; point: Vector3 | null } | null {
    if (left.live && left.hit && left.point && !right.live) {
      return { id: 'left', point: left.point };
    }
    if (right.live && right.hit && right.point && !left.live) {
      return { id: 'right', point: right.point };
    }
    return null;
  }

  private beginGrab(id: 'left' | 'right', point: Vector3): void {
    const fresh = this.gesture === 'none';
    this.scaleRoot.updateWorldMatrix(true, false);
    this.grabLocal.copy(point);
    this.scaleRoot.worldToLocal(this.grabLocal);
    this.grabHand = id;
    this.gesture = 'grab';
    this.stateValue = 'one-hand-grab';
    if (fresh) {
      playPaperRustle();
    }
  }

  private applyGrab(point: Vector3): void {
    this.scaleRoot.updateWorldMatrix(true, false);
    _grabWorld.copy(this.grabLocal);
    this.scaleRoot.localToWorld(_grabWorld);
    _delta.copy(point).sub(_grabWorld);
    const parent = this.scaleRoot.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(_parentQuat);
      parent.getWorldScale(_worldScale);
      _delta.applyQuaternion(_parentQuat.invert());
      _delta.x /= _worldScale.x || 1;
      _delta.y /= _worldScale.y || 1;
      _delta.z /= _worldScale.z || 1;
    }
    this.scaleRoot.position.add(_delta);
    this.clampRootReach();
  }

  private beginTwoHand(a: Vector3, b: Vector3): void {
    const fresh = this.gesture === 'none';
    this.initialDistance = Math.max(a.distanceTo(b), CREATURE_MIN_HAND_SPAN_M);
    this.referenceDistance = this.initialDistance;
    this.initialScale = this.scaleValue;
    this.scaleRoot.updateWorldMatrix(true, false);
    this.scaleRoot.getWorldPosition(this.initialWorldPos);
    this.scaleRoot.getWorldQuaternion(this.initialWorldQuat);
    this.initialMid.copy(a).add(b).multiplyScalar(0.5);
    this.initialOffset.copy(this.initialWorldPos).sub(this.initialMid);
    handFrameQuaternion(a, b, this.palm('left'), this.palm('right'), this.initialHandFrame);
    this.gesture = 'scale';
    this.grabHand = null;
    this.scaleSession = true;
    this.stateValue = 'two-hand-transform';
    this.opacity = 1;
    this.fading = false;
    this.fadeHold = 0;
    debugEvents.emit('creatureScaleStarted', { scale: this.initialScale });
    if (fresh) {
      playPaperRustle();
    }
  }

  private applyTwoHand(a: Vector3, b: Vector3, dtSec: number): void {
    const distance = Math.max(a.distanceTo(b), 0.001);
    let target = nextUniformScale(this.initialScale, this.initialDistance, distance);
    if (this.hasViewer) {
      target = this.clampClearance(target);
    }
    const lambda = CREATURE_SCALE.smoothing;
    this.scaleValue = lambda <= 0
      ? target
      : MathUtils.damp(this.scaleValue, target, lambda, Math.max(dtSec, 0));
    if (!Number.isFinite(this.scaleValue)) {
      this.scaleValue = this.initialScale;
    }
    const ratio = this.scaleValue / Math.max(this.initialScale, 1e-4);
    handFrameQuaternion(a, b, this.palm('left'), this.palm('right'), _handFrame);
    _qDelta.copy(this.initialHandFrame).invert();
    _qDelta.premultiply(_handFrame);
    _qTarget.copy(this.initialWorldQuat).premultiply(_qDelta);
    _grabWorld.copy(this.initialOffset).multiplyScalar(ratio).applyQuaternion(_qDelta);
    _mid.copy(a).add(b).multiplyScalar(0.5);
    _grabWorld.add(_mid);
    this.writeRootWorld(_grabWorld, _qTarget);
    this.scaleRoot.scale.setScalar(this.scaleValue);
  }

  private palm(id: 'left' | 'right'): Vector3 | null {
    if (id === 'left') {
      return this.leftPalmOk ? this.leftPalm : null;
    }
    return this.rightPalmOk ? this.rightPalm : null;
  }

  private writeRootWorld(worldPos: Vector3, worldQuat: Quaternion): void {
    const parent = this.scaleRoot.parent;
    if (!parent) {
      this.scaleRoot.position.copy(worldPos);
      this.scaleRoot.quaternion.copy(worldQuat);
      return;
    }
    parent.updateWorldMatrix(true, false);
    _corner.copy(worldPos);
    parent.worldToLocal(_corner);
    parent.getWorldQuaternion(_parentQuat);
    _parentQuat.invert().multiply(worldQuat);
    this.scaleRoot.position.copy(_corner);
    this.scaleRoot.quaternion.copy(_parentQuat);
  }

  private clampRootReach(): void {
    if (!this.hasViewer) {
      return;
    }
    const parent = this.scaleRoot.parent;
    this.scaleRoot.updateWorldMatrix(true, false);
    this.scaleRoot.getWorldPosition(_grabWorld);
    _delta.copy(_grabWorld).sub(this.viewer);
    const distance = _delta.length();
    let changed = false;
    if (!Number.isFinite(distance) || distance < 1e-5) {
      _grabWorld.copy(this.viewer);
      _grabWorld.z -= PAPER_MOVE_MIN_DISTANCE_M;
      changed = true;
    } else if (distance < PAPER_MOVE_MIN_DISTANCE_M) {
      _delta.setLength(PAPER_MOVE_MIN_DISTANCE_M);
      _grabWorld.copy(this.viewer).add(_delta);
      changed = true;
    } else if (distance > PAPER_MOVE_MAX_DISTANCE_M) {
      _delta.setLength(PAPER_MOVE_MAX_DISTANCE_M);
      _grabWorld.copy(this.viewer).add(_delta);
      changed = true;
    }
    const minY = this.viewer.y - 0.65;
    const maxY = this.viewer.y + 0.45;
    if (_grabWorld.y < minY || _grabWorld.y > maxY) {
      _grabWorld.y = Math.min(maxY, Math.max(minY, _grabWorld.y));
      changed = true;
    }
    if (!changed) {
      return;
    }
    if (parent) {
      parent.worldToLocal(_grabWorld);
    }
    this.scaleRoot.position.copy(_grabWorld);
  }

  private clampClearance(target: number): number {
    if (_bounds.empty) {
      return target;
    }
    _size.copy(_bounds.max).sub(_bounds.min);
    const current = Math.max(this.scaleValue, 1e-4);
    _size.divideScalar(current);
    const radius = 0.5 * _size.length();
    if (radius < 1e-4) {
      return target;
    }
    const limit = (_bounds.center.distanceTo(this.viewer) - CREATURE_SAFE_CLEARANCE_M) / radius;
    if (!Number.isFinite(limit)) {
      return target;
    }
    return clamp(Math.min(target, Math.max(limit, this.initialScale)), CREATURE_SCALE.minScale, CREATURE_SCALE.maxScale);
  }

  private syncHighlight(): void {
    const active = this.gesture !== 'none';
    if (active === this.highlighted) {
      return;
    }
    this.highlighted = active;
    this.highlight?.(active);
  }

  private stopGesture(fade: boolean): void {
    const wasScale = this.gesture === 'scale';
    if (this.gesture === 'none') {
      return;
    }
    this.gesture = 'none';
    this.grabHand = null;
    this.stateValue = 'released';
    if (wasScale) {
      this.emitScaleEnded();
      if (fade) {
        this.startFade();
      }
    }
  }

  private loseTracking(): void {
    const wasScale = this.gesture === 'scale';
    this.gesture = 'none';
    this.grabHand = null;
    this.suppressUntilOpen = true;
    this.trackingLost = true;
    this.stateValue = 'released';
    if (wasScale) {
      this.emitScaleEnded();
      this.startFade();
    }
  }

  private emitScaleEnded(): void {
    if (!this.scaleSession) {
      return;
    }
    this.scaleSession = false;
    debugEvents.emit('creatureScaleEnded', { scale: this.scaleValue });
  }

  private settleIdle(left: HandRead, right: HandRead): void {
    const showing = this.fading || this.opacity > 0.02;
    if (showing && this.stateValue === 'released') {
      return;
    }
    if (left.near || right.near || this.stateValue === 'released' || this.stateValue === 'completed-idle') {
      this.stateValue = 'completed-idle';
    }
  }

  private startFade(): void {
    this.fading = true;
    this.fadeHold = INDICATOR_HOLD_SEC;
    this.fadeElapsed = 0;
    this.opacity = 1;
  }

  private tickVisuals(dtSec: number): void {
    this.refreshBounds();
    this.updateFade(dtSec);
    const showGesture = this.gesture !== 'none' || this.fading;
    const showLabel = CREATURE_SCALE.showScaleMultiplier && this.opacity > 0.02 && (showGesture || this.playing);
    this.outline.visible = false;
    this.label.visible = showLabel;
    this.labelMaterial.opacity = this.opacity;
    this.pivot.visible = PAPER_DEPTH.showPivot;
    if (showLabel) {
      this.placeLabel();
    }
    this.placeDebugMarkers();
  }

  private updateFade(dtSec: number): void {
    if (this.gesture === 'scale') {
      this.opacity = 1;
      this.fading = false;
      this.fadeHold = 0;
      return;
    }
    if (this.playing && CREATURE_SCALE.showScaleMultiplier && !this.fading) {
      this.opacity = 1;
      return;
    }
    if (!this.fading) {
      return;
    }
    const dt = Math.max(dtSec, 0);
    if (this.fadeHold > 0) {
      this.fadeHold = Math.max(0, this.fadeHold - dt);
      this.opacity = 1;
      return;
    }
    this.fadeElapsed += dt;
    const t = clamp(this.fadeElapsed / INDICATOR_FADE_SEC, 0, 1);
    this.opacity = 1 - easeOutCubic(t);
    if (t >= 1) {
      this.fading = false;
      this.opacity = 0;
    }
  }

  private refreshBounds(): void {
    this.scaleRoot.updateWorldMatrix(true, true);
    const box = boundsOf(this.scaleRoot);
    _bounds.empty = box.empty;
    _bounds.min.copy(box.min);
    _bounds.max.copy(box.max);
    _bounds.center.copy(box.center);
  }

  private contains(point: Vector3, margin: number): boolean {
    if (_bounds.empty) {
      return false;
    }
    return (
      point.x >= _bounds.min.x - margin &&
      point.x <= _bounds.max.x + margin &&
      point.y >= _bounds.min.y - margin &&
      point.y <= _bounds.max.y + margin &&
      point.z >= _bounds.min.z - margin &&
      point.z <= _bounds.max.z + margin
    );
  }

  private placeLabel(): void {
    const text = formatScale(this.scaleValue);
    if (text !== this.labelText) {
      this.labelText = text;
      paintLabel(this.labelTexture, text);
    }
    _center.copy(_bounds.center);
    _center.y = _bounds.max.y + 0.03;
    this.animalRoot.worldToLocal(_center);
    this.label.position.copy(_center);
    if (this.hasViewer) {
      this.label.lookAt(this.viewer);
    }
  }

  private placeDebugMarkers(): void {
    const showPoints = CREATURE_SCALE.showPinchPoints && this.playing;
    this.leftMarker.visible = showPoints && this.leftActive;
    this.rightMarker.visible = showPoints && this.rightActive;
    if (this.leftMarker.visible) {
      this.placeMarker(this.leftMarker, this.leftPoint);
    }
    if (this.rightMarker.visible) {
      this.placeMarker(this.rightMarker, this.rightPoint);
    }
    const showDistance = CREATURE_SCALE.showHandDistance && this.playing && this.leftActive && this.rightActive;
    this.distanceLine.visible = showDistance;
    if (!showDistance) {
      return;
    }
    const attribute = this.distanceLine.geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    this.writeLocal(this.leftPoint, array, 0);
    this.writeLocal(this.rightPoint, array, 3);
    attribute.needsUpdate = true;
  }

  private placeMarker(mesh: Mesh, world: Vector3): void {
    _corner.copy(world);
    this.animalRoot.worldToLocal(_corner);
    mesh.position.copy(_corner);
  }

  private writeLocal(world: Vector3, array: Float32Array, offset: number): void {
    _corner.copy(world);
    this.animalRoot.worldToLocal(_corner);
    array[offset] = _corner.x;
    array[offset + 1] = _corner.y;
    array[offset + 2] = _corner.z;
  }

  private hideVisuals(): void {
    this.outline.visible = false;
    this.label.visible = false;
    this.leftMarker.visible = false;
    this.rightMarker.visible = false;
    this.distanceLine.visible = false;
    this.labelMaterial.opacity = 0;
  }
}

function boundsOf(object: Object3D): { min: Vector3; max: Vector3; center: Vector3; empty: boolean } {
  const min = _min.set(Infinity, Infinity, Infinity);
  const max = _max.set(-Infinity, -Infinity, -Infinity);
  let found = false;
  object.traverse((child) => {
    const mesh = child as Mesh;
    const position = mesh.geometry?.getAttribute?.('position');
    if (!mesh.visible || !position || position.count === 0) {
      return;
    }
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const box = mesh.geometry.boundingBox;
    if (!box || box.isEmpty()) {
      return;
    }
    found = true;
    for (let index = 0; index < 8; index += 1) {
      corner(box.min, box.max, index, _corner);
      _corner.applyMatrix4(mesh.matrixWorld);
      min.min(_corner);
      max.max(_corner);
    }
  });
  if (!found) {
    object.getWorldPosition(_center);
    min.copy(_center).add(_fallbackMin);
    max.copy(_center).add(_fallbackMax);
  }
  _center.copy(min).add(max).multiplyScalar(0.5);
  return { min, max, center: _center, empty: false };
}

function corner(min: Vector3, max: Vector3, index: number, target: Vector3): Vector3 {
  return target.set(
    index & 1 ? max.x : min.x,
    index & 2 ? max.y : min.y,
    index & 4 ? max.z : min.z,
  );
}

function boxGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(EDGE_PAIRS.length * 6), 3));
  return geometry;
}

function lineMaterial(color: string): LineBasicMaterial {
  return new LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

function marker(name: string): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.008, 10, 8),
    new MeshBasicMaterial({
      color: theme.colors.accent,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.name = name;
  mesh.visible = false;
  mesh.raycast = () => {};
  return mesh;
}

function formatScale(scale: number): string {
  return `${(Math.round(scale * 10) / 10).toFixed(1)}×`;
}

function makeLabelTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  paintCanvas(canvas, text);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function paintLabel(texture: CanvasTexture, text: string): void {
  const image = texture.image as HTMLCanvasElement | undefined;
  if (image) {
    paintCanvas(image, text);
  }
  texture.needsUpdate = true;
}

function paintCanvas(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(width, 0, width, height, radius);
  ctx.arcTo(width, height, 0, height, radius);
  ctx.arcTo(0, height, 0, 0, radius);
  ctx.arcTo(0, 0, width, 0, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 252, 248, 0.94)';
  ctx.fill();
  ctx.strokeStyle = theme.colors.border;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.font = `600 54px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 2);
}

function playPaperRustle(): void {
  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }
  try {
    toneContext = toneContext ?? new AudioContextCtor();
    void toneContext.resume?.();
    const duration = 0.09;
    const frames = Math.max(1, Math.floor(toneContext.sampleRate * duration));
    const buffer = toneContext.createBuffer(1, frames, toneContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      const envelope = Math.sin((i / frames) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * envelope * envelope;
    }
    const source = toneContext.createBufferSource();
    const filter = toneContext.createBiquadFilter();
    const gain = toneContext.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 0.6;
    gain.gain.value = 0.035;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(toneContext.destination);
    source.start();
  } catch {
    toneContext = null;
  }
}
