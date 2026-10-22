import { createSystem } from '@iwsdk/core';
import { Matrix4, Vector3, type Group } from 'three';
import type { DebugEvents } from '../telemetry/DebugEvents.ts';
import type { GrabRegion, Vec3 } from '../origami/types.ts';
import { handAimFromJoints } from '../origami/PaperMover.ts';
import type { PaperMover } from '../origami/PaperMover.ts';
import type { MenuRayGuide, OrigamiGallery } from '../gallery/OrigamiGallery.ts';
import { pointingRay } from '../gallery/menuDrag.ts';
import type { DebugPanel } from '../ui/DebugPanel.ts';
import type { GrabRegionOverlay } from '../ui/GrabRegionOverlay.ts';
import type { HandIndicators } from '../ui/HandIndicators.ts';
import type { MoveHandle } from '../ui/MoveHandle.ts';
import type { ScissorsCut } from '../origami/ScissorsCut.ts';
import type { SimulatedHands } from '../desktop/SimulatedHands.ts';
import type { AppState } from '../state/AppStateMachine.ts';
import type { SessionDiagnostics } from '../xr/XRSessionManager.ts';
import type { PlayManipulationFrame } from '../animation/CompletedOrigamiManipulator.ts';
import { collectInputSources, emptyHandSample, sampleHands, type HandSample } from './HandTrackingAdapter.ts';
import type { HandSession, InteractionSnapshot } from './HandSession.ts';
import { intersectLocalZ0 } from './rayPaper.ts';

const _world = new Vector3();
const _local = new Vector3();
const _dir = new Vector3();
const _inv = new Matrix4();
const _panelDefault = new Vector3();
const _leftWorld = new Vector3();
const _rightWorld = new Vector3();
const _scratchWorld = new Vector3();
const _leftRayOrigin = new Vector3();
const _leftRayDir = new Vector3();
const _leftRayHit = new Vector3();
const _rightRayOrigin = new Vector3();
const _rightRayDir = new Vector3();
const _rightRayHit = new Vector3();

interface AimedRay {
  origin: Vector3;
  direction: Vector3;
  hit: Vector3 | null;
  distance: number;
}

export interface HandInteractionHandlers {
  session: HandSession;
  getPaperRoot: () => Group;
  overlay: GrabRegionOverlay;
  moveHandle: MoveHandle;
  cutter?: ScissorsCut;
  owlPinch?: {
    contains(worldPoint: Vector3): boolean;
    raycast(origin: Vector3, direction: Vector3): boolean;
    setHover(hovered: boolean): void;
  };
  mover: PaperMover;
  indicators: HandIndicators;
  debugPanel: DebugPanel;
  gallery: OrigamiGallery;
  simulated: SimulatedHands;
  isDebug: () => boolean;
  getAppState: () => AppState;
  getDiagnostics: () => SessionDiagnostics | null;
  getEvents: () => ReturnType<DebugEvents['latest']>;
  onSnapshot: (snapshot: InteractionSnapshot, dtMs: number) => void;
  onPlayFrame?: (frame: PlayManipulationFrame) => void;
  isPlayManipulating?: () => boolean;
  forceSimulated?: () => boolean;
  isInputLocked?: () => boolean;
  getMovingRegion?: () => GrabRegion | undefined;
  getMovingRegions?: () => GrabRegion[] | undefined;
  getHoldRegion?: () => GrabRegion | undefined;
  onTestFoldFeedback?: () => void;
  onXrSources?: (sources: XRInputSource[]) => void;
  getFoldDebug?: () => {
    angleDeg: number;
    targetDeg: number;
    errorDeg: number;
    phase: string;
    recipeId?: string;
    stepId?: string;
    cutState?: string;
    cutProgress?: string;
    cutDone?: string;
    committed?: number;
    total?: number;
    action?: string;
    holdMs?: number;
    foldPct?: number;
    assistOn?: boolean;
    snapArmed?: boolean;
    hapticAvailable?: boolean;
    feedbackOn?: boolean;
    stage?: number;
    subFold?: string;
    creaseId?: string;
    alignmentMm?: number;
    mismatch?: boolean;
    warning?: string;
    grabRegion?: string;
    movingIds?: string;
    hingeAxis?: string;
    geometryState?: string;
    finalPhase?: string;
    sideFolds?: string;
    decorState?: string;
    movingFaces?: number;
    stationaryFaces?: number;
    layerMode?: string;
    layerCount?: number;
    frontFaces?: number;
    backFaces?: number;
    groupFaces?: number;
    ownership?: string;
    earFolds?: Array<{
      stepId: string;
      state: string;
      angleDeg: number;
      visible: boolean;
    }>;
    earState?: string;
    rightFaces?: string;
    rightAxis?: string;
    rightPivot?: string;
    rightProgress?: string;
    rightSnap?: string;
    restart?: {
      sessionId: string;
      count: number;
      meshId: string;
      targetId: string;
      zones: string;
      hands: string;
      interaction: string;
      init: string;
      snap: string;
      error: string;
      valid: string;
    };
    gallery?: {
      state: string;
      hoveredCard: string | null;
      selectedCard: string | null;
      modelsLoaded: number;
      floatsActive: number;
      page: number;
      pageCount: number;
      open: boolean;
      whalePreserved?: boolean;
      activeAnimal?: string | null;
      drawCalls?: number;
      triangles?: number;
      dragEnabled?: boolean;
      dragState?: string;
      dragHand?: string | null;
      position?: [number, number, number];
      handleCollider?: boolean;
      boundingBox?: boolean;
      dragMode?: string;
      rayDistance?: number;
    };
    playScale?: {
      state: string;
      scale: number;
      handDistanceM: number | null;
    };
  };
}

