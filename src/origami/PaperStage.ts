import type { World } from '@iwsdk/core';
import { VisibilityState } from '@iwsdk/core';
import type { PerspectiveCamera } from 'three';
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { BatCreature } from '../animation/BatCreature.ts';
import { OwlCreature } from '../animation/OwlCreature.ts';
import { CompletedOrigamiManipulator } from '../animation/CompletedOrigamiManipulator.ts';
import { FoxCreature } from '../animation/FoxCreature.ts';
import { WhaleCreature } from '../animation/WhaleCreature.ts';
import type { PlayableAnimalId } from '../gallery/animals.ts';
import { CreaseDebugOverlay } from '../ui/CreaseDebugOverlay.ts';
import { FoxShapeInspector } from '../ui/FoxShapeInspector.ts';
import { FoldGuides } from '../ui/FoldGuides.ts';
import { GrabRegionOverlay } from '../ui/GrabRegionOverlay.ts';
import { MoveHandle } from '../ui/MoveHandle.ts';
import { UnifiedFoldingPanel } from '../ui/UnifiedFoldingPanel.ts';
import { COPY, completionBodyFor } from '../ui/welcomeCopy.ts';
import { ExitConfirm } from '../ui/ExitConfirm.ts';
import { SpatialToolbar } from '../ui/SpatialToolbar.ts';
import { PaperMover } from './PaperMover.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { disposeObject3D } from '../utils/dispose.ts';
import { FoldFeedbackController } from '../feedback/FoldFeedbackController.ts';
import { FOLD_PAPER_COLOR, FoldPaper } from './FoldPaper.ts';
import { OrigamiEngine } from './OrigamiEngine.ts';
import {
  PAPER_TILT_RAD,
  SPAWN_OFFSET_LOCAL,
  offsetInViewerSpace,
  spawnDistanceM,
  type Vec3,
} from './placement.ts';
import { progressFromRecipe, type ProgressModel } from './progressModel.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from './creaseMath.ts';
import { layerOwnershipLabel } from './foldLayerGroup.ts';
import { foldAxisDebug } from './MeshSplitter.ts';
import { FOX_SHAPE_INSPECTOR } from './foxFinalShape.ts';
import { validateBatGeometry } from './batFinalShape.ts';
import { BAT_NAMED, BAT_PAPER_COLOR, BAT_RECIPE } from './recipes/bat.recipe.ts';
import { OwlPinch } from './OwlPinch.ts';
import { ScissorsCut } from './ScissorsCut.ts';
import { FOX_NAMED, FOX_PAPER_COLOR, FOX_RECIPE } from './recipes/fox.recipe.ts';
import { OWL_NAMED, OWL_PAPER_COLOR, OWL_RECIPE } from './recipes/owl.recipe.ts';
import { theme } from '../theme/tokens.ts';
import { WHALE_NAMED, WHALE_RECIPE } from './recipes/whale.recipe.ts';

const _position = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();
const _quat = new Quaternion();

function vec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

export class PaperStage {
  private readonly studio = new Group();
  private readonly paperRoot = new Group();
  /** User scale for a finished animal. Panels stay on paperRoot so they do not grow with it. */
  private readonly scaleRoot = new Group();
  private readonly sheet = new FoldPaper();
  private readonly overlay = new GrabRegionOverlay();
  private readonly guides = new FoldGuides();
  private readonly creaseDebug = new CreaseDebugOverlay();
  private readonly foxShape = new FoxShapeInspector();
  private debugVisible = false;
  private readonly foldingPanel = new UnifiedFoldingPanel();
  private lastStepId = '';
  private lastTitle = '';
  private lastBody = '';
  private readonly moveHandle = new MoveHandle();
  private readonly toolbar = new SpatialToolbar();
  private readonly exitConfirm = new ExitConfirm();
  private toolbarOnly = false;
  private exitPrompt = false;
  readonly whaleCreature = new WhaleCreature();
  readonly foxCreature = new FoxCreature();
  readonly batCreature = new BatCreature();
  readonly owlCreature = new OwlCreature();
  readonly cutter = new ScissorsCut();
  readonly owlPinch = new OwlPinch();
  private faceRevealMs = -1;
  private faceCommit = false;
  private owlOpenConsumed = false;
  readonly manipulator: CompletedOrigamiManipulator;
  readonly mover = new PaperMover();
  readonly engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
  private animalId: PlayableAnimalId = 'whale';
  private generation = 0;
  private restarts = 0;
  private inputSuspendedFlag = false;
  private initStatus: 'pending' | 'ready' | 'resetting' | 'error' = 'ready';
  private restartError: string | null = null;
  private boundMeshId: string;
  private boundRootId: string;
  readonly feedback: FoldFeedbackController;

