import { Quaternion, Vector3, type Object3D } from 'three';
import type { HandId } from '../input/HandOwnership.ts';
import {
  PAPER_MOVE_MAX_DISTANCE_M,
  PAPER_MOVE_MIN_DISTANCE_M,
  PAPER_SCALE_MAX,
  PAPER_SCALE_MIN,
} from './placement.ts';

const _grabWorld = new Vector3();
const _delta = new Vector3();
const _aim = new Vector3();
const _q = new Quaternion();
const _mid = new Vector3();
const _axis = new Vector3();
const _from = new Vector3();
const _offset = new Vector3();

export class PaperMover {
  private grabbing = false;
  private primary: HandId | null = null;
  private twoHand = false;
  private hasAim = false;
  private dist0 = 1;
  private scale0 = 1;
  private readonly grabLocal = new Vector3();
  private readonly paperQuat0 = new Quaternion();
  private readonly aim0 = new Vector3();
  private readonly mid0 = new Vector3();
  private readonly axis0 = new Vector3();
  private readonly pos0 = new Vector3();
  private readonly quat0 = new Quaternion();

  get active(): boolean {
    return this.grabbing;
  }

  get primaryHand(): HandId | null {
    return this.primary;
  }

  begin(paper: Object3D, primary: HandId, handWorld: Vector3, aim?: Vector3 | null): void {
    paper.updateWorldMatrix(true, false);
    this.grabbing = true;
    this.primary = primary;
    this.twoHand = false;
    this.grabLocal.copy(handWorld);
    paper.worldToLocal(this.grabLocal);
    this.paperQuat0.copy(paper.quaternion);
    this.hasAim = Boolean(aim && aim.lengthSq() > 0.0004);
    if (aim && this.hasAim) {
      this.aim0.copy(aim).normalize();
    }
  }

  update(
    paper: Object3D,
    primary: HandId,
    primaryWorld: Vector3,
    aim: Vector3 | null,
    secondaryWorld: Vector3 | null,
    viewerPos?: Vector3 | null,
  ): void {
    if (!this.grabbing) {
      this.begin(paper, primary, primaryWorld, aim);
    }
    if (secondaryWorld) {
      if (!this.twoHand) {
        this.captureTwoHand(paper, primaryWorld, secondaryWorld);
      }
      this.applyTwoHand(paper, primaryWorld, secondaryWorld, viewerPos);
      return;
    }
    if (this.twoHand) {
      this.begin(paper, primary, primaryWorld, aim);
    }
    this.applyOneHand(paper, primaryWorld, aim, viewerPos);
  }

  end(): void {
    this.grabbing = false;
    this.primary = null;
    this.twoHand = false;
    this.hasAim = false;
  }

  resetScale(paper: Object3D): void {
    paper.scale.set(1, 1, 1);
    this.end();
  }

  private captureTwoHand(paper: Object3D, a: Vector3, b: Vector3): void {
    paper.updateWorldMatrix(true, false);
    this.twoHand = true;
    this.mid0.copy(a).add(b).multiplyScalar(0.5);
    this.axis0.copy(b).sub(a);
    this.dist0 = Math.max(this.axis0.length(), 0.04);
    this.axis0.normalize();
    this.pos0.copy(paper.position);
    this.quat0.copy(paper.quaternion);
    this.scale0 = paper.scale.x;
  }

  private applyOneHand(
    paper: Object3D,
    handWorld: Vector3,
    aim: Vector3 | null,
    viewerPos?: Vector3 | null,
  ): void {
    if (this.hasAim && aim && aim.lengthSq() > 0.0004) {
      _aim.copy(aim).normalize();
      _q.setFromUnitVectors(this.aim0, _aim);
      paper.quaternion.copy(this.paperQuat0).premultiply(_q);
    }
    paper.updateWorldMatrix(true, false);
    _grabWorld.copy(this.grabLocal);
    paper.localToWorld(_grabWorld);
    _delta.copy(handWorld).sub(_grabWorld);
    paper.position.add(_delta);
    clampPaperReach(paper, viewerPos);
  }

  private applyTwoHand(paper: Object3D, a: Vector3, b: Vector3, viewerPos?: Vector3 | null): void {
    _mid.copy(a).add(b).multiplyScalar(0.5);
    _axis.copy(b).sub(a);
    const dist = Math.max(_axis.length(), 0.04);
    _axis.normalize();
    _from.copy(this.axis0);
    _q.setFromUnitVectors(_from, _axis);
    paper.position.copy(this.pos0).add(_mid).sub(this.mid0);
    paper.quaternion.copy(this.quat0).premultiply(_q);
    const scale = Math.min(PAPER_SCALE_MAX, Math.max(PAPER_SCALE_MIN, this.scale0 * (dist / this.dist0)));
    paper.scale.setScalar(scale);
    clampPaperReach(paper, viewerPos);
  }
}

export function clampPaperReach(paper: Object3D, viewerPos?: Vector3 | null): void {
  if (!viewerPos) {
    return;
  }
  _offset.copy(paper.position).sub(viewerPos);
  const distance = _offset.length();
  if (!Number.isFinite(distance) || distance < 1e-5) {
    paper.position.copy(viewerPos);
    paper.position.z -= PAPER_MOVE_MIN_DISTANCE_M;
    return;
  }
  if (distance < PAPER_MOVE_MIN_DISTANCE_M) {
    _offset.setLength(PAPER_MOVE_MIN_DISTANCE_M);
    paper.position.copy(viewerPos).add(_offset);
  } else if (distance > PAPER_MOVE_MAX_DISTANCE_M) {
    _offset.setLength(PAPER_MOVE_MAX_DISTANCE_M);
    paper.position.copy(viewerPos).add(_offset);
  }
  const minY = viewerPos.y - 0.65;
  const maxY = viewerPos.y + 0.45;
  paper.position.y = Math.min(maxY, Math.max(minY, paper.position.y));
}

export function handAimFromJoints(
  wrist: [number, number, number] | null | undefined,
  pinch: [number, number, number] | null | undefined,
  target = _aim,
): Vector3 | null {
  if (!wrist || !pinch) {
    return null;
  }
  target.set(pinch[0] - wrist[0], pinch[1] - wrist[1], pinch[2] - wrist[2]);
  if (target.lengthSq() < 0.0004) {
    return null;
  }
  return target;
}
