import { easeOutCubic, lerp } from '../utils/math.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { arrowAdjustedAngle, grabAdjustedAngle } from './CreaseSolver.ts';
import {
  applyFoldAssist,
  fartherAlong,
  FOLD_ASSIST,
  foldProgress,
  passedAutoSnap,
  snapDurationMs,
} from './foldAssist.ts';
import {
  DEFAULT_CREASE_PRESS_HOLD_MS,
  DEFAULT_SILHOUETTE_TOLERANCE_M,
  silhouetteErrorM,
  validateFold,
  type FoldValidation,
} from './FoldValidator.ts';
import { foldFeedbackBus, type FoldFeedbackPayload } from '../feedback/foldFeedback.ts';
import { hitMovingRegion } from '../input/GrabRegionMath.ts';
import { stepCreaseLine } from './creaseMath.ts';
import { applyHingeSnapshot, foldAxisDebug, usesAxisAngleFold } from './MeshSplitter.ts';
import { originalFaceId } from './foldLayerGroup.ts';
import { assertRecipe } from './RecipeValidator.ts';
import { PAPER_SIZE_M } from './placement.ts';
import { progressFromRecipe, type ProgressModel } from './progressModel.ts';
import {
  interpolatesMesh,
  stepActionType,
  type FoldStep,
  type GrabRegion,
  type MeshSnapshot,
  type OrigamiRecipe,
  type RecipeCrease,
  type Vec3,
} from './types.ts';

export type EnginePhase = 'idle' | 'folding' | 'snapping' | 'returning' | 'locked';
export type ParallelFoldState = 'pending' | 'active' | 'folding' | 'snapping' | 'completed';

export type FoxEarFoldState = {
  left: 'pending' | 'folding' | 'snapping' | 'completed';
  right: 'pending' | 'folding' | 'snapping' | 'completed';
};

export interface FoxEarDebug {
  state: FoxEarFoldState;
  leftCreaseId: string;
  rightCreaseId: string;
  activeFoldId: string;
  rightFaces: string;
  rightAxis: string;
  rightPivot: string;
  angleDeg: number;
  targetDeg: number;
  progress: number;
  snap: string;
}

export interface ParallelFoldDebug {
  stepId: string;
  state: ParallelFoldState;
  angleDeg: number;
  crease: [Vec3, Vec3];
  visible: boolean;
}

const RETURN_MS = 320;

function formatPoint(point: Vec3): string {
  return point.map((value) => value.toFixed(3)).join(',');
}

export class OrigamiEngine {
  private recipe: OrigamiRecipe;
  private initialVertices: Record<string, Vec3>;
  private vertices: Record<string, Vec3>;
  private stepIndex = 0;
  private committed = 0;
  private angleDeg = 0;
  private grabLocal: Vec3 | null = null;
  private lastValidation: FoldValidation | null = null;
  private phase: EnginePhase = 'idle';
  private animFrom = 0;
  private animTo = 0;
  private animElapsed = 0;
  private animDuration = snapDurationMs();
  private assistUsed = false;
  private holdMs = 0;
  private lockedCreaseIds = new Set<string>();
  private silhouettePassed = true;
  private commitEvents = 0;
  private foldT = 0;
  private lastFoldT = 0;
  private lastRawT = 0;
  private snapStableMs = 0;
  private snapArmed = false;
  private committedStepIds = new Set<string>();
  private liveSnapshot: MeshSnapshot | null = null;

  constructor(recipe: OrigamiRecipe, vertices: Record<string, Vec3>) {
    assertRecipe(recipe);
    this.recipe = recipe;
    this.initialVertices = { ...vertices };
    this.vertices = { ...vertices };
  }

  get fromSnapshot(): MeshSnapshot | null {
    if (this.isComplete()) {
      return this.finalSnapshot();
    }
    if (this.liveSnapshot) {
      return this.liveSnapshot;
    }
    const id = this.currentStep?.fromSnapshotId;
    return id ? (this.recipe.snapshots[id] ?? null) : null;
  }

