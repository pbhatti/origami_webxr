import { describe, expect, it } from 'vitest';
import { PenguinCreature } from '../../src/animation/PenguinCreature.ts';
import { sampleHitsRegion } from '../../src/input/GrabRegionMath.ts';
import { rotateAroundY } from '../../src/origami/CreaseSolver.ts';
import { deformFoldSnapshot, paperFlipYawRad, turnSnapshot } from '../../src/origami/FoldPaper.ts';
import { deformByHinge, hingeFoldTravelM } from '../../src/origami/MeshSplitter.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import {
  PENGUIN_BACK_COLOR,
  PENGUIN_BEAK_FRAC,
  PENGUIN_BOTTOM_CREASE_FRAC,
  PENGUIN_EDGE_COLOR,
  PENGUIN_EYE_COLOR,
  PENGUIN_NAMED,
  PENGUIN_PAPER_COLOR,
  PENGUIN_R,
  PENGUIN_RECIPE,
  PENGUIN_SIDE_FRAC,
  PENGUIN_SIDE_OVERLAP_FRAC,
  PENGUIN_STEPS,
  PENGUIN_WING_OPEN_FRAC,
} from '../../src/origami/recipes/penguin.recipe.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  for (let frame = 0; frame < 50; frame += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function named(snapshot: MeshSnapshot, key: string): Vec3 {
  const point = snapshot.named?.[key];
  expect(point, key).toBeTruthy();
  return point!;
}

function contains(poly: Vec3[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index, index += 1) {
    const current = poly[index];
    const prior = poly[previous];
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

function topFaceAt(snapshot: MeshSnapshot, x: number, y: number): { tone: 'front' | 'back'; materialId: string } | null {
  let best = -1;
  let found: { tone: 'front' | 'back'; materialId: string } | null = null;
  for (const face of snapshot.faces) {
    const poly = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [point] : [];
    });
    if (poly.length < 3 || !contains(poly, x, y) || face.layer < best) {
      continue;
    }
    const a = poly[0]!;
    const b = poly[1]!;
    const c = poly[2]!;
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    best = face.layer;
    found = { tone: nz >= 0 ? 'front' : 'back', materialId: face.materialId };
  }
  return found;
}

