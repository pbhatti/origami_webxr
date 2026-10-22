import { debugEvents } from '../telemetry/DebugEvents.ts';
import { clamp } from '../utils/math.ts';
import { PAPER_SIZE_M } from '../origami/placement.ts';
import type { Vec3 } from '../origami/types.ts';
import { classifyGrabMany, hitMovingRegion, PHASE2_HOLD_REGION, PHASE2_MOVING_REGION } from './GrabRegionMath.ts';
import type { GrabRegion } from '../origami/types.ts';
import { HandOwnership, type HandId } from './HandOwnership.ts';
import type { HandSample } from './HandTrackingAdapter.ts';
import { emptyHandSample } from './HandTrackingAdapter.ts';
import { PINCH_RELEASE_M, PinchRecognizer, type PinchEvent, type PinchPhase } from './PinchRecognizer.ts';
import { TrackingLossWatch, type TrackingLossMode } from './trackingLoss.ts';

export const LIFT_MAX_M = 0.03;
export const GRAB_PRESS_M = 0.012;
export const REJECT_PULSE_MS = 180;

export interface HandRuntime {
  sample: HandSample;
  pinch: PinchPhase;
  region: 'moving' | 'hold' | 'move' | 'none';
  tracking: TrackingLossMode;
  pinchEvent: PinchEvent;
}

export interface InteractionSnapshot {
  left: HandRuntime;
  right: HandRuntime;
  hoverMoving: boolean;
  hoverHold: boolean;
  hoverMove: boolean;
  foldOwner: HandId | null;
  holdOwner: HandId | null;
  moveOwner: HandId | null;
  moveSecondary: HandId | null;
  grabbed: boolean;
  paperMoving: boolean;
  grabRegionId: string | null;
  hitRegionId: string | null;
  liftM: number;
  trackingMode: TrackingLossMode;
  uiDisabled: boolean;
  panelDragging: boolean;
  panelOwner: HandId | null;
  menuDragging: boolean;
  menuOwner: HandId | null;
  menuHover: boolean;
  menuDragMode: 'direct' | 'raycast' | 'none';
  cutHover: boolean;
  cutPulse: boolean;
  rejectedPulse: boolean;
  pinchCounts: Record<HandId, number>;
  ownerLocal: Vec3 | null;
}

function pinchHeld(sample: HandSample): boolean {
  return sample.pinchDistanceM != null && sample.pinchDistanceM < PINCH_RELEASE_M;
}

function runtime(sample: HandSample, pinch: PinchPhase, region: HandRuntime['region'], tracking: TrackingLossMode, pinchEvent: PinchEvent): HandRuntime {
  return { sample, pinch, region, tracking, pinchEvent };
}

export class HandSession {
  private readonly pinch = {
    left: new PinchRecognizer(),
    right: new PinchRecognizer(),
  };
  private readonly loss = {
    left: new TrackingLossWatch(),
    right: new TrackingLossWatch(),
  };
  private readonly ownership = new HandOwnership();
  private panelOwner: HandId | null = null;
  private menuOwner: HandId | null = null;
  private menuHover = false;
  private menuMode: 'direct' | 'raycast' | null = null;
  private cutPulse = false;
  private grabLocalZ = 0;
  private liftM = 0;
  private rejectedUntil = 0;
  private pinchCounts: Record<HandId, number> = { left: 0, right: 0 };
  private lastTracking: Record<HandId, boolean> = { left: false, right: false };
  private blockFoldUntilOpen = false;

  get awaitingFreshPinch(): boolean {
    return this.blockFoldUntilOpen;
  }

  reset(): void {
    this.pinch.left.reset();
    this.pinch.right.reset();
    this.loss.left.reset();
    this.loss.right.reset();
    this.ownership.reset();
    this.panelOwner = null;
    this.menuOwner = null;
    this.menuHover = false;
    this.menuMode = null;
    this.cutPulse = false;
    this.grabLocalZ = 0;
    this.liftM = 0;
    this.rejectedUntil = 0;
    this.pinchCounts = { left: 0, right: 0 };
    this.lastTracking = { left: false, right: false };
    this.blockFoldUntilOpen = false;
  }

  /** Ignore a pinch that is already closed when Restart is pressed. */
  armFreshPinch(): void {
    this.reset();
    this.blockFoldUntilOpen = true;
  }