  get toSnapshot(): MeshSnapshot | null {
    if (this.isComplete()) {
      return this.finalSnapshot();
    }
    const step = this.currentStep;
    const from = this.fromSnapshot;
    if (step && this.usesLiveParallelSnapshot() && from && usesAxisAngleFold(step)) {
      const hint = step.targetLandmarks[0]?.sourceVertexId
        ? from.named?.[step.targetLandmarks[0].sourceVertexId]
        : undefined;
      return applyHingeSnapshot(from, step.hinge, step.direction, step.targetAngleDeg, hint);
    }
    const id = step?.toSnapshotId;
    return id ? (this.recipe.snapshots[id] ?? null) : null;
  }

  private finalSnapshot(): MeshSnapshot | null {
    const last = this.recipe.steps.at(-1);
    return last ? (this.recipe.snapshots[last.toSnapshotId] ?? null) : null;
  }

  get currentStep(): FoldStep | null {
    return this.recipe.steps[this.stepIndex] ?? null;
  }

  get recipeId(): string {
    return this.recipe.id;
  }

  get angle(): number {
    return this.angleDeg;
  }

  get creaseHoldMs(): number {
    return this.holdMs;
  }

  get enginePhase(): EnginePhase {
    return this.phase;
  }

  get validation(): FoldValidation | null {
    return this.lastValidation;
  }

  get usedAssist(): boolean {
    return this.assistUsed;
  }

  get foldCompletion(): number {
    return this.foldT;
  }

  get magneticArmed(): boolean {
    return this.snapArmed;
  }

  get lockedCreases(): RecipeCrease[] {
    const hide = new Set(this.parallelGroupSteps().flatMap((step) => step.lockCreaseIds ?? []));
    return (this.recipe.creases ?? []).filter(
      (crease) => this.lockedCreaseIds.has(crease.id) && !hide.has(crease.id),
    );
  }

  pendingParallelSteps(): FoldStep[] {
    const step = this.currentStep;
    if (!step?.parallelGroup) {
      return step ? [step] : [];
    }
    return this.recipe.steps.filter(
      (candidate) => candidate.parallelGroup === step.parallelGroup && !this.committedStepIds.has(candidate.id),
    );
  }

  guideSteps(): FoldStep[] {
    const group = this.parallelGroupSteps();
    if (group.length > 0) {
      return group;
    }
    return this.currentStep ? [this.currentStep] : [];
  }

  pendingMovingRegions(): GrabRegion[] {
    if (this.phase === 'folding' || this.phase === 'snapping' || this.phase === 'returning') {
      return this.currentStep ? [this.currentStep.movingRegion] : [];
    }
    return this.pendingParallelSteps().map((step) => step.movingRegion);
  }

  foxEarDebug(): FoxEarDebug | null {
    if (this.currentStep?.parallelGroup !== 'fox-ears') {
      return null;
    }
    const left = this.recipe.steps.find((step) => step.id === 'fox-ear-left');
    const right = this.recipe.steps.find((step) => step.id === 'fox-ear-right');
    if (!left || !right) {
      return null;
    }
    const from = this.fromSnapshot;
    const debug = from ? foldAxisDebug(right, from, this.currentStep?.id === right.id ? this.angleDeg : 0) : null;
    const faces = debug
      ? [...new Set(debug.movingFaceIds.map((id) => originalFaceId(id)))].join(',')
      : right.hinge.movingFaces.join(',');
    const active = this.currentStep?.id === right.id;
    const progress = this.committedStepIds.has(right.id)
      ? 1
      : active
        ? this.foldT
        : 0;
    const snap = !active
      ? 'idle'
      : this.phase === 'snapping'
        ? 'snapping'
        : this.snapArmed
          ? 'armed'
          : progress >= FOLD_ASSIST.activationThreshold
            ? 'assist'
            : 'off';
    return {
      state: {
        left: this.foxEarStatus(left),
        right: this.foxEarStatus(right),
      },
      leftCreaseId: left.lockCreaseIds?.[0] ?? left.hinge.id,
      rightCreaseId: right.lockCreaseIds?.[0] ?? right.hinge.id,
      activeFoldId: this.currentStep?.id ?? '—',
      rightFaces: faces,
      rightAxis: `${formatPoint(right.hinge.p0)} → ${formatPoint(right.hinge.p1)}`,
      rightPivot: formatPoint(right.hinge.p0),
      angleDeg: active ? this.angleDeg : this.committedStepIds.has(right.id) ? right.targetAngleDeg : right.startAngleDeg,
      targetDeg: right.targetAngleDeg,
      progress,
      snap,
    };
  }

