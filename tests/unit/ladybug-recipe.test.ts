import { describe, expect, it, vi } from 'vitest';

function installCanvasStub(): void {
  const gradient = { addColorStop() {} };
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => gradient;
          }
          if (prop === 'measureText') {
            return () => ({ width: 12 });
          }
          if (prop === 'canvas') {
            return document.createElement('canvas');
          }
          return () => {};
        },
        set() {
          return true;
        },
      },
    ) as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

installCanvasStub();
import { Group, Vector3 } from 'three';
import { grabAdjustedAngle } from '../../src/origami/CreaseSolver.ts';
import { deformByHinge } from '../../src/origami/MeshSplitter.ts';
import { FOLD_ASSIST } from '../../src/origami/foldAssist.ts';
import { sampleHitsRegion } from '../../src/input/GrabRegionMath.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import type { FaceDefinition, MeshSnapshot, Vec3 } from '../../src/origami/types.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import { TURTLE_RECIPE } from '../../src/origami/recipes/turtle.recipe.ts';
import { DINOSAUR_RECIPE } from '../../src/origami/recipes/dinosaur.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { silhouetteErrorM } from '../../src/origami/FoldValidator.ts';
import {
  LADYBUG_BACK_COLOR,
  LADYBUG_BOTTOM_CREASE_FRAC,
  LADYBUG_EDGE_COLOR,
  LADYBUG_EYES,
  LADYBUG_HEAD_CREASE_FRAC,
  LADYBUG_MARK_COLOR,
  LADYBUG_NAMED,
  LADYBUG_PAPER_COLOR,
  LADYBUG_RECIPE,
  LADYBUG_SIDE_CREASE_FRAC,
  LADYBUG_SPOTS,
  LADYBUG_STEPS,
  LADYBUG_TIP_CREASE_FRAC,
  LADYBUG_TIP_HIT_RADIUS_M,
  LADYBUG_TIP_POINT,
  LADYBUG_TIP_TARGET_LIFT_M,
  LADYBUG_TOP_CREASE_FRAC,
} from '../../src/origami/recipes/ladybug.recipe.ts';
import { LadybugPinch } from '../../src/origami/LadybugPinch.ts';
import { LadybugTipTarget } from '../../src/origami/LadybugTipTarget.ts';
import { LadybugCreature } from '../../src/animation/LadybugCreature.ts';
import { PaperStage } from '../../src/origami/PaperStage.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

const R = (0.2 / 2) * Math.SQRT2;

function drain(engine: OrigamiEngine): void {
  for (let i = 0; i < 80; i += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  drain(engine);
}

function maxLayer(id: string): number {
  const snap = LADYBUG_RECIPE.snapshots[id];
  return snap?.faces.reduce((max, face) => Math.max(max, face.layer), 0) ?? -1;
}

function faceWindZ(vertices: Vec3[], face: FaceDefinition): number {
  let z = 0;
  for (let i = 0; i < face.vertices.length; i += 1) {
    const current = vertices[face.vertices[i] ?? -1];
    const next = vertices[face.vertices[(i + 1) % face.vertices.length] ?? -1];
    if (!current || !next) {
      continue;
    }
    z += (current[0] - next[0]) * (current[1] + next[1]);
  }
  return z;
}

function faceContains(vertices: Vec3[], face: FaceDefinition, x: number, y: number): boolean {
  const points = face.vertices.map((index) => vertices[index]).filter((point): point is Vec3 => !!point);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) {
      continue;
    }
    const crosses = a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1] + 1e-12) + a[0];
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/** Highest layer first. Negative wind is the red front; positive wind is the ivory back. */
function coversAt(snapshot: MeshSnapshot, x: number, y: number): Array<{ layer: number; wind: number }> {
  return snapshot.faces
    .filter((face) => faceContains(snapshot.vertices, face, x, y))
    .map((face) => ({ layer: face.layer, wind: faceWindZ(snapshot.vertices, face) }))
    .sort((a, b) => b.layer - a.layer);
}