  get creature(): WhaleCreature | FoxCreature | BatCreature | OwlCreature {
    if (this.animalId === 'fox') {
      return this.foxCreature;
    }
    if (this.animalId === 'bat') {
      return this.batCreature;
    }
    if (this.animalId === 'owl') {
      return this.owlCreature;
    }
    return this.whaleCreature;
  }

  get activeAnimal(): PlayableAnimalId {
    return this.animalId;
  }
  private camera: PerspectiveCamera | null = null;
  private xrSources: XRInputSource[] = [];
  private paperEntity: ReturnType<World['createTransformEntity']> | null = null;
  private unsubscribe: (() => void) | null = null;
  private frozen = false;
  private foldingSpawned = false;
  private progress: ProgressModel = progressFromRecipe(WHALE_RECIPE);

  constructor() {
    this.feedback = new FoldFeedbackController({
      paperRoot: this.paperRoot,
      sheet: this.sheet.group,
      paperMeshMaterial: this.sheet.material,
      getCamera: () => this.camera,
      getCurrentStep: () => this.engine.currentStep,
      getInputSources: () => this.xrSources,
    });
    this.boundMeshId = this.sheet.meshId;
    this.boundRootId = this.paperRoot.uuid;
    this.paperRoot.name = 'fold-fly-paper-root';
    this.scaleRoot.name = 'origami-scale-root';
    this.sheet.group.add(this.foxShape.group);
    this.cutter.attach(this.sheet.group);
    this.owlPinch.attach(this.sheet.group);
    this.scaleRoot.add(this.sheet.group);
    this.paperRoot.add(
      this.scaleRoot,
      this.overlay.group,
      this.guides.group,
      this.creaseDebug.group,
      this.foldingPanel.group,
      this.moveHandle.group,
      this.exitConfirm.group,
    );
    this.manipulator = new CompletedOrigamiManipulator(this.paperRoot, this.scaleRoot);
    this.manipulator.setHighlight((active) => this.sheet.setGrabHighlight(active));
  }

  mount(world: World): void {
    this.studio.name = 'fold-fly-studio';
    this.paperRoot.name = 'fold-fly-paper-root';
    this.scaleRoot.name = 'origami-scale-root';
    this.studio.add(this.createBackdrop());
    this.sheet.group.add(this.foxShape.group);
    this.scaleRoot.add(this.sheet.group);
    this.paperRoot.add(
      this.scaleRoot,
      this.overlay.group,
      this.guides.group,
      this.creaseDebug.group,
      this.foldingPanel.group,
      this.moveHandle.group,
      this.exitConfirm.group,
    );
    this.placePreview();
    this.syncStepVisuals();
    this.paperRoot.visible = false;

    world.createTransformEntity(this.studio, { persistent: true });
    this.paperEntity = world.createTransformEntity(this.paperRoot, { persistent: true });
    this.toolbar.mount(world, this.paperEntity);
    this.exitConfirm.mount(world, this.paperEntity);
    this.foldingPanel.mount(world, this.paperEntity);
    this.toolbar.setActionVisible('menu', false);
    world.scene.add(this.whaleCreature.group);
    world.scene.add(this.foxCreature.group);
    world.scene.add(this.batCreature.group);
    world.scene.add(this.owlCreature.group);

    this.unsubscribe = world.visibilityState.subscribe((state) => {
      this.studio.visible = state === VisibilityState.NonImmersive;
      if (state === VisibilityState.Hidden) {
        this.creature.stop();
      }
    });
    this.syncPanel();
  }

