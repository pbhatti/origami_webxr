export const PINCH_ENGAGE_M = 0.025;
export const PINCH_RELEASE_M = 0.04;
export const PINCH_DEBOUNCE_FRAMES = 3;

export type PinchPhase = 'open' | 'closed';
export type PinchEvent = 'started' | 'released' | null;

export class PinchRecognizer {
  private phase: PinchPhase = 'open';
  private pending = 0;

  constructor(
    private readonly engageM = PINCH_ENGAGE_M,
    private readonly releaseM = PINCH_RELEASE_M,
    private readonly debounceFrames = PINCH_DEBOUNCE_FRAMES,
  ) {}

  get state(): PinchPhase {
    return this.phase;
  }

  reset(): void {
    this.phase = 'open';
    this.pending = 0;
  }

  update(distanceM: number | null): PinchEvent {
    if (distanceM == null || !Number.isFinite(distanceM)) {
      this.pending = 0;
      return null;
    }

    if (this.phase === 'open') {
      if (distanceM < this.engageM) {
        this.pending += 1;
        if (this.pending >= this.debounceFrames) {
          this.phase = 'closed';
          this.pending = 0;
          return 'started';
        }
      } else {
        this.pending = 0;
      }
      return null;
    }

    if (distanceM > this.releaseM) {
      this.pending += 1;
      if (this.pending >= this.debounceFrames) {
        this.phase = 'open';
        this.pending = 0;
        return 'released';
      }
    } else {
      this.pending = 0;
    }
    return null;
  }
}
