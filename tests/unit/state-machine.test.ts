import { describe, expect, it } from 'vitest';
import {
  AppStateMachine,
  IllegalStateTransitionError,
} from '../../src/state/AppStateMachine.ts';

describe('AppStateMachine', () => {
  it('walks the boot path onto the origami gallery', () => {
    const machine = new AppStateMachine();
    machine.transition('CAPABILITY_CHECK');
    machine.transition('READY');
    machine.transition('WELCOME');
    machine.transition('GALLERY_OPEN');
    machine.transition('GALLERY_COLLAPSING');
    machine.transition('WHALE_LOADING');
    machine.transition('PAPER_READY');
    expect(machine.state).toBe('PAPER_READY');
  });

  it('walks the boot path onto world-stable paper', () => {
    const machine = new AppStateMachine();
    expect(machine.state).toBe('BOOT');
    machine.transition('CAPABILITY_CHECK');
    machine.transition('READY');
    machine.transition('WELCOME');
    machine.transition('PAPER_READY');
    expect(machine.state).toBe('PAPER_READY');
    machine.transition('WELCOME');
    expect(machine.state).toBe('WELCOME');
  });

  it('rejects illegal transitions instead of silently skipping', () => {
    const machine = new AppStateMachine();
    expect(() => machine.transition('FOLDING')).toThrow(IllegalStateTransitionError);
    expect(machine.state).toBe('BOOT');
  });

  it('treats duplicate transitions as idempotent', () => {
    const machine = new AppStateMachine('WELCOME');
    expect(machine.transition('WELCOME')).toBe('WELCOME');
  });

  it('clears transient flags on a legal transition', () => {
    const machine = new AppStateMachine('WELCOME');
    machine.setTransient('XR_SESSION_ENDED');
    machine.transition('FATAL_ERROR');
    expect(machine.transientState).toBeNull();
  });

  it('walks instruction to grab to folding and back without snapping', () => {
    const machine = new AppStateMachine('PAPER_READY');
    machine.transition('INSTRUCTION');
    machine.transition('GRAB_ARMED');
    machine.transition('FOLDING');
    machine.transition('INSTRUCTION');
    expect(machine.state).toBe('INSTRUCTION');
  });

  it('can recover from instruction onto completion after the last fold', () => {
    const machine = new AppStateMachine('INSTRUCTION');
    expect(machine.canTransition('COMPLETION')).toBe(true);
    machine.transition('COMPLETION');
    machine.transition('CREATURE_ALIVE');
    expect(machine.state).toBe('CREATURE_ALIVE');
  });

  it('walks a validated fold through snap, completion, creature, and replay', () => {
    const machine = new AppStateMachine('INSTRUCTION');
    machine.transition('GRAB_ARMED');
    machine.transition('FOLDING');
    machine.transition('SNAP_PENDING');
    machine.transition('SNAP_ANIMATING');
    machine.transition('FOLD_LOCKED');
    machine.transition('COMPLETION');
    machine.transition('CREATURE_ALIVE');
    machine.transition('REPLAY');
    machine.transition('INSTRUCTION');
    expect(machine.state).toBe('INSTRUCTION');
  });

  it('can overlay the gallery on an active whale session and continue', () => {
    const machine = new AppStateMachine('INSTRUCTION');
    machine.transition('GALLERY_OVERLAY');
    machine.transition('INSTRUCTION');
    expect(machine.state).toBe('INSTRUCTION');
  });

  it('forces instruction from states the fold graph cannot leave', () => {
    for (const state of ['SNAP_ANIMATING', 'FOLDING', 'CREATURE_ALIVE', 'GALLERY_OVERLAY', 'WHALE_LOADING'] as const) {
      const machine = new AppStateMachine(state);
      expect(machine.canTransition('INSTRUCTION')).toBe(state === 'FOLDING' || state === 'GALLERY_OVERLAY');
      machine.force('INSTRUCTION');
      expect(machine.state).toBe('INSTRUCTION');
      expect(machine.transientState).toBeNull();
    }
  });

  it('rolls an invalid release back to instruction', () => {
    const machine = new AppStateMachine('FOLDING');
    machine.transition('SNAP_PENDING');
    machine.transition('RETURN_ANIMATING');
    machine.transition('INSTRUCTION');
    expect(machine.state).toBe('INSTRUCTION');
  });
});
