import { describe, expect, it, vi } from 'vitest';
import { HandSession } from '../../src/input/HandSession.ts';
import { emptyHandSample, type HandSample } from '../../src/input/HandTrackingAdapter.ts';
import { PINCH_ENGAGE_M, PINCH_RELEASE_M } from '../../src/input/PinchRecognizer.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function closed(hand: 'left' | 'right', localX = 0.06): HandSample {
  const tip: [number, number, number] = [localX, 0, 0];
  return {
    ...emptyHandSample(hand),
    tracked: true,
    valid: true,
    jointCount: 2,
    pinchDistanceM: PINCH_ENGAGE_M * 0.5,
    pinchMidpoint: tip,
    indexTip: tip,
    thumbTip: tip,
    source: 'hand-joints',
  };
}

function open(hand: 'left' | 'right'): HandSample {
  return {
    ...closed(hand),
    pinchDistanceM: PINCH_RELEASE_M * 1.5,
  };
}

function pinchFrames(
  session: HandSession,
  sample: HandSample,
  local: [number, number, number],
  startMs = 0,
  extras: { leftMove?: boolean; rightMove?: boolean } = {},
) {
  const frame = (nowMs: number) =>
    session.update({
      nowMs,
      left: sample.hand === 'left' ? sample : emptyHandSample('left'),
      right: sample.hand === 'right' ? sample : emptyHandSample('right'),
      leftLocal: sample.hand === 'left' ? local : null,
      rightLocal: sample.hand === 'right' ? local : null,
      leftPanel: false,
      rightPanel: false,
      leftMove: extras.leftMove,
      rightMove: extras.rightMove,
    });
  let snapshot = frame(startMs);
  for (let i = 1; i < 3; i += 1) {
    snapshot = frame(startMs + i);
  }
  return snapshot;
}

