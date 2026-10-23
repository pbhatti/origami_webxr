import { describe, expect, it } from 'vitest';
import { PinchRecognizer } from '../../src/input/PinchRecognizer.ts';

function run(recognizer: PinchRecognizer, distance: number, frames: number) {
  let event: ReturnType<PinchRecognizer['update']> = null;
  for (let i = 0; i < frames; i += 1) {
    event = recognizer.update(distance);
  }
  return event;
}

describe('PinchRecognizer', () => {
  it('stays open until three frames under the engage threshold', () => {
    const pinch = new PinchRecognizer();
    expect(pinch.update(0.02)).toBeNull();
    expect(pinch.update(0.02)).toBeNull();
    expect(pinch.state).toBe('open');
    expect(pinch.update(0.02)).toBe('started');
    expect(pinch.state).toBe('closed');
  });

  it('does not engage from a distance between engage and release', () => {
    const pinch = new PinchRecognizer();
    expect(run(pinch, 0.03, 5)).toBeNull();
    expect(pinch.state).toBe('open');
  });

  it('stays closed in the hysteresis band after engage', () => {
    const pinch = new PinchRecognizer();
    run(pinch, 0.01, 3);
    expect(run(pinch, 0.032, 5)).toBeNull();
    expect(pinch.state).toBe('closed');
  });

  it('releases only after three frames above the release threshold', () => {
    const pinch = new PinchRecognizer();
    run(pinch, 0.01, 3);
    expect(pinch.update(0.05)).toBeNull();
    expect(pinch.update(0.05)).toBeNull();
    expect(pinch.update(0.05)).toBe('released');
    expect(pinch.state).toBe('open');
  });

  it('ignores null and non-finite samples without changing phase', () => {
    const pinch = new PinchRecognizer();
    expect(pinch.update(null)).toBeNull();
    expect(pinch.update(Number.NaN)).toBeNull();
    expect(pinch.state).toBe('open');
  });

  it('resets debounce if a frame leaves the engage zone', () => {
    const pinch = new PinchRecognizer();
    pinch.update(0.01);
    pinch.update(0.01);
    pinch.update(0.04);
    expect(run(pinch, 0.01, 2)).toBeNull();
    expect(pinch.state).toBe('open');
  });
});
