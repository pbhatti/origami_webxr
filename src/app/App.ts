import { AmbientLight, DirectionalLight } from 'three';
import type { World } from '@iwsdk/core';
import { isPlayableAnimalId, type AnimalId, type PlayableAnimalId } from '../gallery/animals.ts';
import { OrigamiGallery, type GalleryPointerEvent } from '../gallery/OrigamiGallery.ts';
import { MENU_DRAG_CONFIG, MENU_DRAG_INSPECTOR } from '../gallery/menuDrag.ts';
import { MOVE_HANDLE_INSPECTOR } from '../ui/MoveHandle.ts';
import { STEPPER_INSPECTOR } from '../ui/UnifiedFoldingPanel.ts';
import { routeAnimal } from '../gallery/ExperienceRouter.ts';
import { SimulatedHands } from '../desktop/SimulatedHands.ts';
import type { PlayManipulationFrame } from '../animation/CompletedOrigamiManipulator.ts';
import { createHandInteractionSystem } from '../input/HandInteractionSystem.ts';
import { HandSession } from '../input/HandSession.ts';
import type { InteractionSnapshot } from '../input/HandSession.ts';
import { PaperStage } from '../origami/PaperStage.ts';
import { FOLD_FEEDBACK } from '../feedback/foldFeedback.ts';
import { BAT_SHAPE_INSPECTOR } from '../origami/batFinalShape.ts';
import { batFinalPhase } from '../origami/recipes/bat.recipe.ts';
import { BAT_CUT_INSPECTOR } from '../origami/ScissorsCut.ts';
import { FOX_SHAPE_INSPECTOR } from '../origami/foxFinalShape.ts';
import { FOLD_GEOMETRY_INSPECTOR } from '../origami/foldGeometryInspector.ts';
import { ARROW_GUIDE, CREASE_GUIDE, FOLD_ASSIST, nudgeConfig } from '../origami/foldAssist.ts';
import { AppStateMachine, type AppState } from '../state/AppStateMachine.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { DebugPanel } from '../ui/DebugPanel.ts';
import { HandIndicators } from '../ui/HandIndicators.ts';
import { createSpatialButtonSystem } from '../ui/SpatialButtonSystem.ts';
import type { ToolbarAction } from '../ui/SpatialToolbar.ts';
import { WelcomePanel } from '../ui/WelcomePanel.ts';
import { getUiOpacity, setUiOpacity } from '../theme/tokens.ts';
import { canLaunchImmersiveAr } from '../xr/XRCapabilities.ts';
import {
  XRSessionManager,
  type SessionDiagnostics,
} from '../xr/XRSessionManager.ts';

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function isSimHandsForced(): boolean {
  return new URLSearchParams(window.location.search).get('simhands') === '1';
}

function tailId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id;
}

function skipXR(): boolean {
  return new URLSearchParams(window.location.search).get('noxr') === '1';
}

function waitForViewerPose(world: World): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const stop = world.onXRFrame(() => {
      frames += 1;
      if (frames >= 3) {
        stop();
        resolve();
      }
    });
    window.setTimeout(() => {
      stop();
      resolve();
    }, 350);
  });
}

const TOOLBAR_LOCK = new Set(['SNAP_PENDING', 'SNAP_ANIMATING', 'RETURN_ANIMATING', 'GALLERY_COLLAPSING', 'WHALE_LOADING']);
const PAPER_LOCK = new Set([
  'SNAP_PENDING',
  'SNAP_ANIMATING',
  'RETURN_ANIMATING',
  'FOLD_LOCKED',
  'COMPLETION',
  'CREATURE_ALIVE',
  'REPLAY',
  'GALLERY_OPEN',
  'GALLERY_COLLAPSING',
  'WHALE_LOADING',
  'GALLERY_OVERLAY',
]);
const GALLERY_STATES = new Set<AppState>(['GALLERY_OPEN', 'GALLERY_COLLAPSING', 'WHALE_LOADING', 'GALLERY_OVERLAY']);

export class App {
  private readonly machine = new AppStateMachine();
  private readonly session = new XRSessionManager(
    (diagnostics) => {
      this.diagnostics = diagnostics;
      this.renderPanel();
    },
    () => {
      this.returnToLauncher();
    },
  );
  private readonly stage = new PaperStage();
  private readonly gallery = new OrigamiGallery();
  private activeAnimalId: AnimalId | null = null;
  private foldResumeState: AppState | null = null;
  private readonly hands = new HandSession();
  private readonly simulated = new SimulatedHands();
  private readonly indicators = new HandIndicators();
  private readonly debugPanel = new DebugPanel();
  private readonly panel: WelcomePanel;
  private diagnostics: SessionDiagnostics | null = null;
  private busy = false;
  private lastError: string | null = null;
  private debug = isDebugEnabled();
  private help = false;
  private uiLocked = false;
  private paperLocked = false;
  private completionAt = 0;
  private exitPrompt = false;
  private exiting = false;
  private returnedFromImmersive = false;
  private launcherFallback = false;
  private launcherRestored = false;

