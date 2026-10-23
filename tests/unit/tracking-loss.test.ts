import { describe, expect, it } from 'vitest';
import { TrackingLossWatch } from '../../src/input/trackingLoss.ts';

describe('TrackingLossWatch', () => {
  it('freezes on first missing sample then cancels after 300ms', () => {
    const watch = new TrackingLossWatch();
    expect(watch.update(true, 0)).toBe('ok');
    expect(watch.update(false, 10)).toBe('frozen');
    expect(watch.update(false, 200)).toBe('frozen');
    expect(watch.update(false, 320)).toBe('cancelled');
  });

  it('recovers to ok without cancelling if tracking returns in time', () => {
    const watch = new TrackingLossWatch();
    watch.update(false, 0);
    expect(watch.update(true, 120)).toBe('ok');
    expect(watch.update(true, 400)).toBe('ok');
  });
});