  /** A pinch that finished the previous fold must open before the next fold can start. */
  requireFreshPinch(): void {
    const fold = this.ownership.fold;
    if (fold) {
      this.ownership.releaseFold(fold);
    }
    this.blockFoldUntilOpen = true;
  }

  getOwnership(): HandOwnership {
    return this.ownership;
  }

  update(input: {
    nowMs: number;
    left: HandSample;
    right: HandSample;
    leftLocal: Vec3 | null;
    rightLocal: Vec3 | null;
    leftPanel: boolean;
    rightPanel: boolean;
    leftMove?: boolean;
    rightMove?: boolean;
    leftMenu?: boolean;
    rightMenu?: boolean;
    leftGallery?: boolean;
    rightGallery?: boolean;
    leftHandle?: boolean;
    rightHandle?: boolean;
    leftRayHandle?: boolean;
    rightRayHandle?: boolean;
    leftCut?: boolean;
    rightCut?: boolean;
    movingRegion?: GrabRegion;
    movingRegions?: GrabRegion[];
    holdRegion?: GrabRegion;
    inputLocked?: boolean;
  }): InteractionSnapshot {
    this.cutPulse = false;
    const left = this.stepHand(
      'left',
      input.left,
      input.leftLocal,
      input.leftPanel,
      Boolean(input.leftMove),
      Boolean(input.leftMenu),
      Boolean(input.leftRayHandle),
      Boolean(input.leftGallery),
      Boolean(input.leftCut),
      input.nowMs,
      input.movingRegions ?? (input.movingRegion ? [input.movingRegion] : [PHASE2_MOVING_REGION]),
      input.holdRegion ?? PHASE2_HOLD_REGION,
      Boolean(input.inputLocked),
    );
    const right = this.stepHand(
      'right',
      input.right,
      input.rightLocal,
      input.rightPanel,
      Boolean(input.rightMove),
      Boolean(input.rightMenu),
      Boolean(input.rightRayHandle),
      Boolean(input.rightGallery),
      Boolean(input.rightCut),
      input.nowMs,
      input.movingRegions ?? (input.movingRegion ? [input.movingRegion] : [PHASE2_MOVING_REGION]),
      input.holdRegion ?? PHASE2_HOLD_REGION,
      Boolean(input.inputLocked),
    );

    const regions =
      input.movingRegions ?? (input.movingRegion ? [input.movingRegion] : [PHASE2_MOVING_REGION]);
    const leftHit = input.leftLocal ? hitMovingRegion(input.leftLocal, PAPER_SIZE_M, regions) : null;
    const rightHit = input.rightLocal ? hitMovingRegion(input.rightLocal, PAPER_SIZE_M, regions) : null;
    const foldOwner = this.ownership.fold;
    const holdOwner = this.ownership.hold;
    const grabbed = foldOwner != null;
    const ownerRuntime = foldOwner === 'left' ? left : foldOwner === 'right' ? right : null;
    if (grabbed && ownerRuntime && ownerRuntime.tracking !== 'frozen') {
      const local = foldOwner === 'left' ? input.leftLocal : input.rightLocal;
      const extra = local ? clamp(local[2] - this.grabLocalZ, 0, LIFT_MAX_M - GRAB_PRESS_M) : 0;
      this.liftM = GRAB_PRESS_M + extra;
    }
    if (!grabbed) {
      this.liftM = 0;
    }

    const trackingMode = this.combinedTracking(
      left.tracking,
      right.tracking,
      grabbed || this.ownership.move != null || this.menuOwner != null,
    );
    const hoverMoving = left.region === 'moving' || right.region === 'moving';
    const hoverHold = left.region === 'hold' || right.region === 'hold';
    const hoverMove = left.region === 'move' || right.region === 'move';
    const paperMoving = this.ownership.move != null;
    this.menuHover = Boolean(
      input.leftHandle || input.rightHandle || input.leftRayHandle || input.rightRayHandle,
    );
    this.settleFreshPinch(input.left, input.right);

    return {
      left,
      right,
      hoverMoving,
      hoverHold,
      hoverMove,
      foldOwner,
      holdOwner,
      moveOwner: this.ownership.move,
      moveSecondary: this.ownership.moveSecondary,
      grabbed,
      paperMoving,
      grabRegionId: (foldOwner === 'left' ? leftHit : foldOwner === 'right' ? rightHit : rightHit ?? leftHit)?.id ?? null,
      hitRegionId: ([leftHit, rightHit].find((hit) => hit?.id.includes('right')) ?? rightHit ?? leftHit)?.id ?? null,
      liftM: this.liftM,
      trackingMode,
      uiDisabled: grabbed || paperMoving || this.panelOwner != null || this.menuOwner != null,
      panelDragging: this.panelOwner != null,
      panelOwner: this.panelOwner,
      menuDragging: this.menuOwner != null,
      menuOwner: this.menuOwner,
      menuHover: this.menuHover,
      menuDragMode: this.menuOwner && this.menuMode ? this.menuMode : 'none',
      cutHover: Boolean(input.leftCut || input.rightCut),
      cutPulse: this.cutPulse,
      rejectedPulse: input.nowMs < this.rejectedUntil,
      pinchCounts: { ...this.pinchCounts },
      ownerLocal: foldOwner === 'left' ? input.leftLocal : foldOwner === 'right' ? input.rightLocal : null,
    };
  }

