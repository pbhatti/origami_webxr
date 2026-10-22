import { describe, expect, it } from 'vitest';
import {
  COPY,
  CREATION_CATEGORIES,
  PRODUCT_SENTENCE,
  PRODUCT_TAGLINE,
  PRODUCT_TITLE,
  capabilityHeadline,
  startButtonLabel,
} from '../../src/ui/welcomeCopy.ts';
import { AR_UNAVAILABLE_MESSAGE, type XRCapabilityReport } from '../../src/xr/XRCapabilities.ts';

function report(overrides: Partial<XRCapabilityReport>): XRCapabilityReport {
  return {
    secureContext: true,
    webxr: true,
    immersiveArSupported: true,
    immersiveVrSupported: false,
    userAgent: 'test',
    errors: [],
    notes: [],
    checkedAt: 0,
    ...overrides,
  };
}

describe('welcome copy', () => {
  it('uses Fold & Play identity across the launcher', () => {
    expect(PRODUCT_TITLE).toBe('Fold & Play');
    expect(PRODUCT_TAGLINE).toBe('Simple folds. Big imagination.');
    expect(PRODUCT_SENTENCE).toBe('Pick a creation, fold it with your hands, and watch it come to life.');
    expect(COPY.gallery.heading).toBe('Explore Creations');
    expect(COPY.gallery.foldNow).toBe('Fold Now');
    expect(COPY.gallery.comingSoon).toBe('Coming Soon');
    expect(COPY.gallery.gestureHint).toBe('Use your hands to pinch, fold & play.');
    expect(COPY.session.start).toBe('Start Folding');
    expect(COPY.session.progress).toBe('Folding steps');
    expect(COPY.completion.bat).toBe('Your little bat is ready to fly!');
    expect(COPY.session.restart).toBe('Fold Again');
    expect(COPY.session.menu).toBe('Explore');
    expect(COPY.completion.heading).toBe("It's alive!");
    expect(COPY.completion.body).toBe('Your creation is ready to play!');
    expect(COPY.completion.explore).toBe('Explore More');
    expect(CREATION_CATEGORIES).toEqual(['Animals', 'Nature', 'Objects', 'Fantasy']);
  });

  it('keeps Start Folding as the explicit begin/reset action', () => {
    expect(startButtonLabel()).toBe('Start Folding');
    expect(startButtonLabel(true)).toBe('Enter Mixed Reality');
    expect(COPY.session.leaveHeading).toBe('Leave Fold & Play?');
    expect(COPY.session.yesLeave).toBe('Yes, Leave');
    expect(COPY.session.noStay).toBe('No, Stay');
  });

  it('uses the product fallback when immersive-ar is missing', () => {
    expect(capabilityHeadline(report({ immersiveArSupported: false }))).toBe(
      AR_UNAVAILABLE_MESSAGE,
    );
  });
});