  parallelFoldDebug(): ParallelFoldDebug[] {
    return this.parallelGroupSteps().map((step) => ({
      stepId: step.id,
      state: this.parallelState(step),
      angleDeg: this.currentStep?.id === step.id ? this.angleDeg : step.startAngleDeg,
      crease: step.creaseLineLocal,
      visible: !this.committedStepIds.has(step.id),
    }));
  }

  isStepCommitted(stepId: string): boolean {
    return this.committedStepIds.has(stepId);
  }

  completedStepIds(): string[] {
    return [...this.committedStepIds];
  }

  get silhouetteOk(): boolean {
    return this.silhouettePassed;
  }

  isAnimating(): boolean {
    return this.phase === 'snapping' || this.phase === 'returning';
  }

  isBusy(): boolean {
    return this.isAnimating() || this.phase === 'locked';
  }

  isComplete(): boolean {
    return this.committed >= this.recipe.steps.length;
  }

  get commitEventCount(): number {
    return this.commitEvents;
  }

  canStartCreature(): boolean {
    return this.isComplete() && this.silhouettePassed;
  }

  progress(): ProgressModel {
    return progressFromRecipe(this.recipe, this.committed);
  }

  reset(recipe = this.recipe, vertices = this.initialVertices): void {
    assertRecipe(recipe);
    this.recipe = recipe;
    this.initialVertices = { ...vertices };
    this.vertices = { ...this.initialVertices };
    this.stepIndex = 0;
    this.committed = 0;
    this.angleDeg = this.currentStep?.startAngleDeg ?? 0;
    this.grabLocal = null;
    this.lastValidation = null;
    this.phase = 'idle';
    this.assistUsed = false;
    this.holdMs = 0;
    this.lockedCreaseIds.clear();
    this.committedStepIds.clear();
    this.commitEvents = 0;
    this.liveSnapshot = null;
    this.silhouettePassed = true;
    this.resetSnapArm();
  }

  beginGrab(local: Vec3): void {
    if (this.isBusy()) {
      return;
    }
    this.armParallelStep(local);
    if (!this.currentStep) {
      return;
    }
    this.grabLocal = local;
    this.holdMs = 0;
    this.phase = 'folding';
    this.resetSnapArm();
  }

  updateFold(local: Vec3, frozen = false, dtMs = 16): number {
    const step = this.currentStep;
    if (!step || this.phase !== 'folding' || frozen || !this.grabLocal) {
      return this.angleDeg;
    }
    this.holdMs += dtMs;
    const hingeRaw = grabAdjustedAngle(
      local,
      this.grabLocal,
      step.startAngleDeg,
      step.minAngleDeg,
      step.maxAngleDeg,
      PAPER_SIZE_M / 2,
      step.hinge,
    );
    const arrowRaw = arrowAdjustedAngle(
      local,
      this.grabLocal,
      step.arrowPathLocal,
      step.startAngleDeg,
      step.minAngleDeg,
      step.maxAngleDeg,
    );
    const mapped =
      stepActionType(step) === 'crease-press'
        ? arrowRaw
        : interpolatesMesh(step)
          ? Math.max(hingeRaw, arrowRaw)
          : hingeRaw;
    const holdTarget = step.creasePressHoldMs ?? DEFAULT_CREASE_PRESS_HOLD_MS;
    const holdAngle =
      stepActionType(step) === 'crease-press'
        ? step.startAngleDeg +
          Math.min(1, this.holdMs / Math.max(holdTarget, 1)) * (step.targetAngleDeg - step.startAngleDeg)
        : step.startAngleDeg;
    const raw = Math.max(mapped, holdAngle);
    const rawT = foldProgress(step.startAngleDeg, step.targetAngleDeg, raw);
    const reversing = rawT + 1e-4 < this.lastRawT;
    this.lastRawT = rawT;
    if (reversing) {
      this.angleDeg = raw;
    } else {
      const base = fartherAlong(step.startAngleDeg, step.targetAngleDeg, raw, this.angleDeg);
      const baseT = foldProgress(step.startAngleDeg, step.targetAngleDeg, base);
      this.angleDeg = applyFoldAssist(base, step.targetAngleDeg, baseT, dtMs);
    }
    this.foldT = foldProgress(step.startAngleDeg, step.targetAngleDeg, this.angleDeg);
    this.lastValidation = validateFold(step, this.angleDeg, this.vertices, { holdMs: this.holdMs });
    this.armSnap(this.foldT, dtMs);
    debugEvents.emit('foldAngleChanged', {
      stepId: step.id,
      angleDeg: this.angleDeg,
      errorDeg: this.lastValidation.angleErrorDeg,
    });
    if (this.snapArmed) {
      this.beginSnap(step);
    }
    return this.angleDeg;
  }