  private stepHand(
    hand: HandId,
    sample: HandSample,
    local: Vec3 | null,
    panelHit: boolean,
    moveHit: boolean,
    menuHit: boolean,
    rayHandle: boolean,
    galleryHit: boolean,
    cutHit: boolean,
    nowMs: number,
    movingRegions: GrabRegion[],
    holdRegion: GrabRegion,
    inputLocked: boolean,
  ): HandRuntime {
    const tracking = this.loss[hand].update(sample.valid || sample.tracked, nowMs);
    this.emitTracking(hand, sample.tracked || sample.valid);

    if (tracking === 'cancelled' && (this.ownership.fold === hand || this.ownership.hold === hand || this.menuOwner === hand)) {
      this.ownership.release(hand);
      if (this.panelOwner === hand) {
        this.panelOwner = null;
      }
      if (this.menuOwner === hand) {
        this.menuOwner = null;
        this.menuMode = null;
      }
      this.pinch[hand].reset();
      debugEvents.emit('trackingLost', { hand, durationMs: '>=300' });
    }

    const region: HandRuntime['region'] = moveHit
      ? 'move'
      : local
        ? classifyGrabMany(local, PAPER_SIZE_M, movingRegions, holdRegion)
        : 'none';
    let pinchEvent: PinchEvent = null;
    if (tracking === 'ok') {
      pinchEvent = this.pinch[hand].update(sample.valid ? sample.pinchDistanceM : null);
    } else if (tracking === 'cancelled') {
      pinchEvent = this.pinch[hand].update(null);
    }

    if (pinchEvent === 'started') {
      debugEvents.emit('pinchStarted', {
        hand,
        source: sample.source,
        distanceM: sample.pinchDistanceM,
        region,
        panel: panelHit,
      });
      this.onPinchStarted(hand, region, panelHit, moveHit, menuHit, rayHandle, galleryHit, cutHit, local, nowMs, inputLocked);
    } else if (pinchEvent === 'released') {
      debugEvents.emit('pinchReleased', {
        hand,
        ownedFold: this.ownership.fold === hand,
        panel: this.panelOwner === hand,
        menu: this.menuOwner === hand,
      });
      this.onPinchReleased(hand);
    }

    return runtime(sample, this.pinch[hand].state, region, tracking, pinchEvent);
  }

