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
import { DinosaurCreature } from '../animation/DinosaurCreature.ts';
import { LadybugCreature } from '../animation/LadybugCreature.ts';
import { PenguinCreature } from '../animation/PenguinCreature.ts';
import { OwlCreature } from '../animation/OwlCreature.ts';
import { TurtleCreature } from '../animation/TurtleCreature.ts';
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
import { FOLD_PAPER_COLOR, FoldPaper, paperFlipYawRad } from './FoldPaper.ts';
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
import { foldAxisDebug, hingeFoldTravelM, type FoldAxisDebug } from './MeshSplitter.ts';
import { FOX_SHAPE_INSPECTOR } from './foxFinalShape.ts';
import { validateBatGeometry } from './batFinalShape.ts';
import { BAT_NAMED, BAT_PAPER_COLOR, BAT_RECIPE } from './recipes/bat.recipe.ts';
import { DINOSAUR_NAMED, DINOSAUR_PAPER_COLOR, DINOSAUR_RECIPE } from './recipes/dinosaur.recipe.ts';
import { DinosaurPinch } from './DinosaurPinch.ts';
import { LadybugPinch } from './LadybugPinch.ts';
import { LadybugTipTarget } from './LadybugTipTarget.ts';
import { landmarkAfterHinge } from './CreaseSolver.ts';
import { PenguinPinch } from './PenguinPinch.ts';
import { OwlPinch } from './OwlPinch.ts';
import { TurtlePinch } from './TurtlePinch.ts';
import { ScissorsCut } from './ScissorsCut.ts';
import { FOX_NAMED, FOX_PAPER_COLOR, FOX_RECIPE } from './recipes/fox.recipe.ts';
import { OWL_NAMED, OWL_PAPER_COLOR, OWL_RECIPE } from './recipes/owl.recipe.ts';
import { LADYBUG_NAMED, LADYBUG_PAPER_COLOR, LADYBUG_RECIPE } from './recipes/ladybug.recipe.ts';
import { PENGUIN_NAMED, PENGUIN_PAPER_COLOR, PENGUIN_RECIPE } from './recipes/penguin.recipe.ts';
import { TURTLE_NAMED, TURTLE_PAPER_COLOR, TURTLE_RECIPE } from './recipes/turtle.recipe.ts';
import { theme } from '../theme/tokens.ts';
import { WHALE_NAMED, WHALE_RECIPE } from './recipes/whale.recipe.ts';

const _position = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();
const _quat = new Quaternion();

function vec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

export interface PenguinWingDebug {
  stepId: string;
  region: string;
  faceIds: string;
  hinge: string;
  pivot: string;
  angleDeg: number;
  targetDeg: number;
  travelM: number;
  snap: string;
  committed: 'Yes' | 'No';
  verified: 'Yes' | 'No';
  mesh: string;
  visibility: string;
}

