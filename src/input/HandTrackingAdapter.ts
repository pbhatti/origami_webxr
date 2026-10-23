import { distance3 } from '../utils/math.ts';
import type { Vec3 } from '../origami/types.ts';
import type { HandId } from './HandOwnership.ts';

export const REQUIRED_JOINTS = [
  'wrist',
  'thumb-tip',
  'index-finger-tip',
  'index-finger-metacarpal',
  'middle-finger-metacarpal',
] as const;

export type PinchSource = 'hand-joints' | 'controller-trigger' | 'simulated';

export interface HandSample {
  hand: HandId;
  tracked: boolean;
  valid: boolean;
  jointCount: number;
  pinchDistanceM: number | null;
  pinchMidpoint: Vec3 | null;
  indexTip: Vec3 | null;
  thumbTip: Vec3 | null;
  wrist: Vec3 | null;
  palm: Vec3 | null;
  rayOrigin: Vec3 | null;
  rayDirection: Vec3 | null;
  source: PinchSource | null;
}

export interface GamepadLike {
  getButtonValue(id: string): number;
  getButtonValueByIdx(idx: number): number;
}

export const CONTROLLER_PINCH_OPEN_M = 0.08;
export const CONTROLLER_PINCH_CLOSED_M = 0.01;

const EMPTY: Omit<HandSample, 'hand'> = {
  tracked: false,
  valid: false,
  jointCount: 0,
  pinchDistanceM: null,
  pinchMidpoint: null,
  indexTip: null,
  thumbTip: null,
  wrist: null,
  palm: null,
  rayOrigin: null,
  rayDirection: null,
  source: null,
};

export function emptyHandSample(hand: HandId): HandSample {
  return { hand, ...EMPTY };
}

export function poseToVec3(pose: XRPose | XRJointPose | null | undefined): Vec3 | null {
  const position = pose?.transform?.position;
  if (!position) {
    return null;
  }
  const x = position.x;
  const y = position.y;
  const z = position.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return [x, y, z];
}