  spawnFromCamera(camera: PerspectiveCamera, reason: 'start' | 'recenter'): void {
    camera.getWorldPosition(_position);
    camera.getWorldQuaternion(_quat);
    _forward.set(0, 0, -1).applyQuaternion(_quat);
    _up.set(0, 1, 0).applyQuaternion(_quat);

    const target = offsetInViewerSpace(
      vec3(_position),
      vec3(_forward),
      vec3(_up),
      SPAWN_OFFSET_LOCAL,
    );
    this.mover.resetScale(this.paperRoot);
    this.paperRoot.position.set(...target);
    this.paperRoot.quaternion.copy(_quat);
    this.paperRoot.rotateX(-PAPER_TILT_RAD);
    this.frozen = true;
    this.foldingSpawned = true;

    debugEvents.emit(reason === 'recenter' ? 'paperRecentered' : 'paperSpawned', {
      reason,
      position: target,
      distanceM: spawnDistanceM(),
      frozen: true,
    });
  }

  recenter(camera: PerspectiveCamera): void {
    this.spawnFromCamera(camera, 'recenter');
  }

  loadAnimal(id: PlayableAnimalId): void {
    this.animalId = id;
    this.whaleCreature.stop();
    this.foxCreature.stop();
    this.batCreature.stop();
    this.owlCreature.stop();
    this.cutter.reset();
    this.owlPinch.reset();
    this.faceRevealMs = -1;
    this.faceCommit = false;
    this.owlOpenConsumed = false;
    this.sheet.group.position.set(0, 0, 0);
    this.sheet.group.rotation.set(0, 0, 0);
    this.sheet.group.scale.set(1, 1, 1);
    if (id === 'fox') {
      this.engine.reset(FOX_RECIPE, FOX_NAMED);
      this.sheet.setColor(FOX_PAPER_COLOR);
    } else if (id === 'bat') {
      this.engine.reset(BAT_RECIPE, BAT_NAMED);
      this.sheet.setColor(BAT_PAPER_COLOR);
    } else if (id === 'owl') {
      this.engine.reset(OWL_RECIPE, OWL_NAMED);
      this.sheet.setColor(OWL_PAPER_COLOR);
    } else {
      this.engine.reset(WHALE_RECIPE, WHALE_NAMED);
      this.sheet.setColor(FOLD_PAPER_COLOR);
    }
    this.sheet.group.visible = true;
    this.guides.show();
    this.progress = this.engine.progress();
    this.syncStepVisuals();
    this.overlay.reset();
    this.overlay.setVisible(true);
    this.mover.resetScale(this.paperRoot);
    this.manipulator.reset();
    this.moveHandle.setVisible(true);
    this.feedback.reset();
    this.initStatus = 'ready';
  }

  restart(): void {
    this.restartOrigamiSession(this.camera);
  }

  restartOrigamiSession(camera: PerspectiveCamera | null): void {
    this.inputSuspendedFlag = true;
    this.initStatus = 'resetting';
    try {
      this.generation += 1;
      this.restarts += 1;
      this.restartError = null;
      this.mover.end();
      this.loadAnimal(this.animalId);
      this.sheet.group.position.set(0, 0, 0);
      this.sheet.group.rotation.set(0, 0, 0);
      this.sheet.group.scale.set(1, 1, 1);
      if (camera) {
        this.spawnFromCamera(camera, 'start');
      } else {
        this.placePreview();
      }
      this.frozen = false;
      this.foldingSpawned = true;
      this.revealFolding();
      this.boundMeshId = this.sheet.meshId;
      this.boundRootId = this.paperRoot.uuid;
      this.initStatus = 'ready';
      debugEvents.emit('sessionReset', {
        recipeId: this.progress.recipeId,
        generation: this.generation,
      });
    } catch (error) {
      this.initStatus = 'error';
      this.restartError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.inputSuspendedFlag = false;
    }
  }

  get sessionGeneration(): number {
    return this.generation;
  }