  private onPinchStarted(
    hand: HandId,
    region: HandRuntime['region'],
    panelHit: boolean,
    moveHit: boolean,
    menuHit: boolean,
    rayHandle: boolean,
    galleryHit: boolean,
    cutHit: boolean,
    local: Vec3 | null,
    nowMs: number,
    inputLocked: boolean,
  ): void {
    if (panelHit && this.panelOwner == null) {
      this.panelOwner = hand;
      return;
    }
    if (this.panelOwner === hand) {
      return;
    }
    if (this.blockFoldUntilOpen) {
      return;
    }
    if (this.menuOwner != null) {
      return;
    }
    if (menuHit && this.ownership.fold == null && this.ownership.move == null) {
      this.menuOwner = hand;
      this.menuMode = 'direct';
      debugEvents.emit('galleryDragGrabbed', { hand, mode: 'direct' });
      return;
    }
    if (rayHandle && this.ownership.fold == null && this.ownership.move == null) {
      this.menuOwner = hand;
      this.menuMode = 'raycast';
      debugEvents.emit('galleryDragGrabbed', { hand, mode: 'raycast' });
      return;
    }
    if (cutHit && this.ownership.fold == null && this.ownership.move == null) {
      this.cutPulse = true;
      debugEvents.emit('scissorsGrabbed', { hand });
      return;
    }
    if (galleryHit) {
      return;
    }
    if (this.ownership.move && this.ownership.move !== hand && this.ownership.tryClaimMoveSecondary(hand)) {
      debugEvents.emit('paperMoveGrabbed', { hand, role: 'secondary' });
      return;
    }
    if (moveHit && this.ownership.tryClaimMove(hand)) {
      debugEvents.emit('paperMoveGrabbed', { hand, role: 'primary' });
      return;
    }
    if (inputLocked && !panelHit) {
      return;
    }
    if (region === 'moving' && this.ownership.tryClaimFold(hand)) {
      this.grabLocalZ = local?.[2] ?? 0;
      this.pinchCounts[hand] += 1;
      debugEvents.emit('foldGrabbed', {
        hand,
        regionId: 'moving-right-half',
        count: this.pinchCounts[hand],
      });
      return;
    }
    if (region === 'hold' && this.ownership.tryClaimHold(hand)) {
      return;
    }
    this.rejectedUntil = nowMs + REJECT_PULSE_MS;
    debugEvents.emit('foldRejected', {
      hand,
      reason: region === 'none' ? 'outside-moving-region' : 'ownership-blocked',
      region,
    });
  }

  private settleFreshPinch(left: HandSample, right: HandSample): void {
    if (!this.blockFoldUntilOpen) {
      return;
    }
    const held = pinchHeld(left) || pinchHeld(right);
    if (!held) {
      this.blockFoldUntilOpen = false;
    }
  }

  private onPinchReleased(hand: HandId): void {
    const wasMovePrimary = this.ownership.move === hand;
    const wasMenu = this.menuOwner === hand;
    this.ownership.release(hand);
    if (wasMovePrimary && this.ownership.move == null) {
      debugEvents.emit('paperMoveReleased', { hand });
    }
    if (this.panelOwner === hand) {
      this.panelOwner = null;
    }
    if (wasMenu) {
      this.menuOwner = null;
      this.menuMode = null;
      debugEvents.emit('galleryDragReleased', { hand });
    }
  }

  private combinedTracking(
    left: TrackingLossMode,
    right: TrackingLossMode,
    grabbed: boolean,
  ): TrackingLossMode {
    if (!grabbed) {
      if (left === 'ok' || right === 'ok') {
        return 'ok';
      }
      if (left === 'cancelled' && right === 'cancelled') {
        return 'cancelled';
      }
      return left === 'frozen' || right === 'frozen' ? 'frozen' : 'ok';
    }
    const owner = this.ownership.fold;
    return owner === 'left' ? left : owner === 'right' ? right : 'ok';
  }

  private emitTracking(hand: HandId, tracked: boolean): void {
    if (tracked === this.lastTracking[hand]) {
      return;
    }
    this.lastTracking[hand] = tracked;
    debugEvents.emit(tracked ? 'trackingRecovered' : 'trackingLost', { hand });
    debugEvents.emit('handsUpdated', { hand, tracked });
  }
}

export function idleSnapshot(): InteractionSnapshot {
  const sampleL = emptyHandSample('left');
  const sampleR = emptyHandSample('right');
  return {
    left: runtime(sampleL, 'open', 'none', 'ok', null),
    right: runtime(sampleR, 'open', 'none', 'ok', null),
    hoverMoving: false,
    hoverHold: false,
    hoverMove: false,
    foldOwner: null,
    holdOwner: null,
    moveOwner: null,
    moveSecondary: null,
    grabbed: false,
    paperMoving: false,
    grabRegionId: null,
    hitRegionId: null,
    liftM: 0,
    trackingMode: 'ok',
    uiDisabled: false,
    panelDragging: false,
    panelOwner: null,
    menuDragging: false,
    menuOwner: null,
    menuHover: false,
    menuDragMode: 'none',
    cutHover: false,
    cutPulse: false,
    rejectedPulse: false,
    pinchCounts: { left: 0, right: 0 },
    ownerLocal: null,
  };
}
