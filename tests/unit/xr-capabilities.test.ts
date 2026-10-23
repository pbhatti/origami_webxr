import { describe, expect, it, vi } from 'vitest';
import {
  AR_UNAVAILABLE_MESSAGE,
  canLaunchImmersiveAr,
  detectXRCapabilities,
  readEnabledFeatures,
  sessionHasHandTracking,
} from '../../src/xr/XRCapabilities.ts';

function fakeXr(supported: Partial<Record<XRSessionMode, boolean>>): XRSystem {
  return {
    isSessionSupported: vi.fn(async (mode: XRSessionMode) => supported[mode] === true),
    requestSession: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    ondevicechange: null,
  } as unknown as XRSystem;
}

describe('detectXRCapabilities', () => {
  it('reports a missing WebXR implementation without inventing support', async () => {
    const report = await detectXRCapabilities(undefined, true);
    expect(report.webxr).toBe(false);
    expect(report.immersiveArSupported).toBe(false);
    expect(canLaunchImmersiveAr(report)).toBe(false);
    expect(report.errors.some((error) => error.includes('navigator.xr'))).toBe(true);
  });

  it('requires a secure context even when immersive-ar reports support', async () => {
    const report = await detectXRCapabilities(fakeXr({ 'immersive-ar': true }), false);
    expect(report.immersiveArSupported).toBe(true);
    expect(report.secureContext).toBe(false);
    expect(canLaunchImmersiveAr(report)).toBe(false);
  });

  it('accepts immersive-ar only after isSessionSupported returns true', async () => {
    const report = await detectXRCapabilities(
      fakeXr({ 'immersive-ar': true, 'immersive-vr': true }),
      true,
    );
    expect(report.immersiveArSupported).toBe(true);
    expect(canLaunchImmersiveAr(report)).toBe(true);
    expect(report.notes.join(' ')).toMatch(/optional WebXR feature/i);
  });

  it('surfaces the product fallback copy when AR is unsupported', async () => {
    const report = await detectXRCapabilities(fakeXr({ 'immersive-ar': false }), true);
    expect(report.errors).toContain(AR_UNAVAILABLE_MESSAGE);
  });

  it('does not treat Quest user-agent strings as hand-tracking proof', async () => {
    vi.stubGlobal('navigator', { userAgent: 'OculusBrowser/35.0' });
    const report = await detectXRCapabilities(fakeXr({ 'immersive-ar': true }), true);
    expect(report.userAgent).toContain('OculusBrowser');
    expect(report.notes.join(' ')).not.toMatch(/hand tracking is available/i);
  });
});

describe('session feature negotiation helpers', () => {
  it('reads enabledFeatures when the runtime exposes them', () => {
    const session = { enabledFeatures: ['local-floor', 'hand-tracking'] } as unknown as XRSession;
    expect(readEnabledFeatures(session)).toEqual(['local-floor', 'hand-tracking']);
    expect(sessionHasHandTracking(session)).toBe(true);
  });

  it('returns unknown when enabledFeatures is missing instead of guessing', () => {
    const session = {} as XRSession;
    expect(sessionHasHandTracking(session)).toBe('unknown');
  });
});