  get sessionId(): string {
    return `${this.animalId}-${this.generation}`;
  }

  get restartCount(): number {
    return this.restarts;
  }

  get paperMeshId(): string {
    return this.sheet.meshId;
  }

  get interactionRootId(): string {
    return this.paperRoot.uuid;
  }

  get foldTargetMeshId(): string {
    return this.boundMeshId;
  }

  get inputSuspended(): boolean {
    return this.inputSuspendedFlag;
  }

  get foldInitStatus(): string {
    return this.initStatus;
  }

  get lastRestartError(): string | null {
    return this.restartError;
  }

  get interactionZones(): string {
    const regions = this.engine.pendingMovingRegions().map((region) => region.id);
    const hold = this.engine.currentStep?.optionalHoldRegion?.id;
    return `${regions.join('+') || '—'}${hold ? ` hold:${hold}` : ''}`;
  }

  get inputSourceLabel(): string {
    if (this.xrSources.length === 0) {
      return 'none';
    }
    return this.xrSources.map((source) => source.handedness || 'controller').join(',');
  }

  get magneticSnapState(): string {
    if (this.engine.enginePhase === 'snapping') {
      return 'snapping';
    }
    if (this.engine.magneticArmed) {
      return 'armed';
    }
    return 'idle';
  }

  validateSession(): { ok: boolean; reason: string } {
    const issues: string[] = [];
    if (this.sheet.meshId !== this.boundMeshId) {
      issues.push('stale-mesh');
    }
    if (this.paperRoot.uuid !== this.boundRootId) {
      issues.push('stale-root');
    }
    if (this.scaleRoot.parent !== this.paperRoot) issues.push('scale-root');
    if (this.sheet.group.parent !== this.scaleRoot) issues.push('model');
    if (this.guides.group.parent !== this.paperRoot) issues.push('guides');
    if (this.overlay.group.parent !== this.paperRoot) issues.push('overlay');
    if (this.foldingPanel.group.parent !== this.paperRoot) issues.push('tracker');
    if (this.moveHandle.group.parent !== this.paperRoot) issues.push('handle');
    if (this.inputSuspendedFlag) {
      issues.push('suspended');
    }
    if (this.initStatus === 'error' || this.initStatus === 'resetting') {
      issues.push(this.initStatus);
    }
    if (!this.engine.currentStep && !this.engine.isComplete()) {
      issues.push('no-step');
    }
    if (this.engine.currentStep && !this.engine.isComplete() && this.engine.pendingMovingRegions().length === 0) {
      issues.push('no-targets');
    }
    return { ok: issues.length === 0, reason: issues.join(',') || 'ok' };
  }

  getPaperRoot(): Group {
    return this.paperRoot;
  }

  getOverlay(): GrabRegionOverlay {
    return this.overlay;
  }

  getMoveHandle(): MoveHandle {
    return this.moveHandle;
  }

  revealFolding(): void {
    this.toolbarOnly = false;
    this.scaleRoot.visible = true;
    this.paperRoot.visible = true;
    this.sheet.group.visible = true;
    this.guides.show();
    this.moveHandle.setVisible(true);
    this.foldingPanel.group.visible = true;
    this.creaseDebug.setVisible(this.debugVisible);
    this.overlay.setVisible(!this.engine.isComplete() && !this.creature.active);
    this.toolbar.setActionVisible('menu', true);
  }

  /** Gallery launch keeps the toolbar, including Exit, without the sheet. */
  showToolbarOnly(): void {
    this.toolbarOnly = true;
    this.scaleRoot.visible = false;
    this.overlay.setVisible(false);
    this.guides.hide();
    this.foldingPanel.group.visible = false;
    this.moveHandle.setVisible(false);
    this.creaseDebug.setVisible(false);
    this.paperRoot.visible = true;
  }

  hidePaperRoot(): void {
    this.toolbarOnly = false;
    this.scaleRoot.visible = true;
    this.paperRoot.visible = false;
    this.exitConfirm.setVisible(false);
  }

  setExitPrompt(open: boolean, notice = ''): void {
    this.exitPrompt = open;
    this.exitConfirm.setVisible(open, notice);
  }