  release(): FoldValidation {
    const step = this.currentStep;
    if (!step) {
      this.lastValidation = { ok: false, angleErrorDeg: 0, landmarkErrorM: 0, reason: 'angle' };
      return this.lastValidation;
    }
    if (this.phase === 'snapping' || this.phase === 'returning') {
      if (this.phase === 'snapping') {
        this.lastValidation = {
          ok: true,
          angleErrorDeg: Math.abs(this.angleDeg - step.targetAngleDeg),
          landmarkErrorM: 0,
          reason: 'ok',
        };
      }
      return this.lastValidation ?? {
        ok: false,
        angleErrorDeg: Math.abs(this.angleDeg - step.targetAngleDeg),
        landmarkErrorM: 0,
        reason: 'angle',
      };
    }
    this.grabLocal = null;
    this.foldT = foldProgress(step.startAngleDeg, step.targetAngleDeg, this.angleDeg);
    this.lastValidation = validateFold(step, this.angleDeg, this.vertices, { holdMs: this.holdMs });
    const autoSnap = passedAutoSnap(this.foldT) || this.snapArmed;
    if (autoSnap && !this.lastValidation.ok) {
      this.lastValidation = { ...this.lastValidation, ok: true, reason: 'ok' };
    }
    debugEvents.emit(this.lastValidation.ok ? 'foldValidated' : 'foldRejected', {
      stepId: step.id,
      reason: this.lastValidation.reason,
      angleDeg: this.angleDeg,
      angleErrorDeg: this.lastValidation.angleErrorDeg,
      landmarkErrorM: this.lastValidation.landmarkErrorM,
      assist: this.assistUsed,
    });
    if (this.lastValidation.ok) {
      this.startAnim('snapping', this.angleDeg, step.targetAngleDeg, snapDurationMs());
    } else {
      this.startAnim('returning', this.angleDeg, step.startAngleDeg, RETURN_MS);
    }
    return this.lastValidation;
  }

  cancelActive(): 'snapping' | 'returning' | 'noop' {
    const step = this.currentStep;
    if (!step || this.phase === 'locked' || this.phase === 'snapping') {
      return this.phase === 'snapping' ? 'snapping' : 'noop';
    }
    if (this.phase === 'returning') {
      return 'returning';
    }
    this.grabLocal = null;
    this.holdMs = 0;
    this.foldT = foldProgress(step.startAngleDeg, step.targetAngleDeg, this.angleDeg);
    if (this.snapArmed) {
      this.startAnim('snapping', this.angleDeg, step.targetAngleDeg, snapDurationMs());
      return 'snapping';
    }
    this.startAnim('returning', this.angleDeg, step.startAngleDeg, RETURN_MS);
    return 'returning';
  }

  assistToTarget(): void {
    const step = this.currentStep;
    if (!step || this.isBusy()) {
      return;
    }
    this.assistUsed = true;
    if (stepActionType(step) === 'crease-press') {
      this.holdMs = step.creasePressHoldMs ?? DEFAULT_CREASE_PRESS_HOLD_MS;
    }
    this.startAnim('snapping', this.angleDeg, step.targetAngleDeg, snapDurationMs());
  }

