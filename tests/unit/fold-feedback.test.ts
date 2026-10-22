import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLD_FEEDBACK,
  foldFeedbackBus,
  resetFoldFeedbackConfig,
  shouldPlayFeedback,
  type FoldFeedbackName,
  type FoldFeedbackPayload,
} from '../../src/feedback/foldFeedback.ts';
import { hapticTargetFromSource, pulseControllerHaptics } from '../../src/feedback/hapticActuators.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { FOLD_ASSIST } from '../../src/origami/foldAssist.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import { FIXTURE_VERTICES, HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { FOX_NAMED, FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { WHALE_NAMED, WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import type { FoldStep, Vec3 } from '../../src/origami/types.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

const half = PAPER_SIZE_M / 2;

afterEach(() => {
  foldFeedbackBus.clear();
  resetFoldFeedbackConfig();
});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function record(): Array<{ name: FoldFeedbackName; payload: FoldFeedbackPayload }> {
  const events: Array<{ name: FoldFeedbackName; payload: FoldFeedbackPayload }> = [];
  foldFeedbackBus.on((name, payload) => events.push({ name, payload }));
  return events;
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function driveToAutoSnap(engine: OrigamiEngine, step: FoldStep): void {
  const grab = step.arrowPathLocal[0] ?? [half, 0, 0];
  const end = step.arrowPathLocal.at(-1) ?? [-0.016, 0, 0];
  engine.beginGrab(grab);
  if (step.actionType === 'crease-press') {
    for (let i = 0; i < 40; i += 1) {
      engine.updateFold(grab, false, 16);
      if (`${engine.enginePhase}` === 'snapping') {
        return;
      }
    }
    return;
  }
  for (let t = 0.2; t <= 1.001; t += 0.04) {
    const local = mix(grab, end, t);
    engine.updateFold(local, false, 16);
    if (`${engine.enginePhase}` === 'snapping') {
      return;
    }
    if (engine.foldCompletion >= 0.58) {
      for (let i = 0; i < 10; i += 1) {
        engine.updateFold(local, false, 16);
        if (`${engine.enginePhase}` === 'snapping') {
          return;
        }
      }
    }
  }
}

describe('fold feedback policy', () => {
  it('plays attraction and lock cues, but not debug assist unless enabled', () => {
    const payload = {
      recipeId: 'origami-whale',
      stepId: 'diag-fold',
      crease: [[0, 0, 0], [0.1, 0, 0]] as [Vec3, Vec3],
      assist: false,
    };
    expect(shouldPlayFeedback('fold:snap-start', payload)).toBe(true);
    expect(shouldPlayFeedback('fold:snap-complete', payload)).toBe(true);
    expect(shouldPlayFeedback('fold:snap-start', { ...payload, assist: true })).toBe(false);
    FOLD_FEEDBACK.debugAssist = true;
    expect(shouldPlayFeedback('fold:snap-complete', { ...payload, assist: true })).toBe(true);
    FOLD_FEEDBACK.enabled = false;
    expect(shouldPlayFeedback('fold:snap-start', payload)).toBe(false);
  });

  it('does not change magnetic snap thresholds', () => {
    expect(FOLD_ASSIST.autoSnapThreshold).toBeCloseTo(0.58);
    expect(FOLD_ASSIST.activationThreshold).toBeCloseTo(0.5);
    expect(FOLD_ASSIST.snapDurationMs).toBe(320);
  });
});

describe('fold feedback events', () => {
  it('fires one start and one complete per successful half-fold snap', () => {
    const events = record();
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    const local: Vec3 = [-0.016, 0, 0];
    for (let i = 0; i < 10; i += 1) {
      engine.updateFold(local, false, 16);
    }
    expect(engine.enginePhase).toBe('snapping');
    expect(events.map((event) => event.name)).toEqual(['fold:snap-start']);
    drain(engine, 400);
    expect(events.map((event) => event.name)).toEqual(['fold:snap-start', 'fold:snap-complete']);
    expect(events[1]?.payload.stepId).toBe('half-fold');
    expect(events[1]?.payload.assist).toBe(false);
  });

  it('does not fire a success cue for an invalid or cancelled fold', () => {
    const events = record();
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0.04, 0, 0], false, 16);
    expect(engine.release().ok).toBe(false);
    drain(engine, 400);
    expect(events.map((event) => event.name)).toEqual(['fold:snap-cancelled']);

    engine.beginGrab([half, 0, 0]);
    engine.updateFold([0.04, 0, 0], false, 16);
    engine.cancelActive();
    drain(engine, 400);
    expect(events.filter((event) => event.name === 'fold:snap-complete')).toHaveLength(0);
  });

  it('skips playback for A-key assist unless debug assist is enabled', () => {
    const events = record();
    const engine = new OrigamiEngine(HALF_FOLD_RECIPE, FIXTURE_VERTICES);
    engine.assistToTarget();
    drain(engine, 400);
    expect(events).toHaveLength(2);
    expect(events[0]?.payload.assist).toBe(true);
    expect(shouldPlayFeedback(events[0]!.name, events[0]!.payload)).toBe(false);
    expect(shouldPlayFeedback(events[1]!.name, events[1]!.payload)).toBe(false);
  });

  it('emits the same start/complete pair for every whale fold', () => {
    const events = record();
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    for (const step of WHALE_RECIPE.steps) {
      driveToAutoSnap(engine, step);
      drain(engine, 400);
      const forStep = events.filter((event) => event.payload.stepId === step.id);
      expect(forStep.filter((event) => event.name === 'fold:snap-start'), step.id).toHaveLength(1);
      expect(forStep.filter((event) => event.name === 'fold:snap-complete'), step.id).toHaveLength(1);
    }
  });

  it('emits the same start/complete pair for every fox fold', () => {
    const events = record();
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    for (const step of FOX_RECIPE.steps) {
      driveToAutoSnap(engine, step);
      drain(engine, 400);
      const forStep = events.filter((event) => event.payload.stepId === step.id);
      expect(forStep.filter((event) => event.name === 'fold:snap-start'), step.id).toHaveLength(1);
      expect(forStep.filter((event) => event.name === 'fold:snap-complete'), step.id).toHaveLength(1);
    }
    expect(events[0]?.payload.recipeId).toBe('origami-fox');
  });
});

describe('controller haptics', () => {
  it('ignores bare hands and never calls navigator.vibrate', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const hand = { handedness: 'right', hand: {} } as unknown as XRInputSource;
    expect(hapticTargetFromSource(hand)).toBeNull();
    expect(pulseControllerHaptics([hand], 0.2, 40)).toBe(false);

    const pulse = vi.fn().mockResolvedValue(true);
    const controller = {
      handedness: 'left',
      gamepad: { hapticActuators: [{ pulse }] },
    } as unknown as XRInputSource;
    expect(hapticTargetFromSource(controller)).not.toBeNull();
    expect(pulseControllerHaptics([controller], 0.2, 40)).toBe(true);
    expect(pulse).toHaveBeenCalledWith(0.2, 40);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