function toVec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function worldToPaperLocal(paperRoot: Group, world: Vector3): Vec3 {
  _local.copy(world);
  paperRoot.worldToLocal(_local);
  return toVec3(_local);
}

function worldPointForHand(sample: HandSample, paperRoot: Group, target: Vector3): Vector3 | null {
  if (sample.source === 'controller-trigger' && sample.rayOrigin && sample.rayDirection) {
    _world.set(...sample.rayOrigin);
    _dir.set(...sample.rayDirection);
    paperRoot.updateWorldMatrix(true, false);
    _inv.copy(paperRoot.matrixWorld).invert();
    _world.applyMatrix4(_inv);
    _dir.transformDirection(_inv);
    const hit = intersectLocalZ0(toVec3(_world), toVec3(_dir));
    if (!hit) {
      return null;
    }
    _local.set(...hit);
    paperRoot.localToWorld(_local);
    return target.copy(_local);
  }
  if (sample.pinchMidpoint) {
    return target.set(...sample.pinchMidpoint);
  }
  if (sample.indexTip) {
    return target.set(...sample.indexTip);
  }
  return null;
}

function mergeSample(xr: HandSample, simulated: HandSample): HandSample {
  return simulated.valid ? simulated : xr;
}

export function createHandInteractionSystem(handlers: HandInteractionHandlers) {
  return class HandInteractionSystem extends createSystem({}) {
    private fps = 0;
    private placedPanel = false;

    init(): void {
      this.scene.add(handlers.indicators.group);
      this.scene.add(handlers.debugPanel.group);
      handlers.simulated.bind(this.renderer.domElement);
      this.cleanupFuncs.push(() => {
        handlers.indicators.dispose();
        handlers.debugPanel.dispose();
        handlers.simulated.dispose();
      });
    }

    update(delta: number): void {
      this.fps = delta > 0 ? 1 / delta : 0;
      const paperRoot = handlers.getPaperRoot();
      const frame = this.xrFrame ?? this.world.xrFrame;
      const space = this.world.xrReferenceSpace;
      handlers.onXrSources?.(collectInputSources(this.world.session));
      const xrSamples = sampleHands({
        frame,
        space,
        session: this.world.session,
        gamepads: this.input.xr.gamepads,
        getPrimary: (hand) => this.input.xr.getPrimaryInputSource(hand),
      });

      const xrActive = Boolean(this.world.session);
      const simEnabled = !xrActive || Boolean(handlers.forceSimulated?.());
      handlers.simulated.setEnabled(simEnabled);
      const sim = simEnabled
        ? handlers.simulated.sampleHands(
            this.camera,
            paperRoot,
            handlers.debugPanel.group.visible ? handlers.debugPanel.grabBar : undefined,
            handlers.moveHandle.grabTarget,
            handlers.gallery.group.visible ? handlers.gallery.group : undefined,
          )
        : {
            left: emptyHandSample('left'),
            right: emptyHandSample('right'),
            panelPoint: null,
          };

      const left = mergeSample(xrSamples.left, sim.left);
      const right = mergeSample(xrSamples.right, sim.right);
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const leftWorld = worldPointForHand(left, paperRoot, _leftWorld);
      const rightWorld = worldPointForHand(right, paperRoot, _rightWorld);
      const leftLocal = leftWorld ? worldToPaperLocal(paperRoot, leftWorld) : null;
      const rightLocal = rightWorld ? worldToPaperLocal(paperRoot, rightWorld) : null;

      const leftPanel = Boolean(leftWorld && handlers.debugPanel.group.visible && handlers.debugPanel.containsGrabBar(leftWorld));
      const rightPanel = Boolean(rightWorld && handlers.debugPanel.group.visible && handlers.debugPanel.containsGrabBar(rightWorld));
      const leftMove = Boolean(leftWorld && handlers.moveHandle.contains(leftWorld));
      const rightMove = Boolean(rightWorld && handlers.moveHandle.contains(rightWorld));
      const leftMenu = Boolean(leftWorld && handlers.gallery.containsDragTarget(leftWorld));
      const rightMenu = Boolean(rightWorld && handlers.gallery.containsDragTarget(rightWorld));
      const leftGallery = Boolean(leftWorld && handlers.gallery.containsGallery(leftWorld));
      const rightGallery = Boolean(rightWorld && handlers.gallery.containsGallery(rightWorld));
      const leftHandle = Boolean(leftWorld && handlers.gallery.containsHandle(leftWorld));
      const rightHandle = Boolean(rightWorld && handlers.gallery.containsHandle(rightWorld));
      const leftAim = aimAtHandle(left, handlers.gallery, _leftRayOrigin, _leftRayDir, _leftRayHit);
      const rightAim = aimAtHandle(right, handlers.gallery, _rightRayOrigin, _rightRayDir, _rightRayHit);
      const leftRayHandle = Boolean(leftAim?.hit);
      const rightRayHandle = Boolean(rightAim?.hit);
      const cutter = handlers.cutter;
      const owlPinch = handlers.owlPinch;
      const leftCut = Boolean(
        (cutter && ((leftWorld && cutter.contains(leftWorld)) || (leftAim && cutter.raycast(leftAim.origin, leftAim.direction)))) ||
          (owlPinch && ((leftWorld && owlPinch.contains(leftWorld)) || (leftAim && owlPinch.raycast(leftAim.origin, leftAim.direction)))),
      );
      const rightCut = Boolean(
        (cutter && ((rightWorld && cutter.contains(rightWorld)) || (rightAim && cutter.raycast(rightAim.origin, rightAim.direction)))) ||
          (owlPinch && ((rightWorld && owlPinch.contains(rightWorld)) || (rightAim && owlPinch.raycast(rightAim.origin, rightAim.direction)))),
      );
      cutter?.setHover(leftCut || rightCut);
      owlPinch?.setHover(leftCut || rightCut);

      const snapshot = handlers.session.update({
        nowMs,
        left,
        right,
        leftLocal,
        rightLocal,
        leftPanel,
        rightPanel,
        leftMove,
        rightMove,
        leftMenu,
        rightMenu,
        leftGallery,
        rightGallery,
        leftHandle,
        rightHandle,
        leftRayHandle,
        rightRayHandle,
        leftCut,
        rightCut,
        movingRegion: handlers.getMovingRegion?.(),
        movingRegions: handlers.getMovingRegions?.(),
        holdRegion: handlers.getHoldRegion?.(),
        inputLocked: handlers.isInputLocked?.(),
      });

      if (handlers.isDebug() && handlers.debugPanel.group.visible) {
        const leftTest = Boolean(leftWorld && snapshot.left.pinchEvent === 'started' && handlers.debugPanel.containsTestPad(leftWorld));
        const rightTest = Boolean(rightWorld && snapshot.right.pinchEvent === 'started' && handlers.debugPanel.containsTestPad(rightWorld));
        if (leftTest || rightTest) {
          handlers.onTestFoldFeedback?.();
        }
      }

      handlers.onPlayFrame?.({
        left: {
          pinching: snapshot.left.pinch === 'closed',
          tracking: snapshot.left.tracking,
          point: leftWorld,
        },
        right: {
          pinching: snapshot.right.pinch === 'closed',
          tracking: snapshot.right.tracking,
          point: rightWorld,
        },
        dtSec: delta,
        viewer: this.camera.position,
      });

      if (handlers.isPlayManipulating?.()) {
        if (handlers.mover.active) {
          handlers.mover.end();
        }
      } else {
        this.applyPaperMove(paperRoot, snapshot, left, right, leftWorld, rightWorld);
      }
      this.applyMenuMove(snapshot, leftWorld, rightWorld, leftAim, rightAim, delta);

      if (snapshot.panelDragging) {
        const ownerWorld =
          snapshot.panelOwner === 'left'
            ? leftWorld
            : snapshot.panelOwner === 'right'
              ? rightWorld
              : null;
        if (ownerWorld) {
          _scratchWorld.copy(ownerWorld);
          handlers.debugPanel.dragTo(_scratchWorld);
        }
      } else {
        handlers.debugPanel.endDrag();
      }

      handlers.overlay.apply(snapshot);
      handlers.moveHandle.setState({ hover: snapshot.hoverMove, active: snapshot.paperMoving });
      handlers.indicators.update(left, right, handlers.isDebug() || left.tracked || right.tracked);
      handlers.debugPanel.setVisible(handlers.isDebug());
      this.placePanel(paperRoot);
      handlers.debugPanel.paint(
        {
          appState: handlers.getAppState(),
          diagnostics: handlers.getDiagnostics(),
          snapshot,
          fps: this.fps,
          events: handlers.getEvents(),
          simulatedHands: simEnabled,
          fold: handlers.getFoldDebug?.(),
        },
        nowMs,
      );
      handlers.onSnapshot(snapshot, delta * 1000);
    }

    private applyPaperMove(
      paperRoot: Group,
      snapshot: InteractionSnapshot,
      left: HandSample,
      right: HandSample,
      leftWorld: Vector3 | null,
      rightWorld: Vector3 | null,
    ): void {
      if (!snapshot.paperMoving || !snapshot.moveOwner) {
        if (handlers.mover.active) {
          handlers.mover.end();
        }
        return;
      }
      const primarySample = snapshot.moveOwner === 'left' ? left : right;
      const primaryWorld = snapshot.moveOwner === 'left' ? leftWorld : rightWorld;
      if (!primaryWorld) {
        return;
      }
      const secondaryWorld =
        snapshot.moveSecondary === 'left'
          ? leftWorld
          : snapshot.moveSecondary === 'right'
            ? rightWorld
            : null;
      const aim = handAimFromJoints(primarySample.wrist, primarySample.pinchMidpoint);
      handlers.mover.update(
        paperRoot,
        snapshot.moveOwner,
        primaryWorld,
        aim,
        secondaryWorld,
        this.camera.position,
      );
    }

    private applyMenuMove(
      snapshot: InteractionSnapshot,
      leftWorld: Vector3 | null,
      rightWorld: Vector3 | null,
      leftAim: AimedRay | null,
      rightAim: AimedRay | null,
      dtSec: number,
    ): void {
      handlers.gallery.setHandleHover(snapshot.menuHover || snapshot.menuDragging);
      const mover = handlers.gallery.mover;
      const owner = snapshot.menuOwner;
      const aim = owner === 'left' ? leftAim : owner === 'right' ? rightAim : null;
      if (!snapshot.menuDragging || !owner) {
        if (mover.active) {
          mover.end(handlers.gallery.group);
        }
        this.publishRays(snapshot, leftAim, rightAim);
        return;
      }
      const ownerWorld = owner === 'left' ? leftWorld : rightWorld;
      const ownerTracking = owner === 'left' ? snapshot.left.tracking : snapshot.right.tracking;
      const useRay = snapshot.menuDragMode === 'raycast';
      if (!mover.active) {
        if (useRay && aim?.hit && ownerTracking === 'ok') {
          mover.beginRay(handlers.gallery.group, aim.hit, aim.distance, owner);
        } else if (!useRay && ownerWorld && ownerTracking === 'ok') {
          mover.begin(handlers.gallery.group, ownerWorld, owner);
        } else {
          this.publishRays(snapshot, leftAim, rightAim);
          return;
        }
      }
      if (mover.dragMode === 'raycast') {
        mover.updateRay(
          handlers.gallery.group,
          aim?.origin ?? null,
          aim?.direction ?? null,
          ownerTracking,
          dtSec,
        );
      } else {
        mover.update(handlers.gallery.group, ownerWorld, ownerTracking, dtSec);
      }
      this.publishRays(snapshot, leftAim, rightAim);
    }

    private publishRays(
      snapshot: InteractionSnapshot,
      leftAim: AimedRay | null,
      rightAim: AimedRay | null,
    ): void {
      handlers.gallery.setRayGuides({
        left: guideFor('left', snapshot, leftAim, handlers.gallery.mover.rayDistance),
        right: guideFor('right', snapshot, rightAim, handlers.gallery.mover.rayDistance),
      });
      handlers.gallery.setDragEmphasis(snapshot.menuDragging);
    }

    private placePanel(paperRoot: Group): void {
      if (this.placedPanel && handlers.debugPanel.isUserDragged()) {
        return;
      }
      paperRoot.updateWorldMatrix(true, false);
      _panelDefault.set(0.32, 0.12, 0.02);
      paperRoot.localToWorld(_panelDefault);
      handlers.debugPanel.placeDefault(_panelDefault);
      this.placedPanel = true;
    }
  };
}