export function axesToPinchDistance(trigger: number, squeeze: number): number {
  const closed = Math.min(1, Math.max(0, Math.max(trigger, squeeze)));
  return CONTROLLER_PINCH_OPEN_M + closed * (CONTROLLER_PINCH_CLOSED_M - CONTROLLER_PINCH_OPEN_M);
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function readButton(gamepad: GamepadLike | undefined, id: string, index: number): number {
  if (!gamepad) {
    return 0;
  }
  try {
    const named = gamepad.getButtonValue(id);
    if (Number.isFinite(named)) {
      return named;
    }
  } catch {
    /* layout may omit the named id */
  }
  try {
    const byIndex = gamepad.getButtonValueByIdx(index);
    return Number.isFinite(byIndex) ? byIndex : 0;
  } catch {
    return 0;
  }
}

function readJoint(
  frame: XRFrame,
  space: XRReferenceSpace,
  hand: XRHand,
  name: (typeof REQUIRED_JOINTS)[number],
): Vec3 | null {
  try {
    const joint = hand.get?.(name as XRHandJoint);
    if (!joint || typeof frame.getJointPose !== 'function') {
      return null;
    }
    return poseToVec3(frame.getJointPose(joint, space));
  } catch {
    return null;
  }
}

function finishPinch(sample: HandSample, thumb: Vec3 | null, index: Vec3 | null): HandSample {
  if (!thumb || !index) {
    return sample;
  }
  const pinchDistanceM = distance3(thumb, index);
  if (!Number.isFinite(pinchDistanceM)) {
    return sample;
  }
  return {
    ...sample,
    valid: true,
    pinchDistanceM,
    pinchMidpoint: midpoint(thumb, index),
    thumbTip: thumb,
    indexTip: index,
  };
}

export function sampleHandJoints(
  hand: HandId,
  frame: XRFrame,
  space: XRReferenceSpace,
  xrHand: XRHand,
): HandSample {
  const wrist = readJoint(frame, space, xrHand, 'wrist');
  const thumbTip = readJoint(frame, space, xrHand, 'thumb-tip');
  const indexTip = readJoint(frame, space, xrHand, 'index-finger-tip');
  const indexMeta = readJoint(frame, space, xrHand, 'index-finger-metacarpal');
  const palm = readJoint(frame, space, xrHand, 'middle-finger-metacarpal') ?? wrist;
  const joints = [wrist, thumbTip, indexTip, indexMeta, palm];
  const jointCount = joints.filter((joint) => joint != null).length;
  const tracked = jointCount > 0;
  const sample: HandSample = {
    ...emptyHandSample(hand),
    tracked,
    jointCount,
    wrist,
    palm,
    thumbTip,
    indexTip,
    source: 'hand-joints',
  };
  return finishPinch(sample, thumbTip, indexTip);
}

export function sampleController(
  hand: HandId,
  frame: XRFrame,
  space: XRReferenceSpace,
  source: XRInputSource,
  gamepad: GamepadLike | undefined,
): HandSample {
  let pose: XRPose | undefined;
  try {
    pose = frame.getPose(source.targetRaySpace, space) ?? undefined;
  } catch {
    pose = undefined;
  }
  const origin = poseToVec3(pose);
  const orientation = pose?.transform.orientation;
  const direction: Vec3 | null = orientation
    ? rotateForward(orientation)
    : origin
      ? [0, 0, -1]
      : null;
  const trigger = readButton(gamepad, 'xr-standard-trigger', 0);
  const squeeze = readButton(gamepad, 'xr-standard-squeeze', 1);
  const pinchDistanceM = axesToPinchDistance(trigger, squeeze);
  if (!origin || !Number.isFinite(pinchDistanceM)) {
    return {
      ...emptyHandSample(hand),
      tracked: Boolean(origin),
      rayOrigin: origin,
      rayDirection: direction,
      source: 'controller-trigger',
    };
  }
  const thumb: Vec3 = [origin[0], origin[1] + pinchDistanceM * 0.5, origin[2]];
  return {
    hand,
    tracked: true,
    valid: true,
    jointCount: 0,
    pinchDistanceM,
    pinchMidpoint: origin,
    indexTip: origin,
    thumbTip: thumb,
    wrist: origin,
    palm: origin,
    rayOrigin: origin,
    rayDirection: direction,
    source: 'controller-trigger',
  };
}

function rotateForward(orientation: DOMPointReadOnly): Vec3 {
  const vx = 0;
  const vy = 0;
  const vz = -1;
  const ix = orientation.x;
  const iy = orientation.y;
  const iz = orientation.z;
  const iw = orientation.w;
  const tx = 2 * (iy * vz - iz * vy);
  const ty = 2 * (iz * vx - ix * vz);
  const tz = 2 * (ix * vy - iy * vx);
  return [
    vx + iw * tx + (iy * tz - iz * ty),
    vy + iw * ty + (iz * tx - ix * tz),
    vz + iw * tz + (ix * ty - iy * tx),
  ];
}

export function collectInputSources(session: XRSession | undefined | null): XRInputSource[] {
  if (!session) {
    return [];
  }
  const sources = [...session.inputSources];
  const extra = (session as XRSession & { trackedSources?: ReadonlyArray<XRInputSource> }).trackedSources;
  if (extra) {
    for (const source of extra) {
      if (!sources.includes(source)) {
        sources.push(source);
      }
    }
  }
  return sources;
}

export function sampleHands(input: {
  frame: XRFrame | null;
  space: XRReferenceSpace | null;
  session: XRSession | undefined | null;
  gamepads?: Partial<Record<HandId, GamepadLike | undefined>>;
  getPrimary?: (hand: HandId) => XRInputSource | undefined;
}): Record<HandId, HandSample> {
  const left = emptyHandSample('left');
  const right = emptyHandSample('right');
  const result: Record<HandId, HandSample> = { left, right };
  if (!input.frame || !input.space) {
    return result;
  }

  const seen = new Set<HandId>();
  const sources = collectInputSources(input.session);
  for (const hand of ['left', 'right'] as const) {
    const primary = input.getPrimary?.(hand);
    if (primary && !sources.includes(primary)) {
      sources.push(primary);
    }
  }

  for (const source of sources) {
    if (source.handedness !== 'left' && source.handedness !== 'right') {
      continue;
    }
    const hand = source.handedness;
    if (seen.has(hand) && result[hand].source === 'hand-joints') {
      continue;
    }
    if (source.hand) {
      result[hand] = sampleHandJoints(hand, input.frame, input.space, source.hand);
      seen.add(hand);
    } else if (!seen.has(hand) || result[hand].source !== 'hand-joints') {
      result[hand] = sampleController(hand, input.frame, input.space, source, input.gamepads?.[hand]);
      seen.add(hand);
    }
  }
  return result;
}