  releaseForSessionExit(): void {
    this.exitPrompt = false;
    this.exitConfirm.setVisible(false);
    this.inputSuspendedFlag = false;
    if (this.engine.enginePhase === 'folding') {
      this.engine.cancelActive();
    }
    this.cutter.reset();
    this.owlPinch.reset();
    this.faceRevealMs = -1;
    this.faceCommit = false;
    this.owlOpenConsumed = false;
    this.whaleCreature.stop();
    this.foxCreature.stop();
    this.batCreature.stop();
    this.owlCreature.stop();
    this.manipulator.sleep();
  }

  setMenuVisible(visible: boolean): void {
    this.toolbar.setActionVisible('menu', visible);
  }

  isPaperSpawned(): boolean {
    return this.foldingSpawned;
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    this.creaseDebug.setVisible(visible);
    this.toolbar.setActive('debug', visible);
  }

  creaseAlignment(): {
    errorM: number;
    mismatch: boolean;
    warning: string | null;
    movingFaces: number;
    stationaryFaces: number;
    angleDeg: number;
    targetDeg: number;
    layerMode: string;
    layerCount: number;
    frontFaces: number;
    backFaces: number;
    groupFaces: number;
    ownership: string;
  } {
    const step = this.engine.currentStep;
    if (!step) {
      return {
        errorM: 0,
        mismatch: false,
        warning: null,
        movingFaces: 0,
        stationaryFaces: 0,
        angleDeg: 0,
        targetDeg: 0,
        layerMode: 'single',
        layerCount: 0,
        frontFaces: 0,
        backFaces: 0,
        groupFaces: 0,
        ownership: '—',
      };
    }
    const errorM = creaseAlignmentErrorM(step);
    const mismatch = errorM > CREASE_ALIGN_TOL_M;
    const from = this.engine.fromSnapshot;
    const debug = from ? foldAxisDebug(step, from, this.engine.angle) : null;
    const group = debug?.foldGroup;
    return {
      errorM,
      mismatch,
      warning: mismatch ? 'Fold axis mismatch detected.' : null,
      movingFaces: debug?.movingFaceIds.length ?? 0,
      stationaryFaces: debug?.stationaryFaceIds.length ?? 0,
      angleDeg: this.engine.angle,
      targetDeg: step.targetAngleDeg,
      layerMode: group?.mode ?? step.hinge.layerMode ?? 'single',
      layerCount: group?.layers.length ?? 0,
      frontFaces: group?.frontFaceIds.length ?? 0,
      backFaces: group?.backFaceIds.length ?? 0,
      groupFaces: group?.faceIds.length ?? 0,
      ownership: group ? layerOwnershipLabel(group) : '—',
    };
  }

  applyFoldVisuals(folding: boolean): void {
    this.sheet.apply(this.engine.currentStep, this.engine.fromSnapshot, this.engine.toSnapshot, this.engine.angle);
    this.guides.tick(0, this.guideState(folding));
    this.creaseDebug.setVisible(this.debugVisible);
    this.creaseDebug.update(
      this.engine.currentStep,
      this.engine.fromSnapshot,
      this.engine.angle,
      this.engine.guideSteps(),
    );
    this.overlay.setVisible(!this.engine.isComplete() && !this.creature.active);
    this.sheet.applyInspector(this.animalId === 'fox');
    this.syncFoxPresentation();
    this.syncBatPresentation();
    this.syncOwlPresentation();
  }

  commitProgress(): void {
    this.progress = this.engine.progress();
    this.syncStepVisuals();
  }

  startCreature(): void {
    this.guides.hide();
    this.creaseDebug.setVisible(false);
    this.overlay.setVisible(false);
    this.moveHandle.setVisible(true);
    this.paperRoot.getWorldPosition(_position);
    if (this.animalId === 'bat') {
      this.batCreature.start(_position.clone(), this.sheet.group);
    } else {
      this.creature.start(_position.clone(), this.sheet.group);
    }
    this.syncPanel();
  }