function aimAtHandle(
  sample: HandSample,
  gallery: OrigamiGallery,
  origin: Vector3,
  direction: Vector3,
  hit: Vector3,
): AimedRay | null {
  if (!sample.tracked && !sample.valid) {
    return null;
  }
  if (!pointingRay(sample, origin, direction)) {
    return null;
  }
  const distance = gallery.raycastHandle(origin, direction, hit);
  return {
    origin,
    direction,
    hit: distance == null ? null : hit,
    distance: distance ?? 0,
  };
}

function guideFor(
  hand: 'left' | 'right',
  snapshot: InteractionSnapshot,
  aim: AimedRay | null,
  heldDistance: number,
): MenuRayGuide | null {
  if (!aim) {
    return null;
  }
  const dragging = snapshot.menuDragging && snapshot.menuOwner === hand && snapshot.menuDragMode === 'raycast';
  if (dragging && heldDistance > 0) {
    const point = _scratchWorld.copy(aim.origin).addScaledVector(aim.direction, heldDistance);
    return {
      origin: aim.origin,
      direction: aim.direction,
      hit: point.clone(),
      distance: heldDistance,
      hot: true,
    };
  }
  return {
    origin: aim.origin,
    direction: aim.direction,
    hit: aim.hit ? aim.hit.clone() : null,
    distance: aim.distance,
    hot: Boolean(aim.hit) && (snapshot.menuOwner == null || snapshot.menuOwner === hand),
  };
}
