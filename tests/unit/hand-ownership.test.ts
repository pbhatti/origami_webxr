import { describe, expect, it } from 'vitest';
import { HandOwnership } from '../../src/input/HandOwnership.ts';

describe('HandOwnership', () => {
  it('gives the first valid fold claim to that hand', () => {
    const ownership = new HandOwnership();
    expect(ownership.tryClaimFold('right')).toBe(true);
    expect(ownership.tryClaimFold('left')).toBe(false);
    expect(ownership.fold).toBe('right');
  });

  it('does not let the folding hand also own the hold', () => {
    const ownership = new HandOwnership();
    ownership.tryClaimFold('right');
    expect(ownership.tryClaimHold('right')).toBe(false);
    expect(ownership.tryClaimHold('left')).toBe(true);
    expect(ownership.hold).toBe('left');
  });

  it('releases one hand without clearing the other', () => {
    const ownership = new HandOwnership();
    ownership.tryClaimFold('right');
    ownership.tryClaimHold('left');
    ownership.releaseFold('right');
    expect(ownership.fold).toBeNull();
    expect(ownership.hold).toBe('left');
  });

  it('keeps move and fold from claiming at the same time', () => {
    const ownership = new HandOwnership();
    expect(ownership.tryClaimMove('right')).toBe(true);
    expect(ownership.tryClaimFold('left')).toBe(false);
    expect(ownership.tryClaimMoveSecondary('left')).toBe(true);
    expect(ownership.moveSecondary).toBe('left');
    ownership.release('right');
    expect(ownership.move).toBe('left');
    expect(ownership.moveSecondary).toBeNull();
  });

  it('blocks move while a fold is owned', () => {
    const ownership = new HandOwnership();
    ownership.tryClaimFold('right');
    expect(ownership.tryClaimMove('left')).toBe(false);
  });

  it('allows the other hand to take fold after release', () => {
    const ownership = new HandOwnership();
    ownership.tryClaimFold('left');
    ownership.release('left');
    expect(ownership.tryClaimFold('right')).toBe(true);
  });
});
