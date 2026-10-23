import { describe, expect, it, vi } from 'vitest';
import { classifyGrab, classifyGrabMany } from '../../src/input/GrabRegionMath.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { deformFoldMesh, deformFoldSnapshot } from '../../src/origami/FoldPaper.ts';
import { grabAdjustedAngle, landmarkAfterHinge } from '../../src/origami/CreaseSolver.ts';
import { foldProgress } from '../../src/origami/foldAssist.ts';
import { originalFaceId } from '../../src/origami/foldLayerGroup.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { deformByHinge, foldAxisDebug } from '../../src/origami/MeshSplitter.ts';
import { interpolatesMesh } from '../../src/origami/types.ts';
import {
  FOX_LOWER_LEFT_SAMPLES,
  FOX_LOWER_RIGHT_SAMPLES,
  foxPointCovered,
  validateFoxGeometry,
} from '../../src/origami/foxFinalShape.ts';
import {
  FOX_EAR_LEFT_CREASE,
  FOX_EAR_RIGHT_CREASE,
  FOX_NAMED,
  FOX_RECIPE,
} from '../../src/origami/recipes/fox.recipe.ts';
import type { FoldStep, Vec3 } from '../../src/origami/types.ts';
import { distance3 } from '../../src/utils/math.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

describe('origami fox recipe', () => {
  it('is a valid 4-stage recipe with two ear sub-folds', () => {
    expect(FOX_RECIPE.id).toBe('origami-fox');
    expect(validateRecipe(FOX_RECIPE)).toEqual([]);
    expect(FOX_RECIPE.steps.map((step) => step.id)).toEqual([
      'fox-half',
      'fox-brow',
      'fox-ear-left',
      'fox-ear-right',
      'complete-fox',
    ]);
    const progress = progressFromRecipe(FOX_RECIPE);
    expect(progress.totalSteps).toBe(4);
    expect(progress.committedCount).toBe(0);
    expect(`${progress.committedCount}/${progress.totalSteps}`).toBe('0/4');
  });

  it('does not complete stage 3 until both ears commit', () => {
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 4, activeIndex: 1 });

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 2, totalSteps: 4, activeIndex: 2 });
    expect(engine.currentStep?.id).toBe('fox-ear-left');

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(2);
    expect(engine.currentStep?.id).toBe('fox-ear-right');

    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 3, totalSteps: 4, activeIndex: 3 });
  });

  it('keeps interpolation snapshot vertex counts aligned', () => {
    for (const step of FOX_RECIPE.steps) {
      if (!interpolatesMesh(step)) {
        continue;
      }
      const from = FOX_RECIPE.snapshots[step.fromSnapshotId];
      const to = FOX_RECIPE.snapshots[step.toSnapshotId];
      expect(from?.vertices.length, step.id).toBe(to?.vertices.length);
    }
  });

  it('completes the diamond fold from a bottom-to-top drag', () => {
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    engine.beginGrab([0, -0.1, 0]);
    engine.updateFold([0, 0.1, 0]);
    expect(engine.release().ok).toBe(true);
    drain(engine, 400);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 4, activeIndex: 1 });
    expect(engine.currentStep?.id).toBe('fox-brow');
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['horizontal']);
  });

  it('rotates the bottom corner onto the top corner about the horizontal crease', () => {
    const step = FOX_RECIPE.steps[0]!;
    const folded = landmarkAfterHinge(FOX_NAMED.B, step.hinge, 180, 'valley');
    expect(folded[0]).toBeCloseTo(FOX_NAMED.T[0], 5);
    expect(folded[1]).toBeCloseTo(FOX_NAMED.T[1], 5);
    expect(folded[2]).toBeCloseTo(FOX_NAMED.T[2], 5);

    const from = FOX_RECIPE.snapshots.diamond!;
    const to = FOX_RECIPE.snapshots.triangle!;
    const live = deformFoldMesh(step, from, to, 180);
    const b = live[3]!;
    expect(b[0]).toBeCloseTo(FOX_NAMED.T[0], 5);
    expect(b[1]).toBeCloseTo(FOX_NAMED.T[1], 5);
  });

  it('maps a bottom-to-top pinch on the diamond hinge to 180°', () => {
    const hinge = FOX_RECIPE.steps[0]!.hinge;
    const grab = FOX_NAMED.B;
    expect(grabAdjustedAngle(grab, grab, 0, 0, 180, PAPER_SIZE_M / 2, hinge)).toBeCloseTo(0);
    expect(grabAdjustedAngle(FOX_NAMED.T, grab, 0, 0, 180, PAPER_SIZE_M / 2, hinge)).toBeCloseTo(180);
  });

  it('grabs only the lower diamond half for stage 1', () => {
    const step = FOX_RECIPE.steps[0]!;
    expect(
      classifyGrab([0, -0.08, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('moving');
    expect(
      classifyGrab([0, 0.08, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('hold');
  });

  it('folds both stacked triangle layers about the same brow crease', () => {
    const step = FOX_RECIPE.steps[1]!;
    expect(step.id).toBe('fox-brow');
    expect(step.hinge.layerMode).toBe('packet');
    expect(new Set(step.hinge.movingFaces)).toEqual(
      new Set(['top-left', 'top-right', 'bot-left', 'bot-right']),
    );
    expect(step.hinge.p0).toEqual(step.creaseLineLocal[0]);
    expect(step.hinge.p1).toEqual(step.creaseLineLocal[1]);

    const from = FOX_RECIPE.snapshots.triangle!;
    const layers = new Set(from.faces.map((face) => face.layer));
    expect(layers.size).toBe(2);

    const hint = from.named?.T;
    const rest = deformByHinge(from, step.hinge, 0, hint);
    const folded = deformByHinge(from, step.hinge, -180, hint);
    const group = foldAxisDebug(step, from, 180).foldGroup;
    expect(group.mode).toBe('packet');
    expect(group.layers).toEqual([0, 1]);
    expect(group.frontFaceIds.length).toBeGreaterThan(0);
    expect(group.backFaceIds.length).toBeGreaterThan(0);
    expect(group.faceIds.length).toBe(rest.movingFaceIds.size);

    expect(distance3(folded.snapshot.vertices[2]!, FOX_NAMED.O)).toBeLessThan(0.001);
    expect(distance3(folded.snapshot.vertices[3]!, FOX_NAMED.O)).toBeLessThan(0.001);
    expect(distance3(folded.snapshot.vertices[0]!, FOX_NAMED.L)).toBeLessThan(0.001);
    expect(distance3(folded.snapshot.vertices[1]!, FOX_NAMED.RIGHT)).toBeLessThan(0.001);

    for (const index of rest.creaseVertexIds) {
      expect(distance3(rest.snapshot.vertices[index]!, folded.snapshot.vertices[index]!)).toBeLessThan(
        0.0002,
      );
    }

    const live = deformFoldSnapshot(step, from, FOX_RECIPE.snapshots.brow!, 180);
    expect(distance3(live.vertices[2] ?? FOX_NAMED.T, FOX_NAMED.O)).toBeLessThan(0.002);
    expect(distance3(live.vertices[3] ?? FOX_NAMED.B, FOX_NAMED.O)).toBeLessThan(0.002);
    expect(distance3(FOX_RECIPE.snapshots.brow?.named?.T ?? FOX_NAMED.T, FOX_NAMED.O)).toBeLessThan(0.002);
    expect(distance3(FOX_RECIPE.snapshots.brow?.named?.B ?? FOX_NAMED.B, FOX_NAMED.O)).toBeLessThan(0.002);
  });

  it('lets either hand grab the whole double-layer tip as one region', () => {
    const step = FOX_RECIPE.steps[1]!;
    expect(
      classifyGrab([0, 0.12, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('moving');
    expect(
      classifyGrab([0, 0.12, 0.004], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('moving');
    expect(
      classifyGrab([0, 0.02, 0], PAPER_SIZE_M, step.movingRegion, step.optionalHoldRegion),
    ).toBe('hold');
  });

  it('keeps the ear corners in place for step 3 after the packet brow fold', () => {
    const brow = FOX_RECIPE.snapshots.brow!;
    expect(distance3(brow.named?.L ?? FOX_NAMED.L, FOX_NAMED.L)).toBeLessThan(0.002);
    expect(distance3(brow.named?.RIGHT ?? FOX_NAMED.RIGHT, FOX_NAMED.RIGHT)).toBeLessThan(0.002);
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(engine, 'fox-ear-left');
    expect(engine.currentStep?.id).toBe('fox-ear-left');
  });

  it('registers both ear creases on the same hinge axes when step 3 begins', () => {
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    expect(left.parallelGroup).toBe('fox-ears');
    expect(right.parallelGroup).toBe('fox-ears');
    expect(left.progressStage).toBe(3);
    expect(right.progressStage).toBe(3);
    expect(left.creaseLineLocal).toEqual(FOX_EAR_LEFT_CREASE);
    expect(right.creaseLineLocal).toEqual(FOX_EAR_RIGHT_CREASE);
    expect(left.hinge.p0).toEqual(FOX_EAR_LEFT_CREASE[0]);
    expect(left.hinge.p1).toEqual(FOX_EAR_LEFT_CREASE[1]);
    expect(right.hinge.p0).toEqual(FOX_EAR_RIGHT_CREASE[0]);
    expect(right.hinge.p1).toEqual(FOX_EAR_RIGHT_CREASE[1]);
    expect(left.hinge.layerMode).toBe('packet');
    expect(right.hinge.layerMode).toBe('packet');

    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(engine, 'fox-ear-left');
    expect(engine.guideSteps().map((step) => step.id)).toEqual(['fox-ear-left', 'fox-ear-right']);
    expect(engine.pendingMovingRegions().map((region) => region.id)).toEqual(['moving-left', 'moving-right']);
    const debug = engine.parallelFoldDebug();
    expect(debug.map((entry) => [entry.stepId, entry.visible, entry.state])).toEqual([
      ['fox-ear-left', true, 'pending'],
      ['fox-ear-right', true, 'pending'],
    ]);
    const from = engine.fromSnapshot!;
    expect(foldAxisDebug(left, from, 0).mismatch).toBe(false);
    expect(foldAxisDebug(right, from, 0).mismatch).toBe(false);
    expect(foldAxisDebug(left, from, 0).hinge).toEqual(left.creaseLineLocal);
    expect(foldAxisDebug(right, from, 0).visual).toEqual(right.creaseLineLocal);
  });

  it('folds each ear independently around its own crease and keeps the opposite flap still', () => {
    const brow = FOX_RECIPE.snapshots.brow!;
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    const leftFold = deformByHinge(brow, left.hinge, -180, brow.named?.L);
    const rightFold = deformByHinge(brow, right.hinge, -180, brow.named?.RIGHT);
    const leftMoved = new Set([...leftFold.movingFaceIds].map(originalFaceId));
    const rightMoved = new Set([...rightFold.movingFaceIds].map(originalFaceId));

    expect(leftMoved.has('top-left')).toBe(true);
    expect(leftMoved.has('bot-left')).toBe(true);
    expect(leftMoved.has('top-right')).toBe(false);
    expect(rightMoved.has('top-right')).toBe(true);
    expect(rightMoved.has('bot-right')).toBe(true);
    expect(rightMoved.has('top-left')).toBe(false);
    expect(foldAxisDebug(left, brow, 180).foldGroup.mode).toBe('packet');
    expect(foldAxisDebug(left, brow, 180).foldGroup.layers.length).toBeGreaterThanOrEqual(2);
    expect(foldAxisDebug(right, brow, 180).foldGroup.layers.length).toBeGreaterThanOrEqual(2);
    expect(distance3(leftFold.snapshot.vertices[1]!, FOX_NAMED.RIGHT)).toBeLessThan(0.002);
    expect(distance3(rightFold.snapshot.vertices[0]!, FOX_NAMED.L)).toBeLessThan(0.002);
    expect(distance3(leftFold.snapshot.vertices[0]!, landmarkAfterHinge(FOX_NAMED.L, left.hinge, 180, 'valley'))).toBeLessThan(
      0.01,
    );
    expect(
      distance3(rightFold.snapshot.vertices[1]!, landmarkAfterHinge(FOX_NAMED.RIGHT, right.hinge, 180, 'valley')),
    ).toBeLessThan(0.01);
  });

  it('lifts the right ear toward the viewer, matching the left ear', () => {
    const brow = FOX_RECIPE.snapshots.brow!;
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    const leftLift = deformByHinge(brow, left.hinge, -90, brow.named?.L).snapshot.vertices[0]!;
    const rightLift = deformByHinge(brow, right.hinge, -90, brow.named?.RIGHT).snapshot.vertices[1]!;
    expect(leftLift[2]).toBeGreaterThan(0.04);
    expect(rightLift[2]).toBeGreaterThan(0.04);

    const lift = (corner: Vec3, hinge: FoldStep['hinge']): number =>
      grabAdjustedAngle([corner[0], corner[1], 0.05], corner, 0, 0, 180, PAPER_SIZE_M / 2, hinge);
    const leftAngle = lift(FOX_NAMED.L, left.hinge);
    const rightAngle = lift(FOX_NAMED.RIGHT, right.hinge);
    expect(leftAngle).toBeGreaterThan(20);
    expect(rightAngle).toBeGreaterThan(20);
    expect(foldProgress(0, 180, rightAngle)).toBeGreaterThan(0.1);
    expect(foldProgress(0, 180, -rightAngle)).toBe(0);

    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(engine, 'fox-ear-left');
    const pending = engine.foxEarDebug();
    expect(pending?.state).toEqual({ left: 'pending', right: 'pending' });
    expect(pending?.leftCreaseId).toBe('ear-left');
    expect(pending?.rightCreaseId).toBe('ear-right');
    expect(pending?.rightFaces.split(',').sort()).toEqual(['bot-right', 'top-right']);
    engine.beginGrab(centroidLocal(right.movingRegion.polygonUV));
    expect(engine.foxEarDebug()?.state.right).toBe('folding');
    expect(engine.foxEarDebug()?.state.left).toBe('pending');
    expect(engine.foxEarDebug()?.activeFoldId).toBe('fox-ear-right');

    const retry = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(retry, 'fox-ear-left');
    const grab = right.arrowPathLocal[0]!;
    const end = right.arrowPathLocal.at(-1)!;
    retry.beginGrab(centroidLocal(right.movingRegion.polygonUV));
    retry.updateFold(mix(grab, end, 0.2), false, 16);
    expect(retry.foldCompletion).toBeLessThan(0.5);
    retry.release();
    drain(retry, 400);
    expect(retry.isStepCommitted('fox-ear-right')).toBe(false);
    expect(retry.foxEarDebug()?.state).toEqual({ left: 'pending', right: 'pending' });
    retry.beginGrab(centroidLocal(right.movingRegion.polygonUV));
    driveToAutoSnap(retry, right);
    drain(retry, 400);
    expect(retry.isStepCommitted('fox-ear-right')).toBe(true);
    expect(retry.isStepCommitted('fox-ear-left')).toBe(false);
    expect(retry.currentStep?.id).toBe('fox-ear-left');
    const afterRight = retry.fromSnapshot!;
    const leftCorner = afterRight.named?.L ?? FOX_NAMED.L;
    const leftIndex = afterRight.vertices.findIndex((vertex) => distance3(vertex, leftCorner) < 0.002);
    const leftAfter = deformByHinge(afterRight, left.hinge, -90, afterRight.named?.L).snapshot.vertices[leftIndex]!;
    expect(leftAfter[2]).toBeGreaterThan(0.04);

    const leftFirst = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(leftFirst, 'fox-ear-left');
    leftFirst.beginGrab(centroidLocal(left.movingRegion.polygonUV));
    driveToAutoSnap(leftFirst, left);
    drain(leftFirst, 400);
    expect(leftFirst.foxEarDebug()?.state).toEqual({ left: 'completed', right: 'pending' });
    const afterLeft = leftFirst.fromSnapshot!;
    const rightCorner = afterLeft.named?.RIGHT ?? FOX_NAMED.RIGHT;
    const rightIndex = afterLeft.vertices.findIndex((vertex) => distance3(vertex, rightCorner) < 0.002);
    const rightAfter = deformByHinge(afterLeft, right.hinge, -90, afterLeft.named?.RIGHT).snapshot.vertices[rightIndex]!;
    expect(rightAfter[2]).toBeGreaterThan(0.04);
    expect(classifyGrabMany(centroidLocal(right.movingRegion.polygonUV), PAPER_SIZE_M, [right.movingRegion], right.optionalHoldRegion)).toBe(
      'moving',
    );
  });

  it('lets either ear fold first and only completes step 3 after both snap', () => {
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    walkTo(engine, 'fox-ear-left');
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    const regions = [left.movingRegion, right.movingRegion];
    expect(classifyGrabMany(centroidLocal(right.movingRegion.polygonUV), PAPER_SIZE_M, regions, left.optionalHoldRegion)).toBe(
      'moving',
    );
    expect(classifyGrabMany(centroidLocal(left.movingRegion.polygonUV), PAPER_SIZE_M, regions, left.optionalHoldRegion)).toBe(
      'moving',
    );

    engine.beginGrab(centroidLocal(right.movingRegion.polygonUV));
    expect(engine.currentStep?.id).toBe('fox-ear-right');
    expect(engine.pendingMovingRegions().map((region) => region.id)).toEqual(['moving-right']);
    driveToAutoSnap(engine, right);
    expect(engine.enginePhase).toBe('snapping');
    drain(engine, 400);
    expect(engine.isStepCommitted('fox-ear-right')).toBe(true);
    expect(engine.isStepCommitted('fox-ear-left')).toBe(false);
    expect(engine.currentStep?.id).toBe('fox-ear-left');
    expect(engine.progress()).toMatchObject({ committedCount: 2, totalSteps: 4, activeIndex: 2, subFold: 2, subFoldTotal: 2 });
    expect(engine.guideSteps().map((step) => step.id)).toEqual(['fox-ear-left', 'fox-ear-right']);
    const afterRight = engine.parallelFoldDebug();
    expect(afterRight.find((entry) => entry.stepId === 'fox-ear-right')).toMatchObject({
      state: 'completed',
      visible: false,
    });
    expect(afterRight.find((entry) => entry.stepId === 'fox-ear-left')).toMatchObject({
      state: 'active',
      visible: true,
    });
    expect(engine.pendingMovingRegions().map((region) => region.id)).toEqual(['moving-left']);

    driveToAutoSnap(engine, left);
    drain(engine, 400);
    expect(engine.isStepCommitted('fox-ear-left')).toBe(true);
    expect(engine.currentStep?.id).toBe('complete-fox');
    expect(engine.progress()).toMatchObject({ committedCount: 3, totalSteps: 4, activeIndex: 3 });
  });

  it('keeps a double-layer triangle after step 1 and both upper layers after the brow', () => {
    const triangle = FOX_RECIPE.snapshots.triangle!;
    const layers = new Set(triangle.faces.map((face) => face.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
    expect(foxPointCovered(triangle, [0, 0.06, 0])).toBe(true);
    const brow = FOX_RECIPE.snapshots.brow!;
    expect(brow.faces.some((face) => face.layer >= 1)).toBe(true);
    expect(foxPointCovered(brow, FOX_LOWER_LEFT_SAMPLES[0]!)).toBe(true);
    expect(foxPointCovered(brow, FOX_LOWER_RIGHT_SAMPLES[0]!)).toBe(true);
  });

  it('preserves the lower-left diamond cheek when either ear folds', () => {
    const brow = FOX_RECIPE.snapshots.brow!;
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    const afterLeft = deformByHinge(brow, left.hinge, -180, brow.named?.L);
    expect(foxPointCovered(afterLeft.snapshot, FOX_LOWER_LEFT_SAMPLES[0]!)).toBe(true);
    expect(afterLeft.stationaryFaceIds.size).toBeGreaterThan(0);
    const afterRight = deformByHinge(brow, right.hinge, -180, FOX_NAMED.RIGHT);
    expect(foxPointCovered(afterRight.snapshot, FOX_LOWER_LEFT_SAMPLES[0]!)).toBe(true);
    expect(foxPointCovered(afterRight.snapshot, FOX_LOWER_RIGHT_SAMPLES[0]!)).toBe(true);
    const rightThenLeft = deformByHinge(afterRight.snapshot, left.hinge, -180, FOX_NAMED.L);
    expect(foxPointCovered(rightThenLeft.snapshot, FOX_LOWER_LEFT_SAMPLES[0]!)).toBe(true);
    expect(foxPointCovered(rightThenLeft.snapshot, FOX_LOWER_RIGHT_SAMPLES[0]!)).toBe(true);
    expect(validateFoxGeometry(FOX_RECIPE.snapshots.fox!).projectedLeftOk).toBe(true);
  });

  it('walks every action with assist, matches silhouette, and allows the fox creature', () => {
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    FOX_RECIPE.steps.forEach(() => {
      expect(engine.isComplete()).toBe(false);
      engine.assistToTarget();
      drain(engine, 400);
    });
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(4);
    expect(engine.canStartCreature()).toBe(true);
  });

  it('early-snaps every fox fold and sub-fold from ~58% angular progress', () => {
    const engine = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    for (const step of FOX_RECIPE.steps) {
      expect(engine.currentStep?.id).toBe(step.id);
      const committed = engine.progress().committedCount;
      driveToAutoSnap(engine, step);
      expect(engine.enginePhase, step.id).toBe('snapping');
      expect(engine.progress().committedCount, `${step.id} before snap`).toBe(committed);
      drain(engine, 400);
    }
    expect(engine.isComplete()).toBe(true);
    expect(engine.progress().committedCount).toBe(4);
  });
});

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function walkTo(engine: OrigamiEngine, stepId: string): void {
  for (let i = 0; i < FOX_RECIPE.steps.length; i += 1) {
    if (engine.currentStep?.id === stepId) {
      return;
    }
    engine.assistToTarget();
    drain(engine, 400);
  }
  expect(engine.currentStep?.id).toBe(stepId);
}

function centroidLocal(polygon: Array<readonly [number, number]>): Vec3 {
  const sum = polygon.reduce((acc, uv) => [acc[0] + uv[0], acc[1] + uv[1]] as [number, number], [0, 0]);
  const u = sum[0] / polygon.length;
  const v = sum[1] / polygon.length;
  return [(u - 0.5) * PAPER_SIZE_M, (v - 0.5) * PAPER_SIZE_M, 0];
}

function driveToAutoSnap(engine: OrigamiEngine, step: FoldStep): void {
  const grab = step.arrowPathLocal[0];
  const end = step.arrowPathLocal.at(-1);
  if (!grab || !end) {
    throw new Error(`${step.id} is missing an arrow path`);
  }
  engine.beginGrab(grab);
  if (step.actionType === 'crease-press') {
    for (let i = 0; i < 40; i += 1) {
      engine.updateFold(grab, false, 16);
      if (`${engine.enginePhase}` === 'snapping') {
        return;
      }
    }
    return;
  }
  for (let t = 0.2; t <= 1.001; t += 0.04) {
    const local = mix(grab, end, t);
    engine.updateFold(local, false, 16);
    if (`${engine.enginePhase}` === 'snapping') {
      return;
    }
    if (engine.foldCompletion >= 0.58) {
      for (let i = 0; i < 10; i += 1) {
        engine.updateFold(local, false, 16);
        if (`${engine.enginePhase}` === 'snapping') {
          return;
        }
      }
    }
  }
}
