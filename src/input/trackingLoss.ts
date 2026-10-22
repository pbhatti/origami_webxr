export const TRACKING_FREEZE_MS = 300;

export type TrackingLossMode = 'ok' | 'frozen' | 'cancelled';

export class TrackingLossWatch {
  private missingSince: number | null = null;

  update(valid: boolean, nowMs: number, freezeMs = TRACKING_FREEZE_MS): TrackingLossMode {
    if (valid) {
      this.missingSince = null;
      return 'ok';
    }
    if (this.missingSince == null) {
      this.missingSince = nowMs;
      return 'frozen';
    }
    return nowMs - this.missingSince < freezeMs ? 'frozen' : 'cancelled';
  }

  reset(): void {
    this.missingSince = null;
  }
}