  constructor(private readonly roots: { overlay: HTMLElement; scene: HTMLElement }) {
    this.panel = new WelcomePanel(roots.overlay, {
      onStartSession: () => {
        void this.startFromLauncher();
      },
      onExitAR: () => this.promptExit(),
      onConfirmExit: () => {
        void this.confirmExit();
      },
      onKeepPlaying: () => this.dismissExitPrompt(),
      onRecenter: () => this.recenter(),
      onRestart: () => this.restart(),
      onReplay: () => this.restart(),
      onChooseAnother: () => this.openGalleryOverlay(),
      onHelp: () => this.toggleHelp(),
      onDebug: () => this.toggleDebug(),
    });
    this.machine.subscribe((state, previous) => {
      debugEvents.emit('stateChanged', { state, previous });
      this.renderPanel();
    });
    window.addEventListener('keydown', (event) => {
      if (!this.debug) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'a') {
        this.assistFold();
      }
      if (key === 'g') {
        this.toggleGalleryFromDebug();
      }
      if (key === 'p' && event.shiftKey) {
        if (this.gallery.floats.isPlaying) {
          this.gallery.floats.pause();
        } else {
          this.gallery.floats.resume();
        }
      }
      if (key === 'k' && event.shiftKey) {
        this.gallery.setCollidersVisible(!this.gallery.collidersVisible);
      }
      this.handleFoldDebugKeys(event);
    });
  }

  async start(): Promise<void> {
    this.machine.transition('CAPABILITY_CHECK');
    this.renderPanel();

    try {
      const report = await this.session.probeCapabilities();
      const world = await this.session.createWorld(this.roots.scene);
      world.scene.add(new AmbientLight(0xfff1de, 0.85));
      const key = new DirectionalLight(0xffd7a8, 1.35);
      key.position.set(0.6, 2.4, 1.2);
      world.scene.add(key);

      world.renderer.domElement.setAttribute('aria-label', 'Fold & Play paper studio');
      this.stage.mount(world);
      this.gallery.mount(world);
      this.stage.setDebugVisible(this.debug);
      world.registerSystem(
        createHandInteractionSystem({
          session: this.hands,
          getPaperRoot: () => this.stage.getPaperRoot(),
          overlay: this.stage.getOverlay(),
          moveHandle: this.stage.getMoveHandle(),
          cutter: this.stage.cutter,
          owlPinch: this.stage.owlPinch,
          mover: this.stage.mover,
          indicators: this.indicators,
          debugPanel: this.debugPanel,
          gallery: this.gallery,
          simulated: this.simulated,
          isDebug: () => this.debug,
          getAppState: () => this.machine.state,
          getDiagnostics: () => this.diagnostics,
          getEvents: () => debugEvents.latest(),
          onSnapshot: (snapshot, dtMs) => this.applyInteraction(snapshot, dtMs),
          onPlayFrame: (frame) => this.updatePlayManipulation(frame),
          isPlayManipulating: () => this.stage.manipulator.blocksUi,
          forceSimulated: () => isSimHandsForced(),
          isInputLocked: () =>
            this.exitPrompt ||
            this.exiting ||
            this.paperLocked ||
            this.stage.inputSuspended ||
            this.hands.awaitingFreshPinch,
          getMovingRegion: () => this.stage.engine.currentStep?.movingRegion,
          getMovingRegions: () => this.stage.engine.pendingMovingRegions(),
          getHoldRegion: () => this.stage.engine.currentStep?.optionalHoldRegion,
          onTestFoldFeedback: () => this.stage.feedback.playTest(),
          onXrSources: (sources) => this.stage.setInputSources(sources),
          getFoldDebug: () => {
            const alignment = this.stage.creaseAlignment();
            const ears = this.debug ? this.stage.engine.foxEarDebug() : null;
            return {
            angleDeg: this.stage.engine.angle,
            targetDeg: this.stage.engine.currentStep?.targetAngleDeg ?? 180,
            errorDeg: this.stage.engine.validation?.angleErrorDeg ?? 0,
            phase: this.stage.engine.enginePhase,
            recipeId: this.stage.getProgress().recipeId,
            stepId: this.stage.engine.currentStep?.id ?? 'done',
            cutState: this.stage.cutDebug().state,
            cutProgress: this.stage.cutDebug().progress,
            cutDone: this.stage.cutDebug().done,
            panelMode: this.stage.panelDebug().mode,
            panelSize: `${this.stage.panelDebug().widthM.toFixed(3)} x ${this.stage.panelDebug().heightM.toFixed(3)}  ${this.stage.panelDebug().current}`,
            panelPad: this.stage.panelDebug().pad,
            panelBounds: this.stage.panelDebug().content,
            panelBalanced: this.stage.panelDebug().padBalanced ? 'even' : 'uneven',
            committed: this.stage.getProgress().committedCount,
            total: this.stage.getProgress().totalSteps,
            action: this.stage.engine.currentStep
              ? (this.stage.engine.currentStep.actionType ?? 'fold')
              : 'done',
            holdMs: this.stage.engine.creaseHoldMs,
            foldPct: this.stage.engine.foldCompletion,
            assistOn: FOLD_ASSIST.enabled,
            snapArmed: this.stage.engine.magneticArmed,
            hapticAvailable: this.stage.feedback.hapticAvailable,
            feedbackOn: FOLD_FEEDBACK.enabled,
            stage: this.stage.getProgress().activeIndex == null
              ? this.stage.getProgress().totalSteps
              : (this.stage.getProgress().activeIndex ?? 0) + 1,
            subFold:
              this.stage.getProgress().subFold != null
                ? `${this.stage.getProgress().subFold}/${this.stage.getProgress().subFoldTotal}`
                : '—',
            creaseId: this.stage.engine.currentStep?.hinge.id,
            alignmentMm: alignment.errorM * 1000,
            mismatch: alignment.mismatch,
            warning: alignment.warning ?? undefined,
            grabRegion: this.stage.engine.currentStep?.movingRegion.id,
            movingIds: this.stage.engine.currentStep?.movingRegion.faceIds.join(',') ?? '—',
            hingeAxis: this.stage.engine.currentStep
              ? `${this.stage.engine.currentStep.hinge.p0.map((n) => n.toFixed(3)).join(',')} → ${this.stage.engine.currentStep.hinge.p1.map((n) => n.toFixed(3)).join(',')}`
              : '—',
            geometryState: this.stage.engine.isComplete()
              ? (this.stage.engine.currentStep?.toSnapshotId ?? 'faced')
              : (this.stage.engine.currentStep?.fromSnapshotId ?? '—'),
            finalPhase:
              batFinalPhase(this.stage.engine.currentStep?.id ?? null, this.stage.engine.isComplete()) ?? '—',
            sideFolds: this.stage.owlDebug().sides,
            decorState: this.stage.owlDebug().decor,
            movingFaces: alignment.movingFaces,
            earFolds: this.stage.engine.parallelFoldDebug(),
            earState: ears
              ? `L ${ears.state.left}  R ${ears.state.right}  active ${ears.activeFoldId}`
              : undefined,
            rightFaces: ears?.rightFaces,
            rightAxis: ears?.rightAxis,
            rightPivot: ears?.rightPivot,
            rightProgress: ears
              ? `${ears.angleDeg.toFixed(0)}°/${ears.targetDeg.toFixed(0)}°  ${(ears.progress * 100).toFixed(0)}%  ${ears.leftCreaseId}/${ears.rightCreaseId}`
              : undefined,
            rightSnap: ears?.snap,
            restart: {
              sessionId: this.stage.sessionId,
              count: this.stage.restartCount,
              meshId: tailId(this.stage.paperMeshId),
              targetId: tailId(this.stage.foldTargetMeshId),
              zones: this.stage.interactionZones,
              hands: this.stage.inputSourceLabel,
              interaction: this.hands.awaitingFreshPinch ? 'fresh-pinch' : this.machine.state,
              init: this.stage.foldInitStatus,
              snap: this.stage.magneticSnapState,
              error: this.stage.lastRestartError ?? '—',
              valid: this.refreshSessionValidation(),
            },
            stationaryFaces: alignment.stationaryFaces,
            layerMode: alignment.layerMode,
            layerCount: alignment.layerCount,
            frontFaces: alignment.frontFaces,
            backFaces: alignment.backFaces,
            groupFaces: alignment.groupFaces,
            ownership: alignment.ownership,
            gallery: {
              ...this.gallery.debug,
              whalePreserved: this.activeAnimalId != null,
              activeAnimal: this.activeAnimalId,
              drawCalls: world.renderer.info.render.calls,
              triangles: world.renderer.info.render.triangles,
            },
            playScale: this.stage.manipulator.debugView(),
            };
          },
        }),
      );
      world.registerSystem(
        createSpatialButtonSystem({
          onAction: (action) => this.handleToolbar(action),
          onGalleryEvent: (event) => this.handleGalleryEvent(event),
          onFrame: (camera, dtSec) => {
            this.stage.faceTracker(camera);
            this.gallery.tick(dtSec || 1 / 72);
          },
          isUiLocked: () => this.exitPrompt || this.exiting || this.uiLocked || this.stage.manipulator.blocksUi,
          isPlayLocked: () => this.stage.manipulator.blocksUi,
          isGallerySelectLocked: () => this.gallery.blocksCardSelection,
        }),
      );

      this.machine.transition('READY');
      this.machine.transition('WELCOME');
      if (!canLaunchImmersiveAr(report)) {
        this.lastError = report.errors[0] ?? 'AR unavailable in this browser';
      }
      this.renderPanel();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      debugEvents.emit('fatalError', { message: this.lastError });
      this.machine.transition('FATAL_ERROR');
      this.renderPanel();
    }
  }

  dispose(): void {
    this.stage.dispose();
    this.session.dispose();
  }

  private handleToolbar(action: ToolbarAction): void {
    if (this.exitPrompt && action !== 'confirm-exit' && action !== 'cancel-exit') {
      return;
    }
    if (action === 'exit') {
      this.promptExit();
      return;
    }
    if (action === 'cancel-exit') {
      console.info('[FoldPlay] exit-confirm click', { action: 'no-stay', state: 'open' });
      this.dismissExitPrompt();
      return;
    }
    if (action === 'confirm-exit') {
      console.info('[FoldPlay] exit-confirm click', { action: 'yes-leave', state: 'open' });
      void this.confirmExit();
      return;
    }
    if (action === 'menu') {
      this.openGalleryOverlay();
      return;
    }
    if (action === 'recenter') {
      this.recenter();
    } else if (action === 'restart') {
      this.restart();
    } else if (action === 'help') {
      this.toggleHelp();
    } else {
      this.toggleDebug();
    }
  }

  private async startFromLauncher(): Promise<void> {
    const world = this.session.getWorld();
    const presenting = Boolean(world?.renderer.xr.isPresenting);
    if (this.launcherFallback && (this.session.isSessionActive() || presenting)) {
      this.launcherRestored = false;
      await this.confirmExit();
      if (this.session.isSessionActive() || world?.renderer.xr.isPresenting) {
        return;
      }
    }
    await this.startSession();
  }

  private async startSession(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.lastError = null;
    this.launcherRestored = false;
    this.launcherFallback = false;
    this.dismissExitPrompt();
    this.renderPanel();
    try {
      const world = this.session.getWorld();
      if (!world) {
        throw new Error('World is not initialized');
      }
      const report = this.session.getCapabilities();
      if (
        !skipXR() &&
        !this.session.isSessionActive() &&
        report &&
        canLaunchImmersiveAr(report)
      ) {
        await this.session.enterAR();
        if (this.launcherRestored || !this.session.isSessionActive()) {
          return;
        }
        await waitForViewerPose(world);
        if (this.launcherRestored) {
          return;
        }
      }
      this.debugPanel.resetPlacement();
      this.gallery.placeFromCamera(world.camera);
      if (this.machine.state === 'WELCOME' && this.machine.canTransition('GALLERY_OPEN')) {
        this.machine.transition('GALLERY_OPEN');
      }
      this.stage.showToolbarOnly();
      this.gallery.show('open');
      this.stage.setMenuVisible(false);
      this.resetHands();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.renderPanel();
    }
  }

  private promptExit(): void {
    const idle = this.machine.state === 'WELCOME'
      || this.machine.state === 'READY'
      || this.machine.state === 'BOOT'
      || this.machine.state === 'CAPABILITY_CHECK'
      || this.machine.state === 'FATAL_ERROR';
    if (this.exitPrompt || this.exiting || this.busy || idle) {
      return;
    }
    this.exitPrompt = true;
    this.stage.setExitPrompt(true);
    this.renderPanel();
  }

  private dismissExitPrompt(): void {
    if (!this.exitPrompt) {
      this.stage.setExitPrompt(false);
      return;
    }
    this.exitPrompt = false;
    this.stage.setExitPrompt(false);
    this.renderPanel();
  }

  private async confirmExit(): Promise<void> {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    this.exitPrompt = false;
    this.stage.setExitPrompt(false);
    this.renderPanel();
    const world = this.session.getWorld();
    const session = world?.renderer.xr.getSession() ?? null;
    if (!session && !this.session.isSessionActive()) {
      this.returnToLauncher();
      this.exiting = false;
      this.renderPanel();
      return;
    }
    try {
      await this.session.exitAR();
      const stillPresent = Boolean(
        world?.renderer.xr.getSession() || world?.renderer.xr.isPresenting || this.session.isSessionActive(),
      );
      if (stillPresent) {
        throw new Error('The immersive session is still active.');
      }
    } catch (error) {
      console.error('Unable to exit WebXR:', error);
      this.lastError = 'Unable to exit WebXR. You can stay and try again.';
      this.exitPrompt = true;
      this.stage.setExitPrompt(true, this.lastError);
    } finally {
      this.exiting = false;
      this.renderPanel();
    }
  }

  private returnToLauncher(): void {
    if (this.launcherRestored) {
      return;
    }
    this.launcherRestored = true;
    this.exitPrompt = false;
    this.stage.releaseForSessionExit();
    this.hands.reset();
    if (this.gallery.group.visible) {
      this.gallery.cancelTransition();
    }
    this.stage.hidePaperRoot();
    this.foldResumeState = null;
    if (this.machine.state !== 'WELCOME') {
      this.machine.force('WELCOME');
    }
    this.machine.setTransient('XR_SESSION_ENDED');
    this.returnedFromImmersive = true;
    const world = this.session.getWorld();
    const presenting = Boolean(world?.renderer.xr.isPresenting);
    this.launcherFallback = document.hidden || presenting || this.session.isSessionActive();
    this.renderPanel();
  }

  private recenter(): void {
    const world = this.session.getWorld();
    if (!world) {
      return;
    }
    if (this.gallery.group.visible) {
      this.gallery.recenterToCamera(world.camera);
    } else {
      this.stage.recenter(world.camera);
    }
    this.debugPanel.resetPlacement();
    this.renderPanel();
  }

  private restart(): void {
    this.restartOrigamiSession();
  }

  private restartOrigamiSession(): void {
    this.paperLocked = true;
    this.uiLocked = true;
    this.gallery.cancelTransition();
    this.gallery.hide();
    this.hands.armFreshPinch();
    const camera = this.session.getWorld()?.camera ?? null;
    try {
      this.stage.restartOrigamiSession(camera);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.activeAnimalId = this.stage.activeAnimal;
      this.foldResumeState = 'INSTRUCTION';
      this.stage.setMenuVisible(true);
      this.debugPanel.resetPlacement();
      if (this.machine.state !== 'INSTRUCTION') {
        this.machine.force('INSTRUCTION');
      }
      this.uiLocked = false;
      this.paperLocked = false;
      this.renderPanel();
    }
  }

  private assistFold(): void {
    if (!this.debug || this.stage.engine.isBusy()) {
      return;
    }
    this.stage.engine.assistToTarget();
    if (this.machine.state === 'INSTRUCTION') {
      this.machine.transition('GRAB_ARMED');
    }
    if (this.machine.state === 'GRAB_ARMED') {
      this.machine.transition('FOLDING');
    }
    if (this.machine.state === 'FOLDING') {
      this.machine.transition('SNAP_PENDING');
      this.machine.transition('SNAP_ANIMATING');
    }
  }

  private toggleHelp(): void {
    this.help = !this.help;
    this.renderPanel();
  }

  private toggleDebug(): void {
    this.debug = !this.debug;
    this.debugPanel.setVisible(this.debug);
    this.stage.setDebugVisible(this.debug);
    this.renderPanel();
  }

  private handleGalleryEvent(event: GalleryPointerEvent): void {
    if (event.type === 'hover') {
      this.gallery.handlePointer(event);
      return;
    }
    if (event.type === 'press') {
      this.gallery.handlePointer(event);
      const route = routeAnimal(event.id, this.activeAnimalId);
      if (!route) {
        return;
      }
      if (route.kind === 'coming-soon') {
        this.gallery.showComingSoon();
        return;
      }
      if (route.kind === 'resume') {
        this.gallery.showResumePrompt();
        return;
      }
      if (isPlayableAnimalId(route.id)) {
        this.launchAnimal(route.id);
      }
      return;
    }
    if (event.type !== 'control') {
      return;
    }
    if (event.control === 'page-next') {
      this.gallery.setPage(this.gallery.pageIndex + 1);
    } else if (event.control === 'page-prev') {
      this.gallery.setPage(this.gallery.pageIndex - 1);
    } else if (event.control === 'recenter-menu') {
      const world = this.session.getWorld();
      if (world) {
        this.gallery.recenterToCamera(world.camera);
      }
    } else if (event.control === 'continue') {
      this.resumeFold();
    } else if (event.control === 'restart') {
      this.gallery.showRestartConfirm();
    } else if (event.control === 'confirm-restart') {
      this.restartFoldFromGallery();
    } else {
      this.gallery.hidePrompts();
    }
  }

  private launchAnimal(id: PlayableAnimalId): void {
    if (this.machine.state === 'GALLERY_OPEN' && this.machine.canTransition('GALLERY_COLLAPSING')) {
      this.machine.transition('GALLERY_COLLAPSING');
    }
    const world = this.session.getWorld();
    const generation = this.stage.sessionGeneration;
    this.gallery.collapse(() => {
      if (generation !== this.stage.sessionGeneration) {
        return;
      }
      if (this.machine.state === 'GALLERY_COLLAPSING' && this.machine.canTransition('WHALE_LOADING')) {
        this.machine.transition('WHALE_LOADING');
      }
      this.stage.loadAnimal(id);
      const needsSpawn = !this.stage.isPaperSpawned();
      this.stage.revealFolding();
      if (needsSpawn && world) {
        this.stage.spawnFromCamera(world.camera, 'start');
      }
      this.activeAnimalId = id;
      this.foldResumeState = 'INSTRUCTION';
      this.enterFoldInstruction();
    });
  }

  private resumeFold(): void {
    const resume = this.foldResumeState;
    const generation = this.stage.sessionGeneration;
    this.gallery.hidePrompts();
    this.gallery.collapse(() => {
      if (generation !== this.stage.sessionGeneration) {
        return;
      }
      this.gallery.hide();
      this.stage.setMenuVisible(true);
      if (this.machine.state === 'GALLERY_OVERLAY' && resume && this.machine.canTransition(resume)) {
        this.machine.transition(resume);
      } else {
        this.enterFoldInstruction();
      }
    });
    if (this.machine.state === 'GALLERY_OPEN' && this.machine.canTransition('GALLERY_COLLAPSING')) {
      this.machine.transition('GALLERY_COLLAPSING');
    }
  }

  private restartFoldFromGallery(): void {
    this.restartOrigamiSession();
  }

  private openGalleryOverlay(): void {
    if (this.gallery.group.visible || this.uiLocked) {
      return;
    }
    if (this.stage.engine.enginePhase === 'folding') {
      this.stage.engine.cancelActive();
      this.hands.reset();
    }
    this.foldResumeState = this.machine.state;
    if (this.machine.canTransition('GALLERY_OVERLAY')) {
      this.machine.transition('GALLERY_OVERLAY');
    }
    const world = this.session.getWorld();
    if (world) {
      this.gallery.placeFromCamera(world.camera);
    }
    this.gallery.expand('overlay');
    this.stage.setMenuVisible(false);
  }

  private toggleGalleryFromDebug(): void {
    if (this.gallery.group.visible) {
      if (this.activeAnimalId) {
        this.resumeFold();
      }
      return;
    }
    if (this.activeAnimalId) {
      this.openGalleryOverlay();
      return;
    }
    const world = this.session.getWorld();
    if (world) {
      this.gallery.placeFromCamera(world.camera);
    }
    if (this.machine.canTransition('GALLERY_OPEN')) {
      this.machine.transition('GALLERY_OPEN');
    }
    this.gallery.show('open');
  }

  private enterFoldInstruction(): void {
    if (this.machine.state === 'GALLERY_COLLAPSING' && this.machine.canTransition('WHALE_LOADING')) {
      this.machine.transition('WHALE_LOADING');
    }
    if (this.machine.state === 'WHALE_LOADING' && this.machine.canTransition('PAPER_READY')) {
      this.machine.transition('PAPER_READY');
    }
    if (this.machine.state === 'GALLERY_OVERLAY' && this.machine.canTransition('PAPER_READY')) {
      this.machine.transition('PAPER_READY');
    }
    if (this.machine.canTransition('INSTRUCTION')) {
      this.machine.transition('INSTRUCTION');
    }
    this.resetHands();
    this.renderPanel();
  }

  private resetHands(): void {
    this.hands.reset();
    this.uiLocked = false;
    this.paperLocked = false;
    this.stage.getOverlay().reset();
  }

  private enterCompletionIfNeeded(): boolean {
    if (!this.stage.engine.isComplete() || !this.stage.engine.canStartCreature()) {
      return false;
    }
    const state = this.machine.state;
    if (state === 'COMPLETION' || state === 'CREATURE_ALIVE' || state === 'REPLAY') {
      return true;
    }
    if (state === 'SNAP_ANIMATING' && this.machine.canTransition('FOLD_LOCKED')) {
      this.machine.transition('FOLD_LOCKED');
    }
    if (this.machine.canTransition('COMPLETION')) {
      this.machine.transition('COMPLETION');
      this.completionAt = performance.now();
      return true;
    }
    return false;
  }

  private updatePlayManipulation(frame: PlayManipulationFrame): void {
    const playing =
      (this.machine.state === 'CREATURE_ALIVE' || this.machine.state === 'REPLAY') &&
      this.stage.creature.active &&
      !this.stage.inputSuspended;
    if (!playing) {
      this.stage.manipulator.sleep();
      return;
    }
    this.stage.manipulator.update(frame);
  }

  private applyInteraction(snapshot: InteractionSnapshot, dtMs: number): void {
    const engine = this.stage.engine;
    const state = this.machine.state;
    this.uiLocked = this.exitPrompt || this.exiting || snapshot.uiDisabled || TOOLBAR_LOCK.has(state) || engine.isAnimating();
    this.paperLocked =
      this.exitPrompt ||
      this.exiting ||
      this.uiLocked ||
      PAPER_LOCK.has(state) ||
      engine.isComplete() ||
      engine.isBusy() ||
      this.hands.awaitingFreshPinch ||
      this.stage.inputSuspended;

    if (
      state === 'WELCOME' ||
      state === 'READY' ||
      state === 'BOOT' ||
      state === 'CAPABILITY_CHECK' ||
      state === 'FATAL_ERROR' ||
      this.exitPrompt ||
      this.exiting
    ) {
      return;
    }

    if (GALLERY_STATES.has(state)) {
      if (this.activeAnimalId) {
        this.stage.applyFoldVisuals(false);
      }
      this.syncTrackingTransient(snapshot);
      return;
    }

    if (engine.enginePhase === 'snapping' || engine.enginePhase === 'returning') {
      const { finished, committed } = engine.tick(dtMs);
      this.stage.applyFoldVisuals(false);
      if (!finished) {
        return;
      }
      if (committed) {
        this.stage.commitProgress();
        if (this.enterCompletionIfNeeded()) {
          return;
        }
        if (this.machine.state === 'SNAP_ANIMATING') {
          this.machine.transition('FOLD_LOCKED');
        }
        if (this.machine.canTransition('INSTRUCTION')) {
          this.machine.transition('INSTRUCTION');
        }
      } else if (this.machine.canTransition('INSTRUCTION')) {
        this.machine.transition('INSTRUCTION');
      }
      return;
    }

    this.enterCompletionIfNeeded();

    if (this.machine.state === 'COMPLETION') {
      if (performance.now() - this.completionAt >= 350) {
        this.machine.transition('CREATURE_ALIVE');
        this.stage.startCreature();
      }
      this.stage.applyFoldVisuals(false);
      return;
    }

    if (state === 'CREATURE_ALIVE' || state === 'REPLAY') {
      return;
    }

    if (snapshot.cutPulse) {
      if (this.stage.activeAnimal === 'owl') {
        this.stage.beginOwlLife();
      } else {
        this.stage.cutter.begin();
      }
    }
    if (!engine.isBusy() && this.stage.cutter.consumeCommit()) {
      engine.assistToTarget();
      this.enterSnapFromFold(true);
    }
    if (!engine.isBusy() && this.stage.consumeOwlCommit()) {
      engine.assistToTarget();
      this.enterSnapFromFold(true);
    }
    if (!engine.isBusy() && this.stage.consumeOwlOpen()) {
      engine.assistToTarget();
      this.enterSnapFromFold(true);
    }
    if (!engine.isBusy() && this.stage.consumeFaceCommit()) {
      engine.assistToTarget();
      this.enterSnapFromFold(true);
    }
    if (this.stage.blocksGuidedTool() && snapshot.grabbed) {
      this.stage.applyFoldVisuals(false);
      this.syncTrackingTransient(snapshot);
      return;
    }

    if (snapshot.paperMoving && engine.enginePhase !== 'folding') {
      this.stage.applyFoldVisuals(false);
      this.syncTrackingTransient(snapshot);
      return;
    }

    if (snapshot.grabbed && snapshot.trackingMode === 'cancelled' && engine.enginePhase === 'folding') {
      const outcome = engine.cancelActive();
      this.hands.reset();
      this.enterSnapFromFold(outcome === 'snapping');
      this.lastError = outcome === 'snapping' ? null : 'Tracking lost; retry this fold';
      this.stage.applyFoldVisuals(false);
      return;
    }

    if (snapshot.grabbed && snapshot.ownerLocal && !engine.isBusy()) {
      if (this.machine.state === 'INSTRUCTION') {
        this.machine.transition('GRAB_ARMED');
      }
      if (this.machine.state === 'GRAB_ARMED') {
        this.machine.transition('FOLDING');
        engine.beginGrab(snapshot.ownerLocal);
      }
      if (this.machine.state === 'FOLDING') {
        if (engine.enginePhase !== 'folding') {
          engine.beginGrab(snapshot.ownerLocal);
        }
        engine.updateFold(snapshot.ownerLocal, snapshot.trackingMode === 'frozen', dtMs);
      }
      if (this.stage.engine.enginePhase === 'snapping') {
        this.enterSnapFromFold(true);
        this.lastError = null;
      }
      this.stage.applyFoldVisuals(this.stage.engine.enginePhase === 'folding');
      this.syncTrackingTransient(snapshot);
      return;
    }

    if (this.machine.state === 'FOLDING' && !snapshot.grabbed) {
      const result = engine.release();
      this.enterSnapFromFold(result.ok);
      this.lastError = result.ok ? null : 'Almost — bring edge to the highlighted target';
      this.stage.applyFoldVisuals(false);
      return;
    }

    if (snapshot.hoverMoving && (state === 'INSTRUCTION' || state === 'GRAB_ARMED')) {
      if (state === 'INSTRUCTION') {
        this.machine.transition('GRAB_ARMED');
      }
    } else if (state === 'GRAB_ARMED' && !snapshot.hoverMoving) {
      this.machine.transition('INSTRUCTION');
    }

    this.stage.applyFoldVisuals(false);
    this.syncTrackingTransient(snapshot);
  }

  private enterSnapFromFold(success: boolean): void {
    if (this.machine.state === 'FOLDING' && this.machine.canTransition('SNAP_PENDING')) {
      this.machine.transition('SNAP_PENDING');
    }
    if (this.machine.state === 'SNAP_PENDING') {
      this.machine.transition(success ? 'SNAP_ANIMATING' : 'RETURN_ANIMATING');
    }
  }

  private handleFoldDebugKeys(event: KeyboardEvent): void {
    const key = event.key;
    if ((key === 'm' || key === 'M') && event.shiftKey) {
      MOVE_HANDLE_INSPECTOR.collider = !MOVE_HANDLE_INSPECTOR.collider;
    } else if (key === 'm' || key === 'M') {
      FOLD_ASSIST.enabled = !FOLD_ASSIST.enabled;
    }
    if (key === '1' && !event.altKey) {
      FOLD_ASSIST.activationThreshold = nudgeConfig(FOLD_ASSIST.activationThreshold, -0.05, 0.1, 0.9);
    }
    if (key === '2' && !event.altKey) {
      FOLD_ASSIST.activationThreshold = nudgeConfig(FOLD_ASSIST.activationThreshold, 0.05, 0.1, 0.9);
    }
    if (key === '3' && !event.altKey) {
      FOLD_ASSIST.autoSnapThreshold = nudgeConfig(FOLD_ASSIST.autoSnapThreshold, -0.05, 0.15, 0.95);
    }
    if (key === '4' && !event.altKey) {
      FOLD_ASSIST.autoSnapThreshold = nudgeConfig(FOLD_ASSIST.autoSnapThreshold, 0.05, 0.15, 0.95);
    }
    if (FOLD_ASSIST.autoSnapThreshold < FOLD_ASSIST.activationThreshold + 0.02) {
      FOLD_ASSIST.autoSnapThreshold = Math.min(0.95, FOLD_ASSIST.activationThreshold + 0.02);
    }
    if (key === '5' && !event.altKey) {
      FOLD_ASSIST.snapDurationMs = nudgeConfig(FOLD_ASSIST.snapDurationMs, -40, 160, 800);
    }
    if (key === '6' && !event.altKey) {
      FOLD_ASSIST.snapDurationMs = nudgeConfig(FOLD_ASSIST.snapDurationMs, 40, 160, 800);
    }
    if ((key === 'c' || key === 'C') && !event.shiftKey) {
      CREASE_GUIDE.visible = !CREASE_GUIDE.visible;
    }
    if (key === '7' && !event.altKey && !event.shiftKey) {
      CREASE_GUIDE.widthM = nudgeConfig(CREASE_GUIDE.widthM, -0.0004, 0.0012, 0.006);
    }
    if (key === '8') {
      CREASE_GUIDE.widthM = nudgeConfig(CREASE_GUIDE.widthM, 0.0004, 0.0012, 0.006);
    }
    if (key === '9') {
      CREASE_GUIDE.dashM = nudgeConfig(CREASE_GUIDE.dashM, -0.001, 0.003, 0.014);
    }
    if (key === '0') {
      CREASE_GUIDE.dashM = nudgeConfig(CREASE_GUIDE.dashM, 0.001, 0.003, 0.014);
    }
    if (key === '-' || key === '_') {
      CREASE_GUIDE.gapM = nudgeConfig(CREASE_GUIDE.gapM, -0.001, 0.002, 0.012);
    }
    if (key === '=' || key === '+') {
      CREASE_GUIDE.gapM = nudgeConfig(CREASE_GUIDE.gapM, 0.001, 0.002, 0.012);
    }
    if ((key === 'v' || key === 'V') && event.shiftKey) {
      this.refreshSessionValidation();
    } else if (key === 'v' || key === 'V') {
      ARROW_GUIDE.visible = !ARROW_GUIDE.visible;
    }
    if ((key === 'b' || key === 'B') && event.shiftKey) {
      MOVE_HANDLE_INSPECTOR.meshBounds = !MOVE_HANDLE_INSPECTOR.meshBounds;
    } else if (key === 'b' || key === 'B') {
      ARROW_GUIDE.animate = !ARROW_GUIDE.animate;
    }
    if (key === '(') {
      setUiOpacity(getUiOpacity() - 0.04);
    }
    if (key === ')') {
      setUiOpacity(getUiOpacity() + 0.04);
    }
    if (key === '[') {
      ARROW_GUIDE.cycleSec = nudgeConfig(ARROW_GUIDE.cycleSec, -0.15, 0.6, 3.2);
    }
    if (key === ']') {
      ARROW_GUIDE.cycleSec = nudgeConfig(ARROW_GUIDE.cycleSec, 0.15, 0.6, 3.2);
    }
    if (key === ',') {
      ARROW_GUIDE.travel = nudgeConfig(ARROW_GUIDE.travel, -0.01, 0.08, 0.12);
    }
    if (key === '.') {
      ARROW_GUIDE.travel = nudgeConfig(ARROW_GUIDE.travel, 0.01, 0.08, 0.12);
    }
    if (key === 'h' || key === 'H') {
      FOLD_FEEDBACK.enabled = !FOLD_FEEDBACK.enabled;
    }
    if (key === 'j' || key === 'J') {
      FOLD_FEEDBACK.haptics = !FOLD_FEEDBACK.haptics;
    }
    if (key === 't' || key === 'T') {
      this.stage.feedback.playTest();
    }
    if ((key === 'y' || key === 'Y') && event.shiftKey) {
      MOVE_HANDLE_INSPECTOR.interactionLayer = !MOVE_HANDLE_INSPECTOR.interactionLayer;
    } else if (key === 'y' || key === 'Y') {
      FOLD_FEEDBACK.highlight = !FOLD_FEEDBACK.highlight;
    }
    if (key === 'n' || key === 'N') {
      FOLD_FEEDBACK.settle = !FOLD_FEEDBACK.settle;
    }
    if (key === 'u' || key === 'U') {
      FOLD_FEEDBACK.volume = nudgeConfig(FOLD_FEEDBACK.volume, -0.08, 0, 1);
    }
    if (key === 'i' || key === 'I') {
      FOLD_FEEDBACK.volume = nudgeConfig(FOLD_FEEDBACK.volume, 0.08, 0, 1);
    }
    if (key === 'd' || key === 'D') {
      FOLD_FEEDBACK.debugAssist = !FOLD_FEEDBACK.debugAssist;
    }
    if (key === 'z' || key === 'Z') {
      FOLD_GEOMETRY_INSPECTOR.frontLayer = !FOLD_GEOMETRY_INSPECTOR.frontLayer;
    }
    if (key === 'x' || key === 'X') {
      FOLD_GEOMETRY_INSPECTOR.backLayer = !FOLD_GEOMETRY_INSPECTOR.backLayer;
    }
    if (key === 'q' || key === 'Q') {
      FOLD_GEOMETRY_INSPECTOR.foldGroup = !FOLD_GEOMETRY_INSPECTOR.foldGroup;
    }
    if (key === 'e' || key === 'E') {
      FOLD_GEOMETRY_INSPECTOR.leftEarCrease = !FOLD_GEOMETRY_INSPECTOR.leftEarCrease;
    }
    if (key === 'r' || key === 'R') {
      FOLD_GEOMETRY_INSPECTOR.rightEarCrease = !FOLD_GEOMETRY_INSPECTOR.rightEarCrease;
    }
    if (key === 'w' || key === 'W') {
      FOLD_GEOMETRY_INSPECTOR.leftFoldRegion = !FOLD_GEOMETRY_INSPECTOR.leftFoldRegion;
    }
    if (key === 's' || key === 'S') {
      FOLD_GEOMETRY_INSPECTOR.rightFoldRegion = !FOLD_GEOMETRY_INSPECTOR.rightFoldRegion;
    }
    if ((key === 'k' || key === 'K') && !event.shiftKey) {
      FOLD_GEOMETRY_INSPECTOR.hingeAxis = !FOLD_GEOMETRY_INSPECTOR.hingeAxis;
    }
    if ((key === 'o' || key === 'O') && event.shiftKey) {
      MENU_DRAG_INSPECTOR.rayHit = !MENU_DRAG_INSPECTOR.rayHit;
    } else if ((key === 'o' || key === 'O') && !event.shiftKey) {
      MENU_DRAG_CONFIG.enabled = !MENU_DRAG_CONFIG.enabled;
    }
    if ((key === 'b' || key === 'B') && event.shiftKey) {
      BAT_SHAPE_INSPECTOR.enabled = !BAT_SHAPE_INSPECTOR.enabled;
    }
    if (event.altKey && /^Digit[1-7]$/.test(event.code)) {
      const stage = Number(event.code.slice(5));
      if (this.stage.activeAnimal === 'owl' && stage <= 5) {
        this.stage.prepareOwlStep(stage);
        if (this.machine.state !== 'INSTRUCTION') {
          this.machine.force('INSTRUCTION');
        }
      } else if (this.stage.activeAnimal === 'bat') {
        this.stage.prepareBatStep(stage);
        if (this.machine.state !== 'INSTRUCTION') {
          this.machine.force('INSTRUCTION');
        }
      }
    }
    if ((key === '7' && event.shiftKey) || key === '&') {
      if (this.stage.activeAnimal === 'bat') {
        this.stage.prepareBatCut();
        if (this.machine.state !== 'INSTRUCTION') {
          this.machine.force('INSTRUCTION');
        }
      }
    }
    if ((key === 'c' || key === 'C') && event.shiftKey) {
      const next = !BAT_CUT_INSPECTOR.path;
      BAT_CUT_INSPECTOR.path = next;
      BAT_CUT_INSPECTOR.collider = next;
      BAT_CUT_INSPECTOR.geometry = next;
      BAT_CUT_INSPECTOR.layers = next;
    }
    if ((key === 'f' || key === 'F') && event.shiftKey) {
      FOX_SHAPE_INSPECTOR.enabled = !FOX_SHAPE_INSPECTOR.enabled;
    } else if ((key === 'f' || key === 'F') && !event.shiftKey) {
      MENU_DRAG_INSPECTOR.handleCollider = !MENU_DRAG_INSPECTOR.handleCollider;
    }
    if (key === "'" || key === '"') {
      FOX_SHAPE_INSPECTOR.wireframe = !FOX_SHAPE_INSPECTOR.wireframe;
    }
    if (key === '\\' || key === '|') {
      FOX_SHAPE_INSPECTOR.disableBackfaceCulling = !FOX_SHAPE_INSPECTOR.disableBackfaceCulling;
    }
    if (key === '/') {
      FOX_SHAPE_INSPECTOR.faceIds = !FOX_SHAPE_INSPECTOR.faceIds;
    }
    if (key === '?') {
      FOX_SHAPE_INSPECTOR.triangleNormals = !FOX_SHAPE_INSPECTOR.triangleNormals;
    }
    if (key === ';') {
      MENU_DRAG_INSPECTOR.boundingBox = !MENU_DRAG_INSPECTOR.boundingBox;
    }
    if (key === ':') {
      MENU_DRAG_INSPECTOR.handRay = !MENU_DRAG_INSPECTOR.handRay;
    }
    if (key === '<') {
      STEPPER_INSPECTOR.connectorBounds = !STEPPER_INSPECTOR.connectorBounds;
    }
    if (key === '>') {
      STEPPER_INSPECTOR.connectorState = !STEPPER_INSPECTOR.connectorState;
    }
    if (key === 'l' || key === 'L') {
      const world = this.session.getWorld();
      if (!world) {
        return;
      }
      if (event.shiftKey) {
        this.gallery.placeFromCamera(world.camera, 'reset');
      } else {
        this.gallery.recenterToCamera(world.camera);
      }
    }
  }

  private refreshSessionValidation(): string {
    const paper = this.stage.validateSession();
    const issues = paper.ok ? [] : paper.reason.split(',').filter((issue) => issue !== 'ok');
    const ownership = this.hands.getOwnership();
    if (ownership.fold || ownership.hold || ownership.move) {
      issues.push('gesture');
    }
    if (this.gallery.transition.active) {
      issues.push('gallery');
    }
    return issues.length === 0 ? 'OK' : `FAIL ${issues.join(' ')}`;
  }

  private syncTrackingTransient(snapshot: InteractionSnapshot): void {
    if (snapshot.grabbed && (snapshot.trackingMode === 'frozen' || snapshot.trackingMode === 'cancelled')) {
      this.machine.setTransient('HAND_TRACKING_DEGRADED');
    } else if (this.machine.transientState === 'HAND_TRACKING_DEGRADED' && snapshot.trackingMode === 'ok') {
      this.machine.setTransient(null);
    }
  }

  private renderPanel(): void {
    this.panel.render({
      appState: this.machine.state,
      transient: this.machine.transientState,
      report: this.session.getCapabilities(),
      diagnostics: this.diagnostics,
      busy: this.busy,
      lastError: this.lastError,
      debug: this.debug,
      help: this.help,
      exitPrompt: this.exitPrompt,
      returnedFromImmersive: this.returnedFromImmersive,
      launcherFallback: this.launcherFallback,
      events: debugEvents.latest(),
    });
  }
}