describe('origami ladybug recipe', () => {
  it('is a valid seven-step recipe and leaves the other animals alone', () => {
    expect(LADYBUG_PAPER_COLOR).toBe('#F45132');
    const paper = origamiPaperMaterial(LADYBUG_PAPER_COLOR);
    expect(paper.backColor).toBe(LADYBUG_BACK_COLOR.toLowerCase());
    expect(paper.edgeColor).toBe(LADYBUG_EDGE_COLOR.toLowerCase());
    expect(LADYBUG_MARK_COLOR).toBe('#2B1714');
    expect(validateRecipe(LADYBUG_RECIPE)).toEqual([]);
    expect(LADYBUG_STEPS).toEqual([
      'Create center creases',
      'Fold the top corner',
      'Fold the head flap',
      'Shape the head detail',
      'Fold upper corners',
      'Round the body',
      'Bring it to life',
    ]);
    expect(progressFromRecipe(LADYBUG_RECIPE).totalSteps).toBe(7);
    expect(LADYBUG_RECIPE.steps.map((step) => step.title)).toEqual([
      'Create center creases',
      'Create center creases',
      'Create center creases',
      'Create center creases',
      'Fold the top corner',
      'Fold the head flap',
      'Shape the head detail',
      'Fold upper corners',
      'Fold upper corners',
      'Round the body',
      'Round the body',
      'Round the body',
      'Bring it to life',
    ]);
    expect(LADYBUG_RECIPE.steps[0]?.instruction).toBe('Fold along both center lines, then unfold.');
    expect(LADYBUG_RECIPE.steps[4]?.instruction).toBe('Fold the top corner downward.');
    expect(LADYBUG_RECIPE.steps[5]?.instruction).toBe('Fold the small tip upward.');
    expect(LADYBUG_RECIPE.steps[6]?.instruction).toBe('Fold the small center tip upward.');
    expect(LADYBUG_RECIPE.steps[7]?.instruction).toBe('Fold the upper corners inward.');
    expect(LADYBUG_RECIPE.steps[9]?.instruction).toBe('Fold the side and bottom tips inward.');
    expect(LADYBUG_RECIPE.steps.at(-1)?.instruction).toBe('Pinch to bring your ladybug to life!');
    expect(LADYBUG_RECIPE.steps.at(-1)?.actionType).toBe('crease-press');
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    expect(OWL_RECIPE.steps[0]?.id).toBe('owl-vertical-fold');
    expect(TURTLE_RECIPE.steps[0]?.id).toBe('turtle-diag-a-fold');
    expect(DINOSAUR_RECIPE.steps[0]?.id).toBe('dino-triangle');
    for (const step of LADYBUG_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
      expect(step.hinge.p0).not.toEqual(step.hinge.p1);
    }
  });

  it('keeps one progress step until every crease in a multi-fold is done', () => {
    const engine = new OrigamiEngine(LADYBUG_RECIPE, LADYBUG_NAMED);
    expect(engine.currentStep?.id).toBe('ladybug-horizontal-fold');
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 7, activeIndex: 0, subFoldTotal: 4 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-horizontal-open');
    expect(engine.progress()).toMatchObject({ committedCount: 0, activeIndex: 0, subFold: 2, subFoldTotal: 4 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-vertical-fold');
    expect(engine.progress()).toMatchObject({ committedCount: 0, activeIndex: 0 });
    expect(engine.lockedCreases.map((crease) => crease.id)).toEqual(['ladybug-horizontal']);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-vertical-open');
    expect(engine.progress()).toMatchObject({ committedCount: 0, activeIndex: 0, subFold: 4, subFoldTotal: 4 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-top');
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 7, activeIndex: 1 });
    expect(engine.lockedCreases.map((crease) => crease.id).sort()).toEqual(['ladybug-horizontal', 'ladybug-vertical']);
    expect(engine.fromSnapshot?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(0.1);
    expect(engine.fromSnapshot?.named?.B?.[1]).toBeLessThan(-0.1);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-tip');
    expect(engine.progress()).toMatchObject({ committedCount: 2, activeIndex: 2 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-head');
    expect(engine.progress()).toMatchObject({ committedCount: 3, activeIndex: 3 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-corner-left');
    expect(engine.progress()).toMatchObject({ committedCount: 4, activeIndex: 4, subFold: 1, subFoldTotal: 2 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-corner-right');
    expect(engine.progress()).toMatchObject({ committedCount: 4, activeIndex: 4, subFold: 2, subFoldTotal: 2 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-side-left');
    expect(engine.progress()).toMatchObject({ committedCount: 5, activeIndex: 5, subFold: 1, subFoldTotal: 3 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-side-right');
    expect(engine.progress()).toMatchObject({ committedCount: 5, activeIndex: 5, subFold: 2, subFoldTotal: 3 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-bottom');
    expect(engine.progress()).toMatchObject({ committedCount: 5, activeIndex: 5, subFold: 3, subFoldTotal: 3 });

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('ladybug-decorate');
    expect(engine.progress()).toMatchObject({ committedCount: 6, activeIndex: 6 });
    expect(LADYBUG_EYES).toHaveLength(2);
    expect(LADYBUG_SPOTS).toHaveLength(5);
    expect(LADYBUG_RECIPE.steps.slice(0, -1).every((step) => step.actionType !== 'crease-press')).toBe(true);
  });

  it('folds a small head tip, symmetric corners, and an octagonal body', () => {
    expect(LADYBUG_TOP_CREASE_FRAC).toBeGreaterThan(1 / 3);
    expect(LADYBUG_TOP_CREASE_FRAC).toBeLessThan(0.5);
    const topped = LADYBUG_RECIPE.snapshots.topped;
    const tipY = topped?.named?.T?.[1] ?? 0;
    expect(tipY).toBeCloseTo((2 * LADYBUG_TOP_CREASE_FRAC - 1) * R, 4);
    expect(topped?.named?.L?.[0]).toBeCloseTo(-R, 4);
    expect(topped?.named?.RIGHT?.[0]).toBeCloseTo(R, 4);
    expect(topped?.named?.B?.[1]).toBeCloseTo(-R, 4);
    const topCrease = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-top')?.hinge;
    expect(topCrease?.p0[1]).toBeCloseTo(LADYBUG_TOP_CREASE_FRAC * R, 4);
    expect(topCrease?.p0[1]).toBe(topCrease?.p1[1]);

    const tipped = LADYBUG_RECIPE.snapshots.tipped;
    const headTip = tipped?.named?.T?.[1] ?? 0;
    const flapHeight = LADYBUG_TOP_CREASE_FRAC * R - tipY;
    const tipTravel = Math.abs(headTip - tipY);
    expect(LADYBUG_TIP_CREASE_FRAC).toBeLessThan(0);
    expect(LADYBUG_TIP_CREASE_FRAC).toBeGreaterThan(tipY / R);
    expect(tipTravel).toBeLessThan(flapHeight * 0.2);
    expect(tipTravel).toBeGreaterThan(0);
    expect(headTip).toBeLessThan(LADYBUG_HEAD_CREASE_FRAC * R);
    expect(tipped?.named?.B?.[1]).toBeCloseTo(-R, 4);
    expect(tipped?.named?.L?.[0]).toBeCloseTo(-R, 4);
    const tipHinge = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-tip')?.hinge;
    expect(Math.abs((tipHinge?.p0[0] ?? 0) - (tipHinge?.p1[0] ?? 0))).toBeLessThan(0.5 * R);

    const headed = LADYBUG_RECIPE.snapshots.headed;
    expect(headed?.named?.B?.[1]).toBeCloseTo(-R, 4);
    expect(headed?.named?.L?.[0]).toBeCloseTo(-R, 4);
    expect(headed?.named?.T?.[1]).toBeGreaterThan(headTip);
    expect(LADYBUG_HEAD_CREASE_FRAC).toBeGreaterThan(LADYBUG_TIP_CREASE_FRAC);
    expect(LADYBUG_HEAD_CREASE_FRAC).toBeLessThan(LADYBUG_TOP_CREASE_FRAC);

    const left = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-corner-left')?.hinge;
    const right = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-corner-right')?.hinge;
    const mirrorKey = (point: { 0: number; 1: number } | undefined) =>
      `${(-(point?.[0] ?? 0)).toFixed(5)},${(point?.[1] ?? 0).toFixed(5)}`;
    const pointKey = (point: { 0: number; 1: number } | undefined) =>
      `${(point?.[0] ?? 0).toFixed(5)},${(point?.[1] ?? 0).toFixed(5)}`;
    expect([mirrorKey(left?.p0), mirrorKey(left?.p1)].sort()).toEqual([pointKey(right?.p0), pointKey(right?.p1)].sort());
    const cornered = LADYBUG_RECIPE.snapshots.cornered;
    const cornerBounds = snapshotBounds(cornered!);
    expect(Math.abs(cornerBounds.minX + cornerBounds.maxX)).toBeLessThan(0.004);

    const sideLeft = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-side-left')?.hinge;
    const sideRight = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-side-right')?.hinge;
    expect(sideLeft?.p0[0]).toBeCloseTo(-LADYBUG_SIDE_CREASE_FRAC * R, 4);
    expect(sideRight?.p0[0]).toBeCloseTo(LADYBUG_SIDE_CREASE_FRAC * R, 4);
    expect(sideLeft?.p0[0]).toBeCloseTo(-(sideRight?.p0[0] ?? 0), 5);

    const body = LADYBUG_RECIPE.snapshots.ladybug;
    expect(body?.named?.L?.[0] ?? 0).toBeGreaterThan(-R + 0.02);
    expect(body?.named?.L?.[0] ?? 0).toBeLessThan(-0.02);
    const bounds = snapshotBounds(body!);
    expect(bounds.minY).toBeGreaterThan(-R + 0.02);
    expect(bounds.maxY).toBeLessThan(R - 0.02);
    expect(bounds.maxX).toBeLessThan(R - 0.02);
    expect(bounds.minX).toBeGreaterThan(-R + 0.02);
    expect(Math.abs(bounds.minX + bounds.maxX)).toBeLessThan(0.004);
    expect(bounds.maxY).toBeGreaterThan(LADYBUG_HEAD_CREASE_FRAC * R);
    expect(body?.faces.length).toBeGreaterThan(8);
    expect(new Set(body?.faces.map((face) => face.layer)).size).toBeGreaterThan(2);
    expect(maxLayer('ladybug')).toBeLessThan(16);
    const error = silhouetteErrorM(body?.vertices ?? [], LADYBUG_RECIPE.finalSilhouette ?? []);
    expect(error).toBeLessThanOrEqual(LADYBUG_RECIPE.silhouetteToleranceM ?? 0.045);
    const bottom = LADYBUG_RECIPE.steps.find((step) => step.id === 'ladybug-bottom')?.hinge;
    expect(bottom?.p0[1]).toBeCloseTo(LADYBUG_BOTTOM_CREASE_FRAC * R, 4);
  });

  it('tucks step 4 behind the upper band and keeps that red triangle through step 5', () => {
    const headed = LADYBUG_RECIPE.snapshots.headed;
    const cornered = LADYBUG_RECIPE.snapshots.cornered;
    expect(headed).toBeTruthy();
    expect(cornered).toBeTruthy();
    const band = coversAt(headed!, 0, 0.24 * R);
    const bandSide = coversAt(headed!, 0.2 * R, 0.24 * R);
    expect(band[0]?.wind ?? 0).toBeGreaterThan(0);
    expect(bandSide[0]?.wind ?? 0).toBeGreaterThan(0);
    expect(band[0]?.layer).toBe(bandSide[0]?.layer);

    const detail = coversAt(headed!, 0, 0.05 * R);
    const ivoryUnderDetail = detail.find((face) => face.wind > 0);
    expect(detail[0]?.wind ?? 0).toBeLessThan(0);
    expect(ivoryUnderDetail).toBeTruthy();
    expect(detail[0]!.layer).toBeGreaterThan(ivoryUnderDetail!.layer);
    expect(headed?.named?.T?.[1] ?? 0).toBeGreaterThan(0.12 * R);
    expect(headed?.named?.T?.[1] ?? 0).toBeLessThan(LADYBUG_TOP_CREASE_FRAC * R);

    const afterCorners = coversAt(cornered!, 0, 0.05 * R);
    expect(afterCorners[0]?.wind ?? 0).toBeLessThan(0);
    expect(afterCorners[0]!.layer).toBeGreaterThan(afterCorners.find((face) => face.wind > 0)?.layer ?? 99);
    const left = coversAt(cornered!, -0.06 * R, 0.02 * R);
    const right = coversAt(cornered!, 0.06 * R, 0.02 * R);
    expect(left[0]?.wind ?? 0).toBeLessThan(0);
    expect(right[0]?.wind ?? 1).toBeLessThan(0);
    expect(left[0]?.layer).toBe(right[0]?.layer);

    const finished = coversAt(LADYBUG_RECIPE.snapshots.ladybug!, 0, 0.05 * R);
    expect(finished[0]?.wind ?? 0).toBeLessThan(0);
    const finishedBand = coversAt(LADYBUG_RECIPE.snapshots.ladybug!, 0, 0.24 * R);
    expect(finishedBand[0]?.wind ?? 0).toBeGreaterThan(0);
  });

  it('reveals two eyes and five spots only when the ladybug comes to life', () => {
    expect(LADYBUG_SPOTS.filter((spot) => Math.abs(spot.at[0]) < 0.001)).toHaveLength(1);
    const center = LADYBUG_SPOTS.find((spot) => Math.abs(spot.at[0]) < 0.001);
    const wing = LADYBUG_SPOTS.find((spot) => spot.at[0] < -0.01);
    expect((center?.radius ?? 0) > (wing?.radius ?? 1)).toBe(true);
    expect((center?.at[1] ?? 0) < (LADYBUG_SPOTS[0]?.at[1] ?? 0)).toBe(true);

    const pinch = new LadybugPinch();
    const host = new Group();
    pinch.attach(host);
    pinch.sync('ladybug-top');
    expect(pinch.visualState).toBe('hidden');
    expect(pinch.begin()).toBe(false);
    pinch.sync('ladybug-decorate');
    pinch.tick(300);
    expect(pinch.visualState).toBe('ready');
    expect(pinch.begin()).toBe(true);
    pinch.tick(1200);
    expect(pinch.visualState).toBe('done');
    expect(pinch.consumeCommit()).toBe(true);

    const creature = new LadybugCreature();
    expect(creature.active).toBe(false);
    creature.setReveal(0);
    creature.present(host, true);
    expect(host.getObjectByName('ladybug-features')?.visible).toBe(false);
    creature.setReveal(1);
    expect(host.getObjectByName('ladybug-features')?.visible).toBe(true);
    const spots = host.getObjectByName('ladybug-spots');
    const eyes = host.getObjectByName('ladybug-eyes');
    expect(spots?.children).toHaveLength(5);
    expect(eyes?.children).toHaveLength(2);
    expect(host.getObjectByName('ladybug-seam')).toBeTruthy();
  });

  it('restarts to a fresh red diamond', () => {
    const engine = new OrigamiEngine(LADYBUG_RECIPE, LADYBUG_NAMED);
    for (let count = 0; count < 8; count += 1) {
      commitCurrent(engine);
    }
    expect(engine.isStepCommitted('ladybug-top')).toBe(true);
    engine.reset(LADYBUG_RECIPE, LADYBUG_NAMED);
    expect(engine.currentStep?.id).toBe('ladybug-horizontal-fold');
    expect(engine.isStepCommitted('ladybug-top')).toBe(false);
    expect(engine.isStepCommitted('ladybug-decorate')).toBe(false);
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.fromSnapshot?.vertices).toHaveLength(5);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(0.1);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 7, activeIndex: 0 });

    const stage = new PaperStage();
    stage.loadAnimal('ladybug');
    stage.prepareLadybugStep(4);
    expect(stage.engine.currentStep?.progressStage).toBe(4);
    stage.ladybugCreature.start(new Vector3(), stage.getPaperRoot());
    stage.restartOrigamiSession(null);
    expect(stage.activeAnimal).toBe('ladybug');
    expect(stage.engine.currentStep?.id).toBe('ladybug-horizontal-fold');
    expect(stage.engine.lockedCreases).toEqual([]);
    expect(stage.ladybugCreature.active).toBe(false);
    expect(stage.engine.fromSnapshot?.named?.L?.[0]).toBeLessThan(-0.1);
    stage.dispose();
  });

  it('folds only the head tip on a horizontal crease and commits at the snap threshold', () => {
    const step = LADYBUG_RECIPE.steps.find((entry) => entry.id === 'ladybug-tip');
    const topped = LADYBUG_RECIPE.snapshots.topped;
    const tipped = LADYBUG_RECIPE.snapshots.tipped;
    expect(step).toBeTruthy();
    expect(topped).toBeTruthy();
    expect(tipped).toBeTruthy();
    const hinge = step!.hinge;
    expect(hinge.p0[1]).toBeCloseTo(hinge.p1[1], 6);
    expect(Math.abs(hinge.p0[0] - hinge.p1[0])).toBeGreaterThan(0.02);
    expect(hinge.p0[2]).toBeCloseTo(0, 6);
    expect(hinge.p1[2]).toBeCloseTo(0, 6);
    expect(hinge.angleHint?.[1] ?? 0).toBeLessThan(hinge.p0[1]);
    expect(hinge.angleHint?.[0] ?? 1).toBeCloseTo(0, 5);

    const moved = deformByHinge(topped!, hinge, -180, topped!.named?.T);
    expect(moved.movingVertexIds.size).toBe(1);
    const tipIndex = [...moved.movingVertexIds][0] ?? -1;
    const before = topped!.vertices[tipIndex];
    const after = moved.snapshot.vertices[tipIndex];
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after![1]).toBeGreaterThan(before![1]);
    expect(after![1]).toBeCloseTo(tipped!.named?.T?.[1] ?? 0, 5);
    for (let index = 0; index < topped!.vertices.length; index += 1) {
      if (moved.movingVertexIds.has(index)) {
        continue;
      }
      const rest = topped!.vertices[index];
      const next = moved.snapshot.vertices[index];
      expect(rest).toBeTruthy();
      expect(next?.[0]).toBeCloseTo(rest![0], 5);
      expect(next?.[1]).toBeCloseTo(rest![1], 5);
    }
    for (const id of moved.movingFaceIds) {
      expect(id.startsWith('top-')).toBe(true);
      expect(id.startsWith('bot-')).toBe(false);
    }

    const tip = topped!.named?.T;
    expect(tip).toBeTruthy();
    const tipPoint = tip ?? [0, 0, 0];
    expect(LADYBUG_TIP_HIT_RADIUS_M).toBeGreaterThan(0.012);
    expect(LADYBUG_TIP_HIT_RADIUS_M).toBeLessThan(0.03);
    expect(LADYBUG_TIP_TARGET_LIFT_M).toBeGreaterThan(0.004);
    expect(sampleHitsRegion(tipPoint, step!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([tipPoint[0], tipPoint[1] + 0.012, 0.004], step!.movingRegion, PAPER_SIZE_M)).toBe(true);
    expect(sampleHitsRegion([0, 0, 0], step!.movingRegion, PAPER_SIZE_M)).toBe(false);
    expect(sampleHitsRegion([0, -0.1, 0], step!.movingRegion, PAPER_SIZE_M)).toBe(false);
    expect(sampleHitsRegion([tipPoint[0], tipPoint[1], -0.05], step!.movingRegion, PAPER_SIZE_M)).toBe(false);

    const above: [number, number, number] = [0, tipPoint[1] + 0.012, 0.004];
    const half = PAPER_SIZE_M / 2;
    const short = grabAdjustedAngle([above[0], above[1] + 0.001, above[2]], above, 0, 0, 180, half, hinge);
    expect(short / 180).toBeGreaterThan(0);
    expect(short / 180).toBeLessThan(FOLD_ASSIST.autoSnapThreshold);
    const folded = grabAdjustedAngle([above[0], above[1] + 0.008, above[2]], above, 0, 0, 180, half, hinge);
    expect(folded / 180).toBeGreaterThanOrEqual(FOLD_ASSIST.autoSnapThreshold);

    const engine = new OrigamiEngine(LADYBUG_RECIPE, LADYBUG_NAMED);
    for (let count = 0; count < 5; count += 1) {
      commitCurrent(engine);
    }
    expect(engine.currentStep?.id).toBe('ladybug-tip');
    engine.beginGrab(above);
    engine.updateFold([above[0], above[1] + 0.001, above[2]], false, 16);
    expect(engine.foldCompletion).toBeLessThan(FOLD_ASSIST.autoSnapThreshold);
    expect(engine.release().ok).toBe(false);
    drain(engine);
    expect(engine.currentStep?.id).toBe('ladybug-tip');
    expect(engine.isStepCommitted('ladybug-tip')).toBe(false);
    expect(engine.angle).toBeCloseTo(0, 5);

    engine.beginGrab(above);
    engine.updateFold([above[0], above[1] + 0.008, above[2]], false, 16);
    expect(engine.foldCompletion).toBeGreaterThanOrEqual(FOLD_ASSIST.autoSnapThreshold);
    if (engine.enginePhase === 'folding') {
      expect(engine.release().ok).toBe(true);
    }
    drain(engine);
    expect(engine.isStepCommitted('ladybug-tip')).toBe(true);
    expect(engine.currentStep?.id).toBe('ladybug-head');
    expect(engine.currentStep?.fromSnapshotId).toBe('tipped');
    expect(engine.fromSnapshot).toBe(tipped);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(topped!.named?.T?.[1] ?? 0);
    expect(engine.fromSnapshot?.named?.B?.[1]).toBeCloseTo(-R, 4);
    expect(engine.fromSnapshot?.named?.L?.[0]).toBeCloseTo(-R, 4);

    engine.reset(LADYBUG_RECIPE, LADYBUG_NAMED);
    expect(engine.currentStep?.id).toBe('ladybug-horizontal-fold');
    expect(engine.isStepCommitted('ladybug-tip')).toBe(false);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(0.1);

    const host = new Group();
    const target = new LadybugTipTarget();
    target.attach(host);
    host.updateWorldMatrix(true, true);
    expect(target.isActive).toBe(false);
    expect(target.raycast(new Vector3(0, LADYBUG_TIP_POINT[1], 0.4), new Vector3(0, 0, -1))).toBeNull();
    target.sync('ladybug-tip', LADYBUG_TIP_POINT);
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
      lines.push(String(message));
    });
    target.observe({
      stepId: 'ladybug-tip',
      angleDeg: 0,
      progress: 0,
      phase: 'idle',
      tipCommitted: false,
      hinge,
    });
    expect(lines.some((line) => line.startsWith('[ladybug-step3] active') && line.includes('mesh=ladybug-tip-flap'))).toBe(true);
    spy.mockImplementation(() => {});
    const onTip = new Vector3(LADYBUG_TIP_POINT[0], LADYBUG_TIP_POINT[1], 0.004);
    const behind = new Vector3(LADYBUG_TIP_POINT[0], LADYBUG_TIP_POINT[1], -0.02);
    const body = new Vector3(0, 0, 0.004);
    expect(target.contains(onTip)).toBe(true);
    expect(target.contains(behind)).toBe(false);
    expect(target.contains(body)).toBe(false);
    const hit = target.raycast(new Vector3(LADYBUG_TIP_POINT[0], LADYBUG_TIP_POINT[1], 0.4), new Vector3(0, 0, -1));
    expect(hit).toBeTruthy();
    expect(hit!.z).toBeGreaterThan(0.008);
    expect(target.raycast(new Vector3(0, 0, 0.4), new Vector3(0, 0, -1))).toBeNull();
    expect(target.meshId).toBe('ladybug-tip-flap');

    const stage = new PaperStage();
    stage.loadAnimal('ladybug');
    stage.prepareLadybugStep(3);
    expect(stage.engine.currentStep?.id).toBe('ladybug-tip');
    expect(stage.ladybugTip.isActive).toBe(true);
    stage.restartOrigamiSession(null);
    expect(stage.engine.currentStep?.id).toBe('ladybug-horizontal-fold');
    expect(stage.engine.isStepCommitted('ladybug-tip')).toBe(false);
    expect(stage.ladybugTip.isActive).toBe(false);
    stage.dispose();
    target.dispose();
  });

});