  tick(dtMs: number): { finished: boolean; committed: boolean } {
    if (this.phase !== 'snapping' && this.phase !== 'returning') {
      return { finished: false, committed: false };
    }
    this.animElapsed += dtMs;
    const t = easeOutCubic(this.animElapsed / this.animDuration);
    this.angleDeg = lerp(this.animFrom, this.animTo, t);
    if (this.animElapsed < this.animDuration) {
      return { finished: false, committed: false };
    }
    this.angleDeg = this.animTo;
    if (this.phase === 'snapping') {
      const payload = this.feedbackPayload(this.currentStep);
      this.commitStep();
      if (payload) {
        foldFeedbackBus.emit('fold:snap-complete', payload);
        debugEvents.emit('foldSnapComplete', { stepId: payload.stepId, recipeId: payload.recipeId, assist: payload.assist });
      }
      return { finished: true, committed: true };
    }
    this.phase = 'idle';
    this.holdMs = 0;
    return { finished: true, committed: false };
  }

  private commitStep(): void {
    const step = this.currentStep;
    if (!step) {
      return;
    }
    if (this.committedStepIds.has(step.id)) {
      this.phase = this.committed >= this.recipe.steps.length ? 'locked' : 'idle';
      this.holdMs = 0;
      return;
    }
    this.committed += 1;
    this.commitEvents += 1;
    this.committedStepIds.add(step.id);
    const from = this.fromSnapshot;
    if (step.parallelGroup && from && usesAxisAngleFold(step)) {
      const hint = step.targetLandmarks[0]?.sourceVertexId
        ? from.named?.[step.targetLandmarks[0].sourceVertexId]
        : undefined;
      this.liveSnapshot = applyHingeSnapshot(from, step.hinge, step.direction, step.targetAngleDeg, hint);
      if (this.liveSnapshot.named) {
        this.vertices = { ...this.liveSnapshot.named };
      }
    } else {
      const named = this.recipe.snapshots[step.toSnapshotId]?.named;
      if (named) {
        this.vertices = { ...named };
      }
    }
    for (const id of step.lockCreaseIds ?? []) {
      this.lockedCreaseIds.add(id);
    }
    this.holdMs = 0;
    this.resetSnapArm();
    debugEvents.emit('foldCommitted', {
      stepId: step.id,
      snapshot: step.toSnapshotId,
      assist: this.assistUsed,
    });
    if (this.committed >= this.recipe.steps.length) {
      this.silhouettePassed = this.evaluateSilhouette();
      this.phase = 'locked';
      this.stepIndex = this.recipe.steps.length;
      return;
    }
    const nextIndex = this.recipe.steps.findIndex((candidate) => !this.committedStepIds.has(candidate.id));
    this.stepIndex = nextIndex >= 0 ? nextIndex : this.recipe.steps.length;
    this.angleDeg = this.currentStep?.startAngleDeg ?? 0;
    this.phase = 'idle';
    this.assistUsed = false;
  }

  private evaluateSilhouette(): boolean {
    const reference = this.recipe.finalSilhouette;
    if (!reference || reference.length === 0) {
      return true;
    }
    const current = [...Object.values(this.vertices), ...(this.finalSnapshot()?.vertices ?? [])];
    const error = silhouetteErrorM(current, reference);
    return error <= (this.recipe.silhouetteToleranceM ?? DEFAULT_SILHOUETTE_TOLERANCE_M);
  }

  private startAnim(phase: 'snapping' | 'returning', from: number, to: number, duration: number): void {
    const previous = this.phase;
    this.phase = phase;
    this.animFrom = from;
    this.animTo = to;
    this.animElapsed = 0;
    this.animDuration = duration;
    this.grabLocal = null;
    const payload = this.feedbackPayload(this.currentStep);
    if (!payload) {
      return;
    }
    if (phase === 'snapping' && previous !== 'snapping') {
      foldFeedbackBus.emit('fold:snap-start', payload);
      debugEvents.emit('foldSnapStart', { stepId: payload.stepId, recipeId: payload.recipeId, assist: payload.assist });
    }
    if (phase === 'returning' && previous !== 'returning') {
      foldFeedbackBus.emit('fold:snap-cancelled', payload);
      debugEvents.emit('foldSnapCancelled', { stepId: payload.stepId, recipeId: payload.recipeId });
    }
  }