describe('origami penguin recipe', () => {
  it('is a valid nine-stage blue penguin', () => {
    expect(validateRecipe(PENGUIN_RECIPE)).toEqual([]);
    expect(progressFromRecipe(PENGUIN_RECIPE).totalSteps).toBe(8);
    expect(PENGUIN_STEPS).toEqual([
      'center-creases',
      'bottom-corner',
      'lower-body',
      'flip-paper',
      'sides-inward',
      'side-flaps',
      'beak',
      'penguin-decoration',
    ]);
    const titles = [...new Set(PENGUIN_RECIPE.steps.map((step) => step.title))];
    expect(titles).toEqual([
      'Create center creases',
      'Fold the bottom corner',
      'Shape the lower body',
      'Flip the paper',
      'Fold both sides inward',
      'Spread both wings',
      'Shape the beak',
      'Bring it to life',
    ]);
    expect(PENGUIN_PAPER_COLOR).toBe('#27B9EA');
    expect(origamiPaperMaterial(PENGUIN_PAPER_COLOR).backColor).toBe(PENGUIN_BACK_COLOR.toLowerCase());
    expect(PENGUIN_EDGE_COLOR).toBe('#1688B5');
    expect(PENGUIN_EYE_COLOR).toBe('#171717');
    expect(PENGUIN_NAMED.L?.[0] ?? 0).toBeLessThan(0);
    expect(PENGUIN_NAMED.T?.[1] ?? 0).toBeCloseTo(PENGUIN_R);
  });

  it('keeps both center creases on step 1 and places the bottom crease below center', () => {
    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.currentStep?.progressStage).toBe(1);
    expect(engine.currentStep?.lockCreaseIds).toEqual(['penguin-vertical']);
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('penguin-horizontal-fold');
    expect(engine.currentStep?.progressStage).toBe(1);
    expect(engine.currentStep?.lockCreaseIds).toEqual(['penguin-horizontal']);
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('penguin-bottom');
    expect(engine.currentStep?.progressStage).toBe(2);
    const bottom = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-bottom');
    expect(bottom?.hinge.p0[1]).toBeCloseTo(PENGUIN_BOTTOM_CREASE_FRAC * PENGUIN_R);
    expect(bottom?.hinge.p0[1]).toBeLessThan(-0.15 * PENGUIN_R);
    expect(bottom?.hinge.p0[1]).toBe(bottom?.hinge.p1[1]);
    expect(bottom?.hinge.p0[1]).not.toBe(0);
  });

  it('folds only the nested tip in step 3', () => {
    const diamond = PENGUIN_RECIPE.snapshots.diamond!;
    const lowered = PENGUIN_RECIPE.snapshots.lowered!;
    for (const key of ['T', 'L', 'RIGHT'] as const) {
      expect(named(lowered, key)[0]).toBeCloseTo(named(diamond, key)[0], 5);
      expect(named(lowered, key)[1]).toBeCloseTo(named(diamond, key)[1], 5);
    }
    const upper = topFaceAt(lowered, 0, PENGUIN_R * 0.75);
    expect(upper?.tone).toBe('front');
    expect(upper?.materialId).toBe('front');
    const lower = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-lower');
    expect(lower?.progressStage).toBe(3);
    expect(lower?.hinge.minMovingLayer).toBeGreaterThan(0);
    expect(PENGUIN_RECIPE.steps.some((step) => step.id === 'penguin-center-tip')).toBe(false);
  });

  it('flips the whole sheet 180° before the side folds', () => {
    expect(PENGUIN_RECIPE.steps.some((step) => step.id === 'penguin-center-tip')).toBe(false);
    const lower = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-lower');
    const flip = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-flip');
    const left = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-left');
    const right = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-right');
    const lowered = PENGUIN_RECIPE.snapshots.lowered!;
    const turned = PENGUIN_RECIPE.snapshots.turned!;
    expect(lower?.toSnapshotId).toBe('lowered');
    expect(flip?.title).toBe('Flip the paper');
    expect(flip?.instruction).toBe('Rotate the paper 180° to reveal its reverse side.');
    expect(flip?.meshStrategy).toBe('turn');
    expect(flip?.fromSnapshotId).toBe('lowered');
    expect(flip?.toSnapshotId).toBe('turned');
    expect(flip?.targetAngleDeg).toBe(180);
    expect(flip?.parallelGroup).toBeUndefined();
    expect(flip?.id.endsWith('-open')).toBe(false);
    expect(flip?.arrowPathLocal.length).toBeGreaterThan(4);
    expect(Math.max(...(flip?.arrowPathLocal ?? []).map((point) => point[2]))).toBeGreaterThan(0.04);
    expect(sampleHitsRegion([-0.08, 0.02, 0], flip!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([0.08, -0.02, 0], flip!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(left?.fromSnapshotId).toBe('turned');
    expect(right?.fromSnapshotId).toBe('turned');
    expect(left?.progressStage).toBe(5);
    expect(right?.progressStage).toBe(5);
    expect(left?.parallelGroup).toBe('penguin-sides');
    expect(right?.parallelGroup).toBe('penguin-sides');
    expect(lowered.faces).toHaveLength(turned.faces.length);
    expect(lowered.vertices).toHaveLength(turned.vertices.length);
    expect(topFaceAt(lowered, 0, PENGUIN_R * 0.8)?.tone).toBe('front');
    for (const [x, y] of [
      [0, PENGUIN_R * 0.8],
      [0, PENGUIN_R * 0.2],
      [0, 0],
      [PENGUIN_R * 0.4, 0],
      [-PENGUIN_R * 0.4, 0],
    ] as const) {
      expect(topFaceAt(turned, x, y)?.tone, `${x},${y}`).toBe('back');
    }
    const spun = turnSnapshot(lowered, 180);
    expect(spun.vertices[0]?.[0]).toBeCloseTo(-(lowered.vertices[0]?.[0] ?? 0), 5);
    expect(spun.vertices[0]?.[1]).toBeCloseTo(lowered.vertices[0]?.[1] ?? 0, 5);
    const rightEdge = rotateAroundY([0.1, 0.02, 0], (paperFlipYawRad(90) * 180) / Math.PI);
    expect(rightEdge[2]).toBeGreaterThan(0.05);

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 12 && engine.currentStep?.id !== 'penguin-flip'; guard += 1) {
      expect(engine.currentStep?.id).not.toBe('penguin-center-tip');
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('penguin-flip');
    expect(engine.progress().activeIndex).toBe(3);
    expect(engine.isStepCommitted('penguin-lower')).toBe(true);
    const start = flip!.arrowPathLocal[0]!;
    const end = flip!.arrowPathLocal.at(-1)!;
    engine.beginGrab(start);
    engine.updateFold(end, false, 160);
    expect(engine.angle).toBeGreaterThan(150);
    for (let frame = 0; frame < 40 && engine.currentStep?.id === 'penguin-flip'; frame += 1) {
      engine.tick(32);
    }
    expect(engine.currentStep?.id).toBe('penguin-side-left');
    expect(engine.progress().activeIndex).toBe(4);
    expect(engine.isStepCommitted('penguin-flip')).toBe(true);
    commitCurrent(engine);
    expect(engine.currentStep?.progressStage).toBe(5);
    expect(engine.currentStep?.id).not.toBe('penguin-flap-left');
    expect(engine.isStepCommitted('penguin-side-left')).toBe(true);
    expect(engine.isStepCommitted('penguin-side-right')).toBe(false);
    engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.currentStep?.fromSnapshotId).toBe('diamond');
    expect(engine.angle).toBe(0);
    expect(engine.isStepCommitted('penguin-flip')).toBe(false);
  });

  it('opens both wings past the body and keeps them blue for the beak', () => {
    const flaps = PENGUIN_RECIPE.snapshots['flap-ready']!;
    const opened = PENGUIN_RECIPE.snapshots.opened!;
    const beaked = PENGUIN_RECIPE.snapshots.beaked!;
    const sideCrease = PENGUIN_SIDE_FRAC * PENGUIN_R;
    const overlap = PENGUIN_SIDE_OVERLAP_FRAC * PENGUIN_R;
    const sided = PENGUIN_RECIPE.snapshots.sided!;
    const leftTipX = named(sided, 'RIGHT')[0];
    const rightTipX = named(sided, 'L')[0];
    expect(leftTipX).toBeGreaterThan(0);
    expect(rightTipX).toBeLessThan(0);
    expect(leftTipX).toBeCloseTo(overlap, 2);
    expect(rightTipX).toBeCloseTo(-overlap, 2);
    const sideLeft = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-left');
    const sideRight = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-side-right');
    expect(sideLeft?.hinge.p0[0]).toBeCloseTo(-sideCrease, 4);
    expect(sideLeft?.hinge.p1[0]).toBeCloseTo(-sideCrease, 4);
    expect(sideRight?.hinge.p0[0]).toBeCloseTo(sideCrease, 4);
    expect(sideRight?.hinge.p1[0]).toBeCloseTo(sideCrease, 4);
    expect(sideCrease).toBeLessThan(0.5 * PENGUIN_R);
    expect(PENGUIN_RECIPE.steps.some((step) => step.id === 'penguin-wing-left' || step.id === 'penguin-wing-right')).toBe(false);
    expect(PENGUIN_RECIPE.steps.some((step) => step.title === 'Shape the wing tips')).toBe(false);
    expect(PENGUIN_RECIPE.creases?.some((crease) => crease.id.startsWith('penguin-wing'))).toBe(false);

    const leftFlap = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-flap-left');
    const rightFlap = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-flap-right');
    expect(leftFlap?.fromSnapshotId).toBe('flap-ready');
    expect(rightFlap?.fromSnapshotId).toBe('flap-ready');
    expect(leftFlap?.parallelGroup).toBe('penguin-flaps');
    expect(leftFlap?.instruction).toBe('Fold both flaps outward past the body.');
    const leftCrease = Math.abs(leftFlap?.hinge.p0[0] ?? 0);
    const rightCrease = Math.abs(rightFlap?.hinge.p0[0] ?? 0);
    expect(leftCrease).toBeGreaterThan(sideCrease * PENGUIN_WING_OPEN_FRAC * 0.7);
    expect(leftCrease).toBeLessThan(sideCrease - 0.004);
    expect(Math.abs((sideLeft?.hinge.p0[0] ?? 0) - (leftFlap?.hinge.p0[0] ?? 0))).toBeGreaterThan(0.004);
    expect(rightCrease).toBeCloseTo(leftCrease, 3);
    expect(leftFlap?.creaseLineLocal[0][0]).toBeCloseTo(leftFlap?.hinge.p0[0] ?? 0, 4);
    expect(leftFlap?.creaseLineLocal[1][0]).toBeCloseTo(leftFlap?.hinge.p1[0] ?? 0, 4);
    for (const [step, hint, sign] of [
      [leftFlap, flaps.named?.RIGHT, -1],
      [rightFlap, flaps.named?.L, 1],
    ] as const) {
      const moved = deformByHinge(flaps, step!.hinge, -180, hint);
      expect(moved.movingVertexIds.size).toBeGreaterThan(0);
      const originals = [...new Set([...moved.movingFaceIds].map((id) => id.split(':')[0] ?? id))].sort();
      expect(originals).toEqual(sign < 0 ? ['bot-right', 'top-right'] : ['bot-left', 'top-left']);
      const crease = Math.abs(step!.hinge.p0[0]);
      const landed = [...moved.movingVertexIds].map((index) => moved.snapshot.vertices[index]!);
      expect(Math.max(...landed.map((point) => Math.abs(point[0])))).toBeGreaterThan(sideCrease + 0.02);
      for (const point of landed) {
        expect(Math.abs(point[0])).toBeGreaterThan(crease - 0.001);
        expect(Math.abs(point[0])).toBeLessThanOrEqual(PENGUIN_R + 0.004);
        expect(Math.sign(point[0])).toBe(sign);
      }
    }
    const leftFlapMid = ((leftFlap?.hinge.p0[0] ?? 0) + leftTipX) / 2;
    const rightSample = ((rightFlap?.hinge.p0[0] ?? 0) + rightTipX) / 2;
    expect(sampleHitsRegion([leftFlapMid, 0, 0.01], leftFlap!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([rightSample, 0, 0.01], rightFlap!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([-sideCrease - 0.02, 0.01, 0.01], leftFlap!.movingRegion, PAPER_SIZE_M)).toBe(false);
    expect(sampleHitsRegion([sideCrease + 0.02, 0.01, 0.01], rightFlap!.movingRegion, PAPER_SIZE_M)).toBe(false);
    expect(topFaceAt(opened, -0.06, 0)?.tone).toBe('front');
    expect(topFaceAt(opened, 0.06, 0)?.tone).toBe('front');
    const openedOutline = opened.outline ?? [];
    expect(Math.min(...openedOutline.map((point) => point[0]))).toBeLessThan(-sideCrease - 0.02);
    expect(Math.max(...openedOutline.map((point) => point[0]))).toBeGreaterThan(sideCrease + 0.02);
    expect(Math.abs(named(opened, 'L')[0])).toBeGreaterThan(sideCrease + 0.02);
    expect(Math.abs(named(opened, 'RIGHT')[0])).toBeGreaterThan(sideCrease + 0.02);
    expect(named(opened, 'L')[0] * named(opened, 'RIGHT')[0]).toBeLessThan(0);
    expect(named(opened, 'T')[1]).toBeCloseTo(PENGUIN_R, 3);
    expect(topFaceAt(opened, -0.1, 0)?.tone).toBe('front');
    expect(topFaceAt(opened, 0.1, 0)?.tone).toBe('front');
    expect(topFaceAt(opened, 0, 0.08)?.tone).toBe('back');
    expect(named(beaked, 'L')[0]).toBeCloseTo(named(opened, 'L')[0], 3);
    expect(named(beaked, 'RIGHT')[0]).toBeCloseTo(named(opened, 'RIGHT')[0], 3);
    expect(topFaceAt(beaked, -0.1, 0)?.tone).toBe('front');
    expect(topFaceAt(beaked, 0.1, 0)?.tone).toBe('front');
    expect(named(beaked, 'T')[1]).toBeLessThan(named(opened, 'T')[1] - 0.03);

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 16 && engine.currentStep?.id !== 'penguin-flap-right'; guard += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('penguin-flap-right');
    const liveRight = engine.fromSnapshot!;
    const rightStep = engine.currentStep!;
    expect(hingeFoldTravelM(rightStep, liveRight, rightStep.targetAngleDeg)).toBeGreaterThan(0.02);
    const flat = deformFoldSnapshot(rightStep, liveRight, engine.toSnapshot!, 0);
    const openedRight = deformFoldSnapshot(rightStep, liveRight, engine.toSnapshot!, 90);
    const moved = flat.vertices.some((point, index) => {
      const next = openedRight.vertices[index];
      return next != null && Math.hypot(next[0] - point[0], next[1] - point[1], next[2] - point[2]) > 0.01;
    });
    expect(moved).toBe(true);
    const rightFlapMid = ((rightFlap?.hinge.p0[0] ?? 0) + rightTipX) / 2;
    engine.beginGrab([rightFlapMid, 0, 0.02]);
    expect(engine.currentStep?.id).toBe('penguin-flap-right');
    const drag = rightStep.arrowPathLocal.at(-1)!;
    engine.updateFold(drag, false, 400);
    expect(engine.angle).toBeGreaterThan(20);
    const dragging = deformFoldSnapshot(engine.currentStep!, engine.fromSnapshot!, engine.toSnapshot!, engine.angle);
    const dragMoved = engine.fromSnapshot!.vertices.some((point, index) => {
      const next = dragging.vertices[index];
      return next != null && Math.hypot(next[0] - point[0], next[1] - point[1], next[2] - point[2]) > 0.008;
    });
    expect(dragMoved).toBe(true);
    expect(engine.isStepCommitted('penguin-flap-right')).toBe(false);
    commitCurrent(engine);
    expect(engine.isStepCommitted('penguin-flap-right')).toBe(true);
    expect(engine.isGeometryVerified('penguin-flap-right')).toBe(true);
    expect(engine.currentStep?.id).not.toBe('penguin-flap-right');

    for (let guard = engine.completedStepIds().length; guard < 16 && engine.currentStep?.id !== 'penguin-beak'; guard += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('penguin-beak');
    expect(engine.currentStep?.fromSnapshotId).toBe('opened');
    expect(engine.currentStep?.progressStage).toBe(7);
    expect(engine.progress()).toMatchObject({ committedCount: 6, totalSteps: 8, activeIndex: 6 });
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('penguin-decorate');
    expect(engine.currentStep?.progressStage).toBe(8);
    expect(engine.progress()).toMatchObject({ committedCount: 7, totalSteps: 8, activeIndex: 7 });
    commitCurrent(engine);
    expect(engine.currentStep).toBeNull();
    expect(engine.progress()).toMatchObject({ committedCount: 8, totalSteps: 8, activeIndex: null });
    engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 8, activeIndex: 0 });
  });

  it('shapes the beak from the small top flap and shows eyes only at the last step', () => {
    const beak = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-beak');
    expect(beak?.progressStage).toBe(7);
    expect(beak?.fromSnapshotId).toBe('opened');
    expect(beak?.hinge.p0[1]).toBeCloseTo(PENGUIN_BEAK_FRAC * PENGUIN_R);
    expect(beak?.hinge.p0[1]).toBeGreaterThan(0.7 * PENGUIN_R);
    expect(Math.abs(beak?.hinge.p0[0] ?? 1)).toBeLessThan(0.05);
    const opened = PENGUIN_RECIPE.snapshots.opened!;
    const beaked = PENGUIN_RECIPE.snapshots.beaked!;
    expect(named(beaked, 'T')[1]).toBeLessThan(named(opened, 'T')[1] - 0.03);
    expect(named(beaked, 'T')[1]).toBeGreaterThan(0.4 * PENGUIN_R);
    const decor = PENGUIN_RECIPE.steps.find((step) => step.id === 'penguin-decorate');
    expect(decor?.progressStage).toBe(8);
    expect(decor?.actionType).toBe('crease-press');
    expect(PENGUIN_RECIPE.steps.filter((step) => step.progressStage === 8)).toHaveLength(1);
    expect(PENGUIN_RECIPE.steps.every((step) => step.progressStage !== 8 || step.id === 'penguin-decorate')).toBe(true);

    const creature = new PenguinCreature();
    expect(creature.active).toBe(false);
    creature.setReveal(0);
    creature.present(creature.group, true);
    expect(creature.group.getObjectByName('penguin-features')?.visible).toBe(false);
    creature.setReveal(1);
    expect(creature.group.getObjectByName('penguin-eyes')).toBeTruthy();
    expect(creature.group.getObjectByName('penguin-features')?.visible).toBe(true);
  });

  it('shows the white belly as the paper back and clears the turn on restart', () => {
    const finished = PENGUIN_RECIPE.snapshots.penguin!;
    const belly = topFaceAt(finished, 0, 0.05);
    expect(belly?.tone).toBe('back');
    expect(belly?.materialId).toBe('front');
    expect(finished.faces.every((face) => face.materialId === 'front')).toBe(true);

    const engine = new OrigamiEngine(PENGUIN_RECIPE, PENGUIN_NAMED);
    for (let guard = 0; guard < 12 && !engine.currentStep?.id.startsWith('penguin-side'); guard += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id.startsWith('penguin-side')).toBe(true);
    engine.reset(PENGUIN_RECIPE, PENGUIN_NAMED);
    expect(engine.currentStep?.id).toBe('penguin-vertical-fold');
    expect(engine.currentStep?.fromSnapshotId).toBe('diamond');
    expect(PENGUIN_NAMED.L?.[0] ?? 0).toBeLessThan(0);
  });
});