function pointInPoly(points: Vec3[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    if (!current || !prior) {
      continue;
    }
    const crosses =
      current[1] > y !== prior[1] > y &&
      x < ((prior[0] - current[0]) * (y - current[1])) / (prior[1] - current[1] + 1e-12) + current[0];
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/** Paper materials are double sided, so a back-facing wing is still drawn. */
function wingVisibility(debug: FoldAxisDebug): string {
  const moving = debug.snapshot.faces.filter((face) => debug.movingFaceIds.includes(face.id));
  if (moving.length === 0) {
    return 'cull off | hidden yes | backface no | occluded no';
  }
  let area = 0;
  let back = 0;
  let covered = 0;
  for (const face of moving) {
    const points = face.vertices.flatMap((index) => {
      const point = debug.snapshot.vertices[index];
      return point ? [point] : [];
    });
    if (points.length < 3) {
      continue;
    }
    const a = points[0];
    const b = points[1];
    const c = points[2];
    if (!a || !b || !c) {
      continue;
    }
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    area += Math.abs(nz) * 0.5;
    if (nz < 0) {
      back += 1;
    }
    const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const blocked = debug.snapshot.faces.some((other) => {
      if (other.id === face.id || other.layer <= face.layer) {
        return false;
      }
      const poly = other.vertices.flatMap((index) => {
        const point = debug.snapshot.vertices[index];
        return point ? [point] : [];
      });
      return poly.length >= 3 && pointInPoly(poly, cx, cy);
    });
    if (blocked) {
      covered += 1;
    }
  }
  const hidden = area < 1e-4;
  const backface = back * 2 >= moving.length;
  const occluded = covered * 2 >= moving.length;
  return `cull off | hidden ${hidden ? 'yes' : 'no'} | backface ${backface ? 'yes' : 'no'} | occluded ${occluded ? 'yes' : 'no'}`;
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
  private lastPenguinFlapLog = '';
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
  readonly turtleCreature = new TurtleCreature();
  readonly dinosaurCreature = new DinosaurCreature();
  readonly ladybugCreature = new LadybugCreature();
  readonly penguinCreature = new PenguinCreature();
  readonly cutter = new ScissorsCut();
  readonly owlPinch = new OwlPinch();
  readonly turtlePinch = new TurtlePinch();
  readonly dinosaurPinch = new DinosaurPinch();
  readonly ladybugPinch = new LadybugPinch();
  readonly ladybugTip = new LadybugTipTarget();
  readonly penguinPinch = new PenguinPinch();
  private faceRevealMs = -1;
  private faceCommit = false;
  private owlOpenStepId: string | null = null;
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

  get creature(): WhaleCreature | FoxCreature | BatCreature | OwlCreature | TurtleCreature | DinosaurCreature | LadybugCreature | PenguinCreature {
    if (this.animalId === 'fox') {
      return this.foxCreature;
    }
    if (this.animalId === 'bat') {
      return this.batCreature;
    }
    if (this.animalId === 'owl') {
      return this.owlCreature;
    }
    if (this.animalId === 'turtle') {
      return this.turtleCreature;
    }
    if (this.animalId === 'dinosaur') {
      return this.dinosaurCreature;
    }
    if (this.animalId === 'ladybug') {
      return this.ladybugCreature;
    }
    if (this.animalId === 'penguin') {
      return this.penguinCreature;
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
    this.turtlePinch.attach(this.sheet.group);
    this.dinosaurPinch.attach(this.sheet.group);
    this.ladybugPinch.attach(this.sheet.group);
    this.ladybugTip.attach(this.sheet.group);
    this.penguinPinch.attach(this.sheet.group);
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
    world.scene.add(this.turtleCreature.group);
    world.scene.add(this.dinosaurCreature.group);
    world.scene.add(this.ladybugCreature.group);
    world.scene.add(this.penguinCreature.group);

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
    this.turtleCreature.stop();
    this.dinosaurCreature.stop();
    this.ladybugCreature.stop();
    this.penguinCreature.stop();
    this.cutter.reset();
    this.owlPinch.reset();
    this.turtlePinch.reset();
    this.dinosaurPinch.reset();
    this.ladybugPinch.reset();
    this.ladybugTip.reset();
    this.penguinPinch.reset();
    this.faceRevealMs = -1;
    this.faceCommit = false;
    this.owlOpenStepId = null;
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
    } else if (id === 'turtle') {
      this.engine.reset(TURTLE_RECIPE, TURTLE_NAMED);
      this.sheet.setColor(TURTLE_PAPER_COLOR);
    } else if (id === 'dinosaur') {
      this.engine.reset(DINOSAUR_RECIPE, DINOSAUR_NAMED);
      this.sheet.setColor(DINOSAUR_PAPER_COLOR);
    } else if (id === 'ladybug') {
      this.engine.reset(LADYBUG_RECIPE, LADYBUG_NAMED);
      this.sheet.setColor(LADYBUG_PAPER_COLOR);
    } else if (id === 'penguin') {
      this.engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
      this.sheet.setColor(PENGUIN_PAPER_COLOR);
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
    this.turtlePinch.reset();
    this.dinosaurPinch.reset();
    this.ladybugPinch.reset();
    this.ladybugTip.reset();
    this.penguinPinch.reset();
    this.faceRevealMs = -1;
    this.faceCommit = false;
    this.owlOpenStepId = null;
    this.whaleCreature.stop();
    this.foxCreature.stop();
    this.batCreature.stop();
    this.owlCreature.stop();
    this.turtleCreature.stop();
    this.dinosaurCreature.stop();
    this.ladybugCreature.stop();
    this.penguinCreature.stop();
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
    this.syncPaperFlip();
    this.sheet.apply(this.engine.currentStep, this.engine.fromSnapshot, this.engine.toSnapshot, this.engine.angle);
    this.guides.tick(0, this.guideState(folding));
    this.syncLadybugTip();
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
    this.syncTurtlePresentation();
    this.syncDinosaurPresentation();
    this.syncLadybugPresentation();
    this.syncPenguinPresentation();
    this.notePenguinFlaps();
  }

  /** Temporary comparison of the two penguin side flaps while that step is open. */
  private notePenguinFlaps(): void {
    const step = this.engine.currentStep;
    if (this.animalId !== 'penguin' || step?.parallelGroup !== 'penguin-flaps') {
      this.lastPenguinFlapLog = '';
      return;
    }
    const from = this.engine.fromSnapshot;
    if (!from) {
      return;
    }
    const bucket = Math.round(this.engine.foldCompletion * 4);
    const key = `${step.id}|${this.engine.enginePhase}|${bucket}`;
    if (key === this.lastPenguinFlapLog) {
      return;
    }
    this.lastPenguinFlapLog = key;
    const lines = this.engine.guideSteps().map((sibling) => {
      const active = sibling.id === step.id;
      const debug = foldAxisDebug(sibling, from, active ? this.engine.angle : sibling.startAngleDeg);
      const originals = [...new Set(debug.movingFaceIds.map((id) => id.split(':')[0] ?? id))];
      const layers = [...new Set(debug.foldGroup.ownership.map((entry) => entry.layer))];
      const point = (value: readonly number[]) => value.map((coord) => coord.toFixed(3)).join(',');
      const progress = active ? Math.round(this.engine.foldCompletion * 100) : 0;
      const snap = this.engine.isStepCommitted(sibling.id) ? 'committed' : this.engine.enginePhase;
      return [
        sibling.id,
        `hinge ${point(sibling.hinge.p0)} -> ${point(sibling.hinge.p1)}`,
        `faces ${originals.join(',') || 'none'}`,
        `layers ${layers.join(',') || 'none'}`,
        `angle ${active ? this.engine.angle.toFixed(0) : '0'}/${sibling.targetAngleDeg}`,
        `dir ${sibling.direction}`,
        `progress ${progress}%`,
        `snap ${snap}`,
        `movingVerts ${debug.movingVertexIds.length}`,
      ].join(' | ');
    });
    const wing = this.penguinWingDebug();
    if (wing) {
      lines.push(
        [
          'right-wing',
          `region ${wing.region}`,
          `step ${wing.stepId}`,
          `faces ${wing.faceIds}`,
          `hinge ${wing.hinge}`,
          `pivot ${wing.pivot}`,
          `angle ${wing.angleDeg.toFixed(0)}/${wing.targetDeg}`,
          `mesh ${wing.mesh}`,
          `snap ${wing.snap}`,
          `committed ${wing.committed}`,
          `verified ${wing.verified}`,
          wing.visibility,
        ].join(' | '),
      );
    }
    console.info(`[penguin-flap]\n${lines.join('\n')}`);
  }

  penguinWingDebug(): PenguinWingDebug | null {
    if (this.animalId !== 'penguin') {
      return null;
    }
    const step = this.engine.currentStep;
    if (!step || (step.parallelGroup !== 'penguin-flaps' && step.parallelGroup !== 'penguin-wings')) {
      return null;
    }
    const right = this.engine.guideSteps().find((item) => item.id.endsWith('-right'));
    const from = this.engine.fromSnapshot;
    if (!right || !from) {
      return null;
    }
    const active = step.id === right.id;
    const angle = active ? this.engine.angle : right.startAngleDeg;
    const debug = foldAxisDebug(right, from, angle);
    const travel = hingeFoldTravelM(right, from, right.targetAngleDeg);
    const originals = [...new Set(debug.movingFaceIds.map((id) => id.split(':')[0] ?? id))];
    const point = (value: readonly number[]) => value.map((coord) => coord.toFixed(3)).join(',');
    const committed = this.engine.isStepCommitted(right.id);
    return {
      stepId: right.id,
      region: step.movingRegion.id,
      faceIds: originals.join(',') || 'none',
      hinge: `${point(right.hinge.p0)} -> ${point(right.hinge.p1)}`,
      pivot: point(right.hinge.p0),
      angleDeg: active ? this.engine.angle : committed ? right.targetAngleDeg : right.startAngleDeg,
      targetDeg: right.targetAngleDeg,
      travelM: travel,
      snap: committed ? 'committed' : this.engine.enginePhase,
      committed: committed ? 'Yes' : 'No',
      verified: this.engine.isGeometryVerified(right.id) ? 'Yes' : 'No',
      mesh: `travel ${travel.toFixed(3)}m verts ${debug.movingVertexIds.length} faces ${debug.movingFaceIds.length}`,
      visibility: wingVisibility(debug),
    };
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
    this.turtlePinch.sync(this.animalId === 'turtle' ? this.engine.currentStep?.id ?? null : null);
    this.dinosaurPinch.sync(this.animalId === 'dinosaur' ? this.engine.currentStep?.id ?? null : null);
    this.ladybugPinch.sync(this.animalId === 'ladybug' ? this.engine.currentStep?.id ?? null : null);
    this.penguinPinch.sync(this.animalId === 'penguin' ? this.engine.currentStep?.id ?? null : null);
    if (!this.exitPrompt) {
      this.cutter.tick(1000 / 72);
      this.owlPinch.tick(1000 / 72);
      this.turtlePinch.tick(1000 / 72);
      this.dinosaurPinch.tick(1000 / 72);
      this.ladybugPinch.tick(1000 / 72);
      this.penguinPinch.tick(1000 / 72);
      this.tickFaceReveal(1000 / 72);
    }
    this.guides.tick(1 / 72, this.guideState(this.engine.enginePhase === 'folding'));
    this.syncLadybugTip();
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
    this.syncTurtlePresentation();
    this.syncDinosaurPresentation();
    this.syncLadybugPresentation();
    this.syncPenguinPresentation();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.feedback.dispose();
    this.foldingPanel.dispose();
    this.whaleCreature.stop();
    this.foxCreature.stop();
    this.batCreature.stop();
    this.owlCreature.stop();
    this.turtleCreature.stop();
    this.dinosaurCreature.stop();
    this.ladybugCreature.stop();
    this.penguinCreature.stop();
    this.manipulator.dispose();
    disposeObject3D(this.studio);
    disposeObject3D(this.paperRoot);
    disposeObject3D(this.whaleCreature.group);
    disposeObject3D(this.foxCreature.group);
    disposeObject3D(this.batCreature.group);
    disposeObject3D(this.owlCreature.group);
    disposeObject3D(this.turtleCreature.group);
    disposeObject3D(this.dinosaurCreature.group);
    disposeObject3D(this.ladybugCreature.group);
    disposeObject3D(this.penguinCreature.group);
    this.studio.removeFromParent();
    this.paperRoot.removeFromParent();
    this.whaleCreature.group.removeFromParent();
    this.foxCreature.group.removeFromParent();
    this.batCreature.group.removeFromParent();
    this.owlCreature.group.removeFromParent();
    this.turtleCreature.group.removeFromParent();
    this.dinosaurCreature.group.removeFromParent();
    this.ladybugCreature.group.removeFromParent();
    this.penguinCreature.group.removeFromParent();
  }

  blocksGuidedTool(): boolean {
    const stepId = this.engine.currentStep?.id ?? null;
    if (this.animalId === 'owl' && (stepId === 'owl-decorate' || stepId?.endsWith('-open') || this.owlPinch.visualState === 'playing')) {
      return true;
    }
    if (
      this.animalId === 'turtle' &&
      (stepId === 'turtle-decorate' || stepId?.endsWith('-open') || this.turtlePinch.visualState === 'playing')
    ) {
      return true;
    }
    if (
      this.animalId === 'dinosaur' &&
      (stepId === 'dino-decorate' || stepId?.endsWith('-open') || this.dinosaurPinch.visualState === 'playing')
    ) {
      return true;
    }
    if (
      this.animalId === 'ladybug' &&
      (stepId === 'ladybug-decorate' || stepId?.endsWith('-open') || this.ladybugPinch.visualState === 'playing')
    ) {
      return true;
    }
    if (
      this.animalId === 'penguin' &&
      (stepId === 'penguin-decorate' || stepId?.endsWith('-open') || this.penguinPinch.visualState === 'playing')
    ) {
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
    const id = this.engine.currentStep?.id ?? null;
    if (
      (this.animalId !== 'owl' &&
        this.animalId !== 'turtle' &&
        this.animalId !== 'dinosaur' &&
        this.animalId !== 'ladybug' &&
        this.animalId !== 'penguin') ||
      this.engine.isBusy() ||
      !id?.endsWith('-open')
    ) {
      return false;
    }
    if (this.owlOpenStepId === id) {
      return false;
    }
    this.owlOpenStepId = id;
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

  consumeTurtleCommit(): boolean {
    if (this.animalId !== 'turtle' || this.engine.isBusy() || this.engine.currentStep?.id !== 'turtle-decorate') {
      return false;
    }
    return this.turtlePinch.consumeCommit();
  }

  beginTurtleLife(): boolean {
    return this.turtlePinch.begin();
  }

  consumeDinosaurCommit(): boolean {
    if (this.animalId !== 'dinosaur' || this.engine.isBusy() || this.engine.currentStep?.id !== 'dino-decorate') {
      return false;
    }
    return this.dinosaurPinch.consumeCommit();
  }

  beginDinosaurLife(): boolean {
    return this.dinosaurPinch.begin();
  }

  consumeLadybugCommit(): boolean {
    if (this.animalId !== 'ladybug' || this.engine.isBusy() || this.engine.currentStep?.id !== 'ladybug-decorate') {
      return false;
    }
    return this.ladybugPinch.consumeCommit();
  }

  beginLadybugLife(): boolean {
    return this.ladybugPinch.begin();
  }

  consumePenguinCommit(): boolean {
    if (this.animalId !== 'penguin' || this.engine.isBusy() || this.engine.currentStep?.id !== 'penguin-decorate') {
      return false;
    }
    return this.penguinPinch.consumeCommit();
  }

  beginPenguinLife(): boolean {
    return this.penguinPinch.begin();
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
    const target = Math.min(7, Math.max(1, Math.round(stage)));
    this.owlPinch.reset();
    this.owlOpenStepId = null;
    this.owlCreature.stop();
    this.engine.reset(OWL_RECIPE, OWL_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 16
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

  prepareTurtleStep(stage: number): number {
    const target = Math.min(5, Math.max(1, Math.round(stage)));
    this.turtlePinch.reset();
    this.owlOpenStepId = null;
    this.turtleCreature.stop();
    this.engine.reset(TURTLE_RECIPE, TURTLE_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 16
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

  prepareDinosaurStep(stage: number): number {
    const target = Math.min(9, Math.max(1, Math.round(stage)));
    this.dinosaurPinch.reset();
    this.owlOpenStepId = null;
    this.dinosaurCreature.stop();
    this.engine.reset(DINOSAUR_RECIPE, DINOSAUR_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 16
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

  prepareLadybugStep(stage: number): number {
    const target = Math.min(7, Math.max(1, Math.round(stage)));
    this.ladybugPinch.reset();
    this.ladybugTip.reset();
    this.owlOpenStepId = null;
    this.ladybugCreature.stop();
    this.engine.reset(LADYBUG_RECIPE, LADYBUG_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 16
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

  preparePenguinStep(stage: number): number {
    const target = Math.min(9, Math.max(1, Math.round(stage)));
    this.penguinPinch.reset();
    this.owlOpenStepId = null;
    this.penguinCreature.stop();
    this.engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
    let committed = 0;
    while (
      this.engine.currentStep &&
      (this.engine.currentStep.progressStage ?? 1) < target &&
      committed < 24
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

  private syncTurtlePresentation(): void {
    if (this.animalId !== 'turtle') {
      if (!this.turtleCreature.active) {
        this.turtleCreature.present(this.sheet.group, false);
      }
      return;
    }
    const showing =
      this.turtlePinch.visualState === 'playing' ||
      this.turtlePinch.visualState === 'done' ||
      this.engine.isComplete() ||
      this.turtleCreature.active;
    this.turtleCreature.present(this.sheet.group, showing);
    if (!this.turtleCreature.active) {
      this.turtleCreature.setReveal(this.turtlePinch.progress);
    }
  }

  private syncLadybugPresentation(): void {
    if (this.animalId !== 'ladybug') {
      if (!this.ladybugCreature.active) {
        this.ladybugCreature.present(this.sheet.group, false);
      }
      return;
    }
    const showing =
      this.ladybugPinch.visualState === 'playing' ||
      this.ladybugPinch.visualState === 'done' ||
      this.engine.isComplete() ||
      this.ladybugCreature.active;
    this.ladybugCreature.present(this.sheet.group, showing);
    if (!this.ladybugCreature.active) {
      this.ladybugCreature.setReveal(this.ladybugPinch.progress);
    }
  }

  private syncPenguinPresentation(): void {
    if (this.animalId !== 'penguin') {
      if (!this.penguinCreature.active) {
        this.penguinCreature.present(this.sheet.group, false);
      }
      return;
    }
    const showing =
      this.penguinPinch.visualState === 'playing' ||
      this.penguinPinch.visualState === 'done' ||
      this.engine.isComplete() ||
      this.penguinCreature.active;
    this.penguinCreature.present(this.sheet.group, showing);
    if (!this.penguinCreature.active) {
      this.penguinCreature.setReveal(this.penguinPinch.progress);
    }
  }

  private syncDinosaurPresentation(): void {
    if (this.animalId !== 'dinosaur') {
      if (!this.dinosaurCreature.active) {
        this.dinosaurCreature.present(this.sheet.group, false);
      }
      return;
    }
    const showing =
      this.dinosaurPinch.visualState === 'playing' ||
      this.dinosaurPinch.visualState === 'done' ||
      this.engine.isComplete() ||
      this.dinosaurCreature.active;
    this.dinosaurCreature.present(this.sheet.group, showing);
    if (!this.dinosaurCreature.active) {
      this.dinosaurCreature.setReveal(this.dinosaurPinch.progress);
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

  private syncLadybugTip(): void {
    const step = this.animalId === 'ladybug' ? this.engine.currentStep : null;
    const rest = this.engine.fromSnapshot?.named?.T ?? null;
    let tip = rest;
    if (step?.id === 'ladybug-tip' && rest && step.hinge) {
      tip = landmarkAfterHinge(rest, step.hinge, this.engine.angle, step.direction);
    }
    this.ladybugTip.sync(step?.id ?? null, tip);
    this.ladybugTip.observe({
      stepId: step?.id ?? null,
      angleDeg: step ? this.engine.angle : 0,
      progress: step ? this.engine.foldCompletion : 0,
      phase: this.engine.enginePhase,
      tipCommitted: this.engine.isStepCommitted('ladybug-tip'),
      hinge: step?.id === 'ladybug-tip' ? step.hinge : null,
    });
    this.guides.setGuideRaycastEnabled(step?.id !== 'ladybug-tip');
  }

  /** Spin the whole sheet around its vertical axis. Fold meshes stay in paper-local space. */
  private syncPaperFlip(): void {
    const step = this.engine.currentStep;
    this.sheet.group.rotation.y = step?.meshStrategy === 'turn' ? paperFlipYawRad(this.engine.angle) : 0;
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
    this.syncLadybugTip();
    this.creaseDebug.update(step, from, this.engine.angle, this.engine.guideSteps());
    const pending = this.engine.pendingParallelSteps();
    const flipping = step?.meshStrategy === 'turn';
    this.overlay.setRegions(
      flipping ? undefined : step?.movingRegion,
      flipping ? undefined : step?.optionalHoldRegion,
      flipping ? [] : pending.map((entry) => entry.movingRegion),
    );
    this.syncPaperFlip();
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
