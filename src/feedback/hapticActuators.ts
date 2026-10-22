export interface HapticPulseTarget {
  handedness: XRHandedness;
  pulse: (intensity: number, durationMs: number) => Promise<unknown> | unknown;
}

function isHandSource(source: XRInputSource): boolean {
  return Boolean(source.hand);
}

function actuatorFromGamepad(pad: Gamepad | null | undefined): GamepadHapticActuator | null {
  if (!pad) {
    return null;
  }
  const list = pad.hapticActuators;
  if (list && list.length > 0) {
    return list[0] ?? null;
  }
  return pad.vibrationActuator ?? null;
}

export function hapticTargetFromSource(source: XRInputSource): HapticPulseTarget | null {
  if (isHandSource(source)) {
    return null;
  }
  const actuator = actuatorFromGamepad(source.gamepad);
  if (!actuator) {
    return null;
  }
  const pulseFn = (actuator as GamepadHapticActuator & { pulse?: (value: number, duration: number) => Promise<boolean> }).pulse;
  if (typeof pulseFn === 'function') {
    return {
      handedness: source.handedness,
      pulse: (intensity, durationMs) => pulseFn.call(actuator, intensity, durationMs),
    };
  }
  if (typeof actuator.playEffect === 'function') {
    return {
      handedness: source.handedness,
      pulse: (intensity, durationMs) =>
        actuator.playEffect('dual-rumble', {
          duration: durationMs,
          startDelay: 0,
          strongMagnitude: intensity,
          weakMagnitude: intensity * 0.65,
        }),
    };
  }
  return null;
}

export function listHapticTargets(sources: Iterable<XRInputSource>): HapticPulseTarget[] {
  const targets: HapticPulseTarget[] = [];
  for (const source of sources) {
    const target = hapticTargetFromSource(source);
    if (target) {
      targets.push(target);
    }
  }
  return targets;
}

export function pulseControllerHaptics(
  sources: Iterable<XRInputSource>,
  intensity: number,
  durationMs: number,
): boolean {
  const targets = listHapticTargets(sources);
  for (const target of targets) {
    try {
      void target.pulse(intensity, durationMs);
    } catch {
      // Quest Browser may reject unsupported actuators; skip.
    }
  }
  return targets.length > 0;
}
