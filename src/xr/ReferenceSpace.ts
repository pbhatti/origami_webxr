import { ReferenceSpaceType } from '@iwsdk/core';
import type { ReferenceSpaceSpec } from '@iwsdk/core';

export const PREFERRED_REFERENCE_SPACE = ReferenceSpaceType.LocalFloor;

export const REFERENCE_SPACE_FALLBACKS: ReferenceSpaceType[] = [
  ReferenceSpaceType.Local,
  ReferenceSpaceType.Viewer,
];

export function createReferenceSpaceSpec(): ReferenceSpaceSpec {
  return {
    type: PREFERRED_REFERENCE_SPACE,
    required: false,
    fallbackOrder: [...REFERENCE_SPACE_FALLBACKS],
  };
}

export function referenceSpaceLabel(type: string | undefined): string {
  switch (type) {
    case ReferenceSpaceType.LocalFloor:
      return 'local-floor';
    case ReferenceSpaceType.Local:
      return 'local';
    case ReferenceSpaceType.Viewer:
      return 'viewer';
    case ReferenceSpaceType.BoundedFloor:
      return 'bounded-floor';
    case ReferenceSpaceType.Unbounded:
      return 'unbounded';
    default:
      return type ?? 'unknown';
  }
}
