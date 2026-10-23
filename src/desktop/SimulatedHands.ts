import {
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { emptyHandSample, midpoint, type HandSample } from '../input/HandTrackingAdapter.ts';
import type { HandId } from '../input/HandOwnership.ts';
import { PINCH_ENGAGE_M, PINCH_RELEASE_M } from '../input/PinchRecognizer.ts';

const _ray = new Raycaster();
const _hit = new Vector3();
const _origin = new Vector3();
const _normal = new Vector3();
const _plane = new Plane();

export class SimulatedHands {
  enabled = false;
  private active: HandId = 'right';
  private pinching = false;
  private pointerNdc = new Vector2(Number.NaN, Number.NaN);
  private unbind: (() => void) | null = null;

  bind(canvas: HTMLCanvasElement): void {
    this.unbind?.();
    const onMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      this.pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      onMove(event);
      this.pinching = true;
      this.active = event.shiftKey ? 'left' : 'right';
    };
    const onUp = (): void => {
      this.pinching = false;
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === '1') {
        this.active = 'left';
      }
      if (event.key === '2') {
        this.active = 'right';
      }
      if (event.key === ' ') {
        this.pinching = event.type === 'keydown';
        event.preventDefault();
      }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    this.unbind = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  sampleHands(
    camera: PerspectiveCamera,
    paperRoot: Group,
    grabBar?: Object3D,
    moveHandle?: Object3D,
    galleryRoot?: Object3D,
  ): { left: HandSample; right: HandSample; panelPoint: Vector3 | null } {
    const left = emptyHandSample('left');
    const right = emptyHandSample('right');
    if (!this.enabled || !Number.isFinite(this.pointerNdc.x)) {
      return { left, right, panelPoint: null };
    }
    _ray.setFromCamera(this.pointerNdc, camera);
    if (grabBar) {
      const panelHits = _ray.intersectObject(grabBar, false);
      const panelHit = panelHits[0]?.point;
      if (panelHit) {
        return this.buildPair(panelHit, panelHit.clone());
      }
    }
    if (moveHandle) {
      const handleHits = _ray.intersectObject(moveHandle, true);
      const handleHit = handleHits[0]?.point;
      if (handleHit) {
        return this.buildPair(handleHit, null);
      }
    }
    if (galleryRoot?.visible) {
      galleryRoot.updateWorldMatrix(true, true);
      const galleryHit = _ray.intersectObject(galleryRoot, true)[0]?.point;
      if (galleryHit) {
        return this.buildPair(galleryHit, null);
      }
    }
    paperRoot.updateWorldMatrix(true, false);
    _normal.set(0, 0, 1).transformDirection(paperRoot.matrixWorld);
    paperRoot.getWorldPosition(_origin);
    _plane.setFromNormalAndCoplanarPoint(_normal, _origin);
    const hit = _ray.ray.intersectPlane(_plane, _hit);
    if (!hit) {
      return { left, right, panelPoint: null };
    }
    return this.buildPair(hit, null);
  }

  private buildPair(hit: Vector3, panelPoint: Vector3 | null): { left: HandSample; right: HandSample; panelPoint: Vector3 | null } {
    const distance = this.pinching ? PINCH_ENGAGE_M * 0.6 : PINCH_RELEASE_M * 1.4;
    const index: [number, number, number] = [hit.x, hit.y, hit.z];
    const thumb: [number, number, number] = [hit.x, hit.y + distance, hit.z];
    const built: HandSample = {
      hand: this.active,
      tracked: true,
      valid: true,
      jointCount: 2,
      pinchDistanceM: distance,
      pinchMidpoint: midpoint(index, thumb),
      indexTip: index,
      thumbTip: thumb,
      wrist: index,
      palm: index,
      rayOrigin: [_ray.ray.origin.x, _ray.ray.origin.y, _ray.ray.origin.z],
      rayDirection: [_ray.ray.direction.x, _ray.ray.direction.y, _ray.ray.direction.z],
      source: 'simulated',
    };
    if (this.active === 'left') {
      return { left: built, right: emptyHandSample('right'), panelPoint };
    }
    return { left: emptyHandSample('left'), right: built, panelPoint };
  }

  dispose(): void {
    this.unbind?.();
    this.unbind = null;
  }
}
