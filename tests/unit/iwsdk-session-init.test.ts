import { buildSessionInit, ReferenceSpaceType, SessionMode } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import {
  PREFERRED_REFERENCE_SPACE,
  REFERENCE_SPACE_FALLBACKS,
  createReferenceSpaceSpec,
} from '../../src/xr/ReferenceSpace.ts';
import { WORLD_OPTIONS } from '../../src/xr/XRSessionManager.ts';

describe('verified IWSDK session mapping', () => {
  it('exports SessionMode.ImmersiveAR as immersive-ar', () => {
    expect(SessionMode.ImmersiveAR).toBe('immersive-ar');
  });

  it('requests hand-tracking as optional, never required, for Phase 0', () => {
    const init = buildSessionInit({
      sessionMode: SessionMode.ImmersiveAR,
      features: { handTracking: true, layers: true },
    });
    expect(init.optionalFeatures).toContain('hand-tracking');
    expect(init.requiredFeatures ?? []).not.toContain('hand-tracking');
  });

  it('prefers local-floor with local and viewer fallbacks', () => {
    const spec = createReferenceSpaceSpec();
    expect(PREFERRED_REFERENCE_SPACE).toBe(ReferenceSpaceType.LocalFloor);
    expect(spec).toMatchObject({
      type: ReferenceSpaceType.LocalFloor,
      required: false,
      fallbackOrder: REFERENCE_SPACE_FALLBACKS,
    });
  });

  it('does not auto-offer XR or enable grabbing in world options', () => {
    expect(WORLD_OPTIONS.xr).toMatchObject({
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none',
    });
    expect(WORLD_OPTIONS.features).toMatchObject({
      grabbing: false,
      locomotion: false,
      camera: false,
    });
  });
});
