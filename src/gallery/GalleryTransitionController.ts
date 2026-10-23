import type { Object3D } from 'three';
import { clamp, easeOutCubic, lerp } from '../utils/math.ts';

export type GalleryTransitionKind = 'collapse' | 'expand' | 'idle';

export class GalleryTransitionController {
  private kind: GalleryTransitionKind = 'idle';
  private elapsed = 0;
  private duration = 0.3;
  private from = 1;
  private to = 1;
  private target: Object3D | null = null;
  private onDone: (() => void) | null = null;

  get active(): boolean {
    return this.kind !== 'idle';
  }

  get kindName(): GalleryTransitionKind {
    return this.kind;
  }

  collapse(target: Object3D, onDone?: () => void, duration = 0.3): void {
    this.start(target, 1, 0.02, 'collapse', onDone, duration);
  }

  expand(target: Object3D, onDone?: () => void, duration = 0.32): void {
    target.visible = true;
    target.scale.setScalar(0.02);
    this.start(target, 0.02, 1, 'expand', onDone, duration);
  }

  cancel(): void {
    const target = this.target;
    this.kind = 'idle';
    this.onDone = null;
    this.target = null;
    this.elapsed = 0;
    if (target) {
      target.visible = false;
      target.scale.setScalar(1);
    }
  }

  tick(dtSec: number): void {
    if (this.kind === 'idle' || !this.target) {
      return;
    }
    this.elapsed += dtSec;
    const t = easeOutCubic(this.elapsed / this.duration);
    const scale = lerp(this.from, this.to, t);
    this.target.scale.setScalar(Math.max(scale, 0.001));
    if (clamp(this.elapsed / this.duration, 0, 1) < 1) {
      return;
    }
    const done = this.onDone;
    const kind = this.kind;
    this.target.scale.setScalar(this.to);
    if (kind === 'collapse') {
      this.target.visible = false;
    }
    this.kind = 'idle';
    this.target = null;
    this.onDone = null;
    done?.();
  }

  private start(
    target: Object3D,
    from: number,
    to: number,
    kind: GalleryTransitionKind,
    onDone: (() => void) | undefined,
    duration: number,
  ): void {
    this.target = target;
    this.from = from;
    this.to = to;
    this.kind = kind;
    this.elapsed = 0;
    this.duration = duration;
    this.onDone = onDone ?? null;
  }
}
