export interface XRCapabilityReport {
  secureContext: boolean;
  webxr: boolean;
  immersiveArSupported: boolean;
  immersiveVrSupported: boolean;
  userAgent: string;
  errors: string[];
  notes: string[];
  checkedAt: number;
}

export const AR_UNAVAILABLE_MESSAGE = 'AR unavailable in this browser';
export const HAND_TRACKING_UNAVAILABLE_MESSAGE = 'Hand tracking unavailable';

function browserUserAgent(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
}

async function probeSessionMode(
  xr: XRSystem,
  mode: XRSessionMode,
): Promise<{ supported: boolean; error?: string }> {
  try {
    const supported = await xr.isSessionSupported(mode);
    return { supported };
  } catch (error) {
    return {
      supported: false,
      error: `${mode} probe failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function detectXRCapabilities(
  xr: XRSystem | undefined = typeof navigator === 'undefined' ? undefined : navigator.xr,
  secureContext: boolean = typeof window === 'undefined' ? false : window.isSecureContext,
): Promise<XRCapabilityReport> {
  const errors: string[] = [];
  const notes: string[] = [];
  const report: XRCapabilityReport = {
    secureContext,
    webxr: Boolean(xr),
    immersiveArSupported: false,
    immersiveVrSupported: false,
    userAgent: browserUserAgent(),
    errors,
    notes,
    checkedAt: Date.now(),
  };

  if (!secureContext) {
    errors.push('WebXR requires a secure context (HTTPS or localhost).');
  }

  if (!xr) {
    errors.push('navigator.xr is missing. This browser does not expose the WebXR Device API.');
    notes.push('Desktop preview remains available. Quest Browser over HTTPS is required for passthrough AR.');
    return report;
  }

  const ar = await probeSessionMode(xr, 'immersive-ar');
  report.immersiveArSupported = ar.supported;
  if (ar.error) {
    errors.push(ar.error);
  }

  const vr = await probeSessionMode(xr, 'immersive-vr');
  report.immersiveVrSupported = vr.supported;
  if (vr.error) {
    notes.push(vr.error);
  }

  notes.push(
    'Hand tracking is not inferred from the browser user agent. It will be requested as an optional WebXR feature during session start, then read from the granted session features.',
  );

  if (!report.immersiveArSupported) {
    errors.push(AR_UNAVAILABLE_MESSAGE);
  }

  return report;
}

export function canLaunchImmersiveAr(report: XRCapabilityReport): boolean {
  return report.secureContext && report.webxr && report.immersiveArSupported;
}

export function readEnabledFeatures(session: XRSession | undefined): string[] {
  if (!session) {
    return [];
  }
  const withFeatures = session as XRSession & {
    enabledFeatures?: ReadonlyArray<string> | null;
  };
  return withFeatures.enabledFeatures ? [...withFeatures.enabledFeatures] : [];
}

export function sessionHasHandTracking(session: XRSession | undefined): boolean | 'unknown' {
  const features = readEnabledFeatures(session);
  if (features.length === 0) {
    return 'unknown';
  }
  return features.includes('hand-tracking');
}