  private feedbackPayload(step: FoldStep | null): FoldFeedbackPayload | null {
    if (!step) {
      return null;
    }
    return {
      recipeId: this.recipe.id,
      stepId: step.id,
      crease: stepCreaseLine(step),
      assist: this.assistUsed,
    };
  }

  private beginSnap(step: FoldStep): void {
    this.grabLocal = null;
    this.lastValidation = {
      ok: true,
      angleErrorDeg: Math.abs(this.angleDeg - step.targetAngleDeg),
      landmarkErrorM: 0,
      reason: 'ok',
    };
    this.startAnim('snapping', this.angleDeg, step.targetAngleDeg, snapDurationMs());
  }

  private armSnap(progress: number, dtMs: number): void {
    if (!FOLD_ASSIST.enabled) {
      this.snapStableMs = 0;
      this.snapArmed = false;
      this.lastFoldT = progress;
      return;
    }
    const advancing = progress + 1e-4 >= this.lastFoldT;
    this.lastFoldT = progress;
    if (!advancing || !passedAutoSnap(progress)) {
      this.snapStableMs = 0;
      if (progress < FOLD_ASSIST.activationThreshold) {
        this.snapArmed = false;
      }
      return;
    }
    this.snapStableMs += dtMs;
    if (this.snapStableMs >= FOLD_ASSIST.stabilityDurationMs) {
      this.snapArmed = true;
    }
  }

  private resetSnapArm(): void {
    this.foldT = 0;
    this.lastFoldT = 0;
    this.lastRawT = 0;
    this.snapStableMs = 0;
    this.snapArmed = false;
  }

  private parallelGroupSteps(): FoldStep[] {
    const group = this.currentStep?.parallelGroup;
    if (!group) {
      return [];
    }
    return this.recipe.steps.filter((step) => step.parallelGroup === group);
  }

  private usesLiveParallelSnapshot(): boolean {
    const step = this.currentStep;
    return Boolean(step?.parallelGroup && this.liveSnapshot);
  }

  private foxEarStatus(step: FoldStep): FoxEarFoldState['left'] {
    const state = this.parallelState(step);
    if (state === 'completed' || state === 'folding' || state === 'snapping') {
      return state;
    }
    return 'pending';
  }

  private parallelState(step: FoldStep): ParallelFoldState {
    if (this.committedStepIds.has(step.id)) {
      return 'completed';
    }
    if (this.currentStep?.id !== step.id) {
      return 'pending';
    }
    if (this.phase === 'folding') {
      return 'folding';
    }
    if (this.phase === 'snapping') {
      return 'snapping';
    }
    return this.pendingParallelSteps().length > 1 ? 'pending' : 'active';
  }

  private armParallelStep(local: Vec3): void {
    const pending = this.pendingParallelSteps();
    if (pending.length <= 1) {
      return;
    }
    const hit = hitMovingRegion(local, PAPER_SIZE_M, pending.map((step) => step.movingRegion));
    const match = pending.find((step) => step.movingRegion.id === hit?.id);
    if (!match) {
      return;
    }
    const index = this.recipe.steps.findIndex((step) => step.id === match.id);
    if (index < 0 || index === this.stepIndex) {
      return;
    }
    this.stepIndex = index;
    this.angleDeg = match.startAngleDeg;
    this.assistUsed = false;
  }
}

export function twoStepMockRecipe(base: OrigamiRecipe): OrigamiRecipe {
  const first = base.steps[0];
  if (!first) {
    throw new Error('mock recipe needs a first step');
  }
  const second: FoldStep = {
    ...first,
    id: 'second-fold',
    ordinal: 2,
    title: 'Second fixture fold',
    fromSnapshotId: first.toSnapshotId,
    toSnapshotId: 'square-done',
    startAngleDeg: 0,
    targetAngleDeg: 90,
    maxAngleDeg: 90,
    targetLandmarks: [],
    validationNotes: 'Mock second step for recipe-engine tests only. Angle-only; not a fish crease.',
  };
  return {
    ...base,
    id: `${base.id}-two-step`,
    snapshots: {
      ...base.snapshots,
      'square-done': base.snapshots[first.toSnapshotId] ?? { vertices: [], faces: [] },
    },
    steps: [first, second],
  };
}