describe('HandSession', () => {
  it('grabs the moving region after a debounced pinch and lifts along the normal', () => {
    const session = new HandSession();
    pinchFrames(session, closed('right'), [0.06, 0, 0]);
    const snapshot = session.update({
      nowMs: 4,
      left: emptyHandSample('left'),
      right: closed('right'),
      leftLocal: null,
      rightLocal: [0.06, 0, 0.02],
      leftPanel: false,
      rightPanel: false,
    });
    expect(snapshot.grabbed).toBe(true);
    expect(snapshot.foldOwner).toBe('right');
    expect(snapshot.liftM).toBeCloseTo(0.03);
    expect(snapshot.uiDisabled).toBe(true);
  });

  it('does not start a fold when pinching the hold half', () => {
    const session = new HandSession();
    const snapshot = pinchFrames(session, closed('left'), [-0.06, 0, 0]);
    expect(snapshot.grabbed).toBe(false);
    expect(snapshot.holdOwner).toBe('left');
    expect(snapshot.foldOwner).toBeNull();
  });

  it('keeps first-hand ownership when the other hand pinches the moving half', () => {
    const session = new HandSession();
    pinchFrames(session, closed('right'), [0.06, 0, 0]);
    const snapshot = pinchFrames(session, closed('left'), [0.07, 0, 0], 10);
    expect(snapshot.foldOwner).toBe('right');
    expect(snapshot.pinchCounts.right).toBe(1);
    expect(snapshot.pinchCounts.left).toBe(0);
  });

  it('cancels an active grab after tracking is lost for 300ms', () => {
    const session = new HandSession();
    pinchFrames(session, closed('right'), [0.06, 0, 0], 0);
    const lost = emptyHandSample('right');
    session.update({
      nowMs: 20,
      left: emptyHandSample('left'),
      right: lost,
      leftLocal: null,
      rightLocal: null,
      leftPanel: false,
      rightPanel: false,
    });
    const cancelled = session.update({
      nowMs: 340,
      left: emptyHandSample('left'),
      right: lost,
      leftLocal: null,
      rightLocal: null,
      leftPanel: false,
      rightPanel: false,
    });
    expect(cancelled.grabbed).toBe(false);
    expect(cancelled.foldOwner).toBeNull();
    expect(cancelled.trackingMode).toBe('cancelled');
  });

  it('counts twenty successive pinches per hand without double-activating', () => {
    const session = new HandSession();
    for (let i = 0; i < 20; i += 1) {
      pinchFrames(session, closed('right'), [0.06, 0, 0], i * 20);
      pinchFrames(session, open('right'), [0.06, 0, 0], i * 20 + 8);
    }
    for (let i = 0; i < 20; i += 1) {
      pinchFrames(session, closed('left'), [0.06, 0, 0], 500 + i * 20);
      pinchFrames(session, open('left'), [0.06, 0, 0], 500 + i * 20 + 8);
    }
    const snapshot = pinchFrames(session, open('right'), [0.06, 0, 0], 2000);
    expect(snapshot.pinchCounts.right).toBe(20);
    expect(snapshot.pinchCounts.left).toBe(20);
    expect(snapshot.grabbed).toBe(false);
  });

  it('counts ten alternating pinches with a single owner at a time', () => {
    const session = new HandSession();
    for (let i = 0; i < 10; i += 1) {
      const hand = i % 2 === 0 ? 'right' : 'left';
      const grabbed = pinchFrames(session, closed(hand), [0.06, 0, 0], i * 30);
      expect(grabbed.foldOwner).toBe(hand);
      const released = pinchFrames(session, open(hand), [0.06, 0, 0], i * 30 + 10);
      expect(released.foldOwner).toBeNull();
    }
    expect(session.update({
      nowMs: 400,
      left: emptyHandSample('left'),
      right: emptyHandSample('right'),
      leftLocal: null,
      rightLocal: null,
      leftPanel: false,
      rightPanel: false,
    }).pinchCounts).toEqual({ left: 5, right: 5 });
  });

  it('claims Move on the handle without starting a fold', () => {
    const session = new HandSession();
    const snapshot = pinchFrames(session, closed('right'), [0, -0.16, 0.01], 0, { rightMove: true });
    expect(snapshot.grabbed).toBe(false);
    expect(snapshot.paperMoving).toBe(true);
    expect(snapshot.moveOwner).toBe('right');
    expect(snapshot.foldOwner).toBeNull();
  });

  it('ignores a pinch that is already held when a fresh pinch is required', () => {
    const session = new HandSession();
    session.armFreshPinch();
    const held = pinchFrames(session, closed('right'), [0.06, 0, 0], 20, { rightMove: true });
    expect(held.grabbed).toBe(false);
    expect(held.paperMoving).toBe(false);
    expect(session.awaitingFreshPinch).toBe(true);

    const released = pinchFrames(session, open('right'), [0.06, 0, 0], 40);
    expect(released.foldOwner).toBeNull();
    expect(session.awaitingFreshPinch).toBe(false);

    const right = pinchFrames(session, closed('right'), [0.06, 0, 0], 60);
    expect(right.foldOwner).toBe('right');
    pinchFrames(session, open('right'), [0.06, 0, 0], 80);
    const left = pinchFrames(session, closed('left'), [0.06, 0, 0], 100);
    expect(left.foldOwner).toBe('left');
  });

  it('accepts a new pinch when both hands are open after restart', () => {
    const session = new HandSession();
    session.armFreshPinch();
    session.update({
      nowMs: 1,
      left: open('left'),
      right: open('right'),
      leftLocal: null,
      rightLocal: null,
      leftPanel: false,
      rightPanel: false,
    });
    expect(session.awaitingFreshPinch).toBe(false);
    const grabbed = pinchFrames(session, closed('left'), [0.06, 0, 0], 10);
    expect(grabbed.grabbed).toBe(true);
    expect(grabbed.foldOwner).toBe('left');
  });

  it('keeps the fold grab after the pinch leaves the moving UV while still closed', () => {
    const session = new HandSession();
    pinchFrames(session, closed('right'), [0.06, 0, 0]);
    const snapshot = session.update({
      nowMs: 8,
      left: emptyHandSample('left'),
      right: closed('right'),
      leftLocal: null,
      rightLocal: [-0.08, 0, 0.04],
      leftPanel: false,
      rightPanel: false,
    });
    expect(snapshot.grabbed).toBe(true);
    expect(snapshot.foldOwner).toBe('right');
    expect(snapshot.ownerLocal).toEqual([-0.08, 0, 0.04]);
  });
});
