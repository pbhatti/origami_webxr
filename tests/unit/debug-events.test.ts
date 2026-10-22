import { describe, expect, it, vi } from 'vitest';
import { DebugEvents, MAX_DEBUG_EVENTS } from '../../src/telemetry/DebugEvents.ts';

describe('DebugEvents', () => {
  it('keeps a rolling buffer of 30 events', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const events = new DebugEvents();
    for (let i = 0; i < MAX_DEBUG_EVENTS + 5; i += 1) {
      events.emit('stateChanged', { i });
    }
    const latest = events.latest();
    expect(latest).toHaveLength(MAX_DEBUG_EVENTS);
    expect(latest[0]?.payload).toEqual({ i: 5 });
    expect(latest.at(-1)?.payload).toEqual({ i: MAX_DEBUG_EVENTS + 4 });
  });
});