  getProgress(): ProgressModel {
    return this.progress;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  setInputSources(sources: XRInputSource[]): void {
    this.xrSources = sources;
    this.feedback.setInputSources(sources);
  }

  faceTracker(camera: PerspectiveCamera): void {
    this.camera = camera;
    camera.getWorldPosition(_position);
    this.foldingPanel.face(_position);
    this.foldingPanel.tick(1 / 72);
    this.exitConfirm.face(_position);
    this.cutter.sync(this.animalId === 'bat' ? this.engine.currentStep?.id ?? null : null);
    this.owlPinch.sync(this.animalId === 'owl' ? this.engine.currentStep?.id ?? null : null);
    if (!this.exitPrompt) {
      this.cutter.tick(1000 / 72);
      this.owlPinch.tick(1000 / 72);
      this.tickFaceReveal(1000 / 72);
    }
    this.guides.tick(1 / 72, this.guideState(this.engine.enginePhase === 'folding'));
    this.feedback.tick(1000 / 72);
    this.sheet.syncDepthDebug();
    this.manipulator.setAssembly(this.sheet.layerCount);
    if (!this.exitPrompt) {
      this.creature.setHeld(this.manipulator.blocksUi);
      this.creature.tick(1 / 72);
    }
    this.manipulator.face(_position);
    this.syncFoxPresentation();
    this.syncBatPresentation();
    this.syncOwlPresentation();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.feedback.dispose();
    this.foldingPanel.dispose();
    this.whaleCreature.stop();
    this.foxCreature.stop();
    this.batCreature.stop();
    this.owlCreature.stop();
    this.manipulator.dispose();
    disposeObject3D(this.studio);
    disposeObject3D(this.paperRoot);
    disposeObject3D(this.whaleCreature.group);
    disposeObject3D(this.foxCreature.group);
    disposeObject3D(this.batCreature.group);
    disposeObject3D(this.owlCreature.group);
    this.studio.removeFromParent();
    this.paperRoot.removeFromParent();
    this.whaleCreature.group.removeFromParent();
    this.foxCreature.group.removeFromParent();
    this.batCreature.group.removeFromParent();
    this.owlCreature.group.removeFromParent();
  }

  blocksGuidedTool(): boolean {
    const stepId = this.engine.currentStep?.id ?? null;
    if (this.animalId === 'owl' && (stepId === 'owl-decorate' || stepId === 'owl-center-open' || this.owlPinch.visualState === 'playing')) {
      return true;
    }
    const batStep = this.animalId === 'bat' ? stepId : null;
    return batStep === 'bat-notch' || batStep === 'bat-face' || this.cutter.blocksPaperFold;
  }

  consumeFaceCommit(): boolean {
    if (!this.faceCommit || this.engine.isBusy() || this.engine.currentStep?.id !== 'bat-face') {
      return false;
    }
    if (!this.engine.isStepCommitted('bat-head') || !this.engine.isStepCommitted('bat-notch')) {
      this.faceCommit = false;
      return false;
    }
    this.faceCommit = false;
    return true;
  }

  consumeOwlOpen(): boolean {
    if (this.animalId !== 'owl' || this.owlOpenConsumed || this.engine.isBusy()) {
      return false;
    }
    if (this.engine.currentStep?.id !== 'owl-center-open') {
      return false;
    }
    this.owlOpenConsumed = true;
    return true;
  }

  consumeOwlCommit(): boolean {
    if (this.animalId !== 'owl' || this.engine.isBusy() || this.engine.currentStep?.id !== 'owl-decorate') {
      return false;
    }
    return this.owlPinch.consumeCommit();
  }

  beginOwlLife(): boolean {
    return this.owlPinch.begin();
  }

  owlDebug(): { sides: string; decor: string } {
    const left = this.engine.isStepCommitted('owl-side-left')
      ? 'done'
      : this.engine.currentStep?.id === 'owl-side-left'
        ? 'folding'
        : 'waiting';
    const right = this.engine.isStepCommitted('owl-side-right')
      ? 'done'
      : this.engine.currentStep?.id === 'owl-side-right'
        ? 'folding'
        : 'waiting';
    return { sides: `L ${left}  R ${right}`, decor: this.owlPinch.visualState };
  }

  cutDebug(): { state: string; progress: string; done: string } {
    return {
      state: this.cutter.visualState,
      progress: `${Math.round(this.cutter.progress * 100)}%`,
      done: this.cutter.done ? 'yes' : 'no',
    };
  }

  batDebug(): { commits: string; valid: string; pivot: string } {
    const step = this.engine.currentStep;
    const pivot = step ? step.hinge.p0.map((n) => n.toFixed(3)).join(',') : '—';
    if (this.animalId !== 'bat') {
      return { commits: '—', valid: '—', pivot: '—' };
    }
    const snap = this.engine.fromSnapshot;
    const errors =
      snap && this.engine.isComplete()
        ? validateBatGeometry(snap, BAT_RECIPE.finalSilhouette ?? [])
        : null;
    return {
      commits: String(this.engine.commitEventCount),
      valid: errors == null ? 'in progress' : errors.length === 0 ? 'ok' : errors.join('; '),
      pivot,
    };
  }

  prepareBatStep(stage: number): number {
    const target = Math.min(7, Math.max(1, Math.round(stage)));
    return this.replayBatUntil((_id, progress) => progress >= target);
  }

  prepareBatCut(): number {
    return this.replayBatUntil((id) => id === 'bat-notch');
  }

  prepareOwlStep(stage: number): number {
    const target = Math.min(5, Math.max(1, Math.round(stage)));
    this.owlPinch.reset();
    this.owlOpenConsumed = false;
    this.owlCreature.stop();
    this.engine.reset(OWL_RECIPE, OWL_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 12
    ) {
      this.engine.assistToTarget();
      for (let frame = 0; frame < 40 && this.engine.isAnimating(); frame += 1) {
        this.engine.tick(32);
      }
      this.commitProgress();
      committed += 1;
    }
    this.applyFoldVisuals(false);
    this.commitProgress();
    return committed;
  }

  private replayBatUntil(done: (stepId: string, stage: number) => boolean): number {
    this.cutter.reset();
    this.faceRevealMs = -1;
    this.faceCommit = false;
    this.batCreature.stop();
    this.engine.reset(BAT_RECIPE, BAT_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      !done(this.engine.currentStep.id, this.engine.currentStep.progressStage ?? 1) &&
      committed < 12
    ) {
      this.engine.assistToTarget();
      for (let frame = 0; frame < 40 && this.engine.isAnimating(); frame += 1) {
        this.engine.tick(32);
      }
      this.commitProgress();
      committed += 1;
    }
    this.applyFoldVisuals(false);
    this.commitProgress();
    return committed;
  }

  private tickFaceReveal(dtMs: number): void {
    const active = this.animalId === 'bat' && this.engine.currentStep?.id === 'bat-face' && !this.engine.isComplete();
    if (!active) {
      this.faceRevealMs = -1;
      if (!this.batCreature.active) {
        this.batCreature.setReveal(1);
      }
      return;
    }
    if (this.faceRevealMs < 0) {
      this.faceRevealMs = 0;
    }
    this.faceRevealMs += dtMs;
    const shown = Math.min(1, this.faceRevealMs / 720);
    this.batCreature.setReveal(shown);
    if (
      shown >= 1 &&
      this.engine.isStepCommitted('bat-head') &&
      this.engine.isStepCommitted('bat-notch')
    ) {
      this.faceCommit = true;
    }
  }

  private syncOwlPresentation(): void {
    if (this.animalId !== 'owl') {
      if (!this.owlCreature.active) {
        this.owlCreature.present(this.sheet.group, false);
      }
      return;
    }
    const showing =
      this.owlPinch.visualState === 'playing' ||
      this.owlPinch.visualState === 'done' ||
      this.engine.isComplete() ||
      this.owlCreature.active;
    this.owlCreature.present(this.sheet.group, showing);
    if (!this.owlCreature.active) {
      this.owlCreature.setReveal(this.owlPinch.progress);
    }
  }

  private syncBatPresentation(): void {
    if (this.animalId !== 'bat') {
      if (!this.batCreature.active) {
        this.batCreature.presentFace(this.sheet.group, false);
      }
      return;
    }
    const facing = this.engine.isStepCommitted('bat-face') || this.engine.isComplete() || this.engine.currentStep?.id === 'bat-face';
    this.batCreature.presentFace(this.sheet.group, facing);
  }

  private syncFoxPresentation(): void {
    const sheet = this.sheet.group;
    if (this.animalId !== 'fox') {
      this.foxShape.setVisible(false);
      this.sheet.applyInspector(false);
      return;
    }
    const turning = this.engine.currentStep?.id === 'complete-fox';
    const turned = this.engine.isStepCommitted('complete-fox') || this.engine.isComplete();
    const turn = turning ? Math.min(1, Math.max(0, this.engine.angle / 180)) : turned ? 1 : 0;
    sheet.rotation.y = Math.PI * turn;
    this.foxCreature.presentFace(sheet, turn > 0.82);
    this.sheet.applyInspector(true);
    const earsFolded =
      this.engine.isStepCommitted('fox-ear-left') && this.engine.isStepCommitted('fox-ear-right');
    const snapshot = this.engine.fromSnapshot;
    this.foxShape.setVisible(this.debugVisible && FOX_SHAPE_INSPECTOR.enabled);
    if (this.foxShape.group.visible && snapshot) {
      const step = this.engine.currentStep;
      const debug = step ? foldAxisDebug(step, snapshot, this.engine.angle) : null;
      this.foxShape.update(snapshot, turn, earsFolded || turned, debug);
    }
  }

  private guideState(folding: boolean) {
    return {
      folding: folding || this.engine.enginePhase === 'folding',
      snapping: this.engine.enginePhase === 'snapping',
      complete: this.engine.isComplete(),
      activeStepId: this.engine.currentStep?.id ?? null,
    };
  }

  private syncStepVisuals(): void {
    const step = this.engine.currentStep;
    const from = this.engine.fromSnapshot;
    if (from) {
      this.sheet.setSnapshot(from);
    }
    this.guides.setStep(step, this.engine.toSnapshot, this.engine.guideSteps(), this.engine.completedStepIds());
    this.guides.setLockedCreases(this.engine.lockedCreases);
    this.creaseDebug.update(step, from, this.engine.angle, this.engine.guideSteps());
    const pending = this.engine.pendingParallelSteps();
    this.overlay.setRegions(step?.movingRegion, step?.optionalHoldRegion, pending.map((entry) => entry.movingRegion));
    this.syncPanel();
  }

  panelDebug() {
    return this.foldingPanel.debug();
  }

  private syncPanel(): void {
    const step = this.engine.currentStep;
    if (step) {
      this.lastStepId = step.id;
      this.lastTitle = step.title;
      this.lastBody = step.instruction;
    }
    const completed = !this.restartError && (this.engine.canStartCreature() || this.creature.active);
    if (this.toolbarOnly) {
      this.foldingPanel.group.visible = false;
    }
    this.foldingPanel.setContent({
      recipeId: this.progress.recipeId,
      stepId: completed ? 'complete' : this.lastStepId,
      title: completed ? COPY.completion.heading : this.lastTitle,
      body: completed ? completionBodyFor(this.animalId) : this.lastBody,
      committed: this.progress.committedCount,
      activeIndex: this.progress.activeIndex,
      total: this.progress.totalSteps,
      completed,
      error: this.restartError,
    });
  }

  private placePreview(): void {
    this.paperRoot.position.set(0.34, 1.2, -0.42);
    this.paperRoot.rotation.set((-18 * Math.PI) / 180, 0, 0);
    this.frozen = false;
  }

  private createBackdrop(): Group {
    const group = new Group();
    const table = new Mesh(
      new PlaneGeometry(1.4, 1.4),
      new MeshStandardMaterial({
        color: new Color(theme.colors.surfaceWarm),
        roughness: 1,
        metalness: 0,
      }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = 0.92;
    group.add(table);
    return group;
  }
}
