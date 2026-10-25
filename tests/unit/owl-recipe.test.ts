import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { OwlCreature } from '../../src/animation/OwlCreature.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { buildPaperMesh } from '../../src/origami/paperDepth.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotArea, snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import {
  OWL_BACK_COLOR,
  OWL_BEAK_CREASE_Y,
  OWL_BEAK_HALF_X,
  OWL_BEAK_TIP,
  OWL_EDGE_COLOR,
  OWL_EYE_COLOR,
  OWL_EYE_X,
  OWL_EYE_Y,
  OWL_FOOT_X,
  OWL_FOOT_Y,
  OWL_NAMED,
  OWL_PAPER_COLOR,
  OWL_PUPIL_COLOR,
  OWL_RECIPE,
  OWL_STEPS,
} from '../../src/origami/recipes/owl.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { OwlPinch } from '../../src/origami/OwlPinch.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine): void {
  for (let i = 0; i < 50; i += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  drain(engine);
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

function topFaceToneAt(snapshot: MeshSnapshot, x: number, y: number): 'front' | 'back' | null {
  let best = -1;
  let found: 'front' | 'back' | null = null;
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
    found = nz >= 0 ? 'front' : 'back';
  }
  return found;
}

describe('origami owl recipe', () => {
  it('is a valid seven-stage recipe with brownish-orange exterior, warm white interior, and burnt orange edges', () => {
    expect(OWL_PAPER_COLOR).toBe('#C98245');
    expect(OWL_BACK_COLOR).toBe('#F7F2E9');
    expect(OWL_EDGE_COLOR).toBe('#98552F');
    const paper = origamiPaperMaterial(OWL_PAPER_COLOR);
    expect(paper.frontColor).toBe('#c98245');
    expect(paper.backColor).toBe('#f7f2e9');
    expect(paper.edgeColor).toBe('#98552f');
    expect(validateRecipe(OWL_RECIPE)).toEqual([]);
    expect(OWL_STEPS).toEqual([
      'guide-creases',
      'top-corner-down',
      'bottom-corner-up',
      'side-folds-inward',
      'body-shape',
      'beak-fold',
      'owl-decoration',
    ]);
    expect(progressFromRecipe(OWL_RECIPE).totalSteps).toBe(7);
    expect(OWL_RECIPE.steps.filter((step) => step.progressStage === 1).map((step) => step.id)).toEqual([
      'owl-vertical-fold',
      'owl-vertical-open',
      'owl-horizontal-fold',
      'owl-horizontal-open',
    ]);
    expect(OWL_RECIPE.steps.filter((step) => step.progressStage === 4).map((step) => step.id)).toEqual([
      'owl-side-left',
      'owl-side-right',
    ]);
    expect(OWL_RECIPE.steps.at(-2)?.id).toBe('owl-beak');
    expect(OWL_RECIPE.steps.at(-2)?.actionType).toBe('fold');
    expect(OWL_RECIPE.steps.at(-2)?.progressStage).toBe(6);
    expect(OWL_RECIPE.steps.at(-2)?.instruction).toBe("Pinch the small center flap and fold it down to shape the owl's beak.");
    expect(OWL_RECIPE.steps.at(-1)?.id).toBe('owl-decorate');
    expect(OWL_RECIPE.steps.at(-1)?.actionType).toBe('crease-press');
    expect(OWL_RECIPE.steps.at(-1)?.progressStage).toBe(7);
    expect(OWL_RECIPE.steps.at(-1)?.instruction).toBe('Pinch to bring your owl to life!');
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    for (const step of OWL_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
      expect(step.hinge.p0).not.toEqual(step.hinge.p1);
    }
  });

  it('creases the diamond, exposes white facial diagonals, keeps protruding lower corners in Step 5, and folds the beak in Step 6', () => {
    const engine = new OrigamiEngine(OWL_RECIPE, OWL_NAMED);
    expect(engine.currentStep?.id).toBe('owl-vertical-fold');
    expect(engine.currentStep?.extraCreaseLines?.length).toBe(1);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-vertical-open');
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(true);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 7, activeIndex: 0 });

    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-horizontal-open');
    commitCurrent(engine);

    const reopened = OWL_RECIPE.snapshots.diamond;
    expect(reopened?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(reopened?.named?.T?.[1]).toBeGreaterThan(0.1);
    expect(engine.currentStep?.id).toBe('owl-top');
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 7, activeIndex: 1 });
    expect(engine.lockedCreases.map((crease) => crease.id).sort()).toEqual(['owl-horizontal', 'owl-vertical']);

    commitCurrent(engine);
    const topped = OWL_RECIPE.snapshots.topped;
    const forehead = topped?.named?.T?.[1] ?? 0;
    expect(forehead).toBeGreaterThan(0.08);
    expect(forehead).toBeLessThan(0.11);
    expect(topped?.faces.some((face) => face.layer >= 1)).toBe(true);

    commitCurrent(engine);
    const raised = OWL_RECIPE.snapshots.raised;
    const belly = raised?.named?.B?.[1] ?? 0;
    expect(belly).toBeGreaterThan(forehead);
    expect(belly).toBeLessThan(0.12);
    expect(engine.currentStep?.id).toBe('owl-side-left');

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('owl-side-right');
    expect(engine.progress()).toMatchObject({ committedCount: 3, totalSteps: 7, activeIndex: 3 });
    expect(OWL_RECIPE.steps.find((step) => step.id === 'owl-side-left')?.hinge.id).toBe('owl-side-left');
    expect(OWL_RECIPE.steps.find((step) => step.id === 'owl-side-right')?.hinge.id).toBe('owl-side-right');

    commitCurrent(engine);
    const sided = OWL_RECIPE.snapshots.sided;
    expect(sided?.named?.L?.[0]).toBeGreaterThan(0);
    expect(sided?.named?.RIGHT?.[0]).toBeLessThan(0);
    const sidedBounds = snapshotBounds(sided!);
    expect(sidedBounds.maxY - sidedBounds.minY).toBeLessThan(sidedBounds.maxX - sidedBounds.minX + 0.03);

    // Step 5: Finish the body — bottom flap folds upward with lower left and right corners protruding below the main body edge
    expect(engine.currentStep?.id).toBe('owl-hem');
    commitCurrent(engine);
    const body = OWL_RECIPE.snapshots.body!;
    expect(body.named?.L?.[0]).toBeGreaterThan(0);
    expect(body.named?.RIGHT?.[0]).toBeLessThan(0);
    expect(snapshotArea(body)).toBeGreaterThan(0.006);
    const bounds = snapshotBounds(body);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    expect(width).toBeGreaterThan(0.1);
    expect(width).toBeLessThan(0.16);
    expect(height / width).toBeLessThan(1.15);
    expect(height / width).toBeGreaterThan(0.7);
    expect(new Set(body.faces.map((face) => face.layer)).size).toBeGreaterThan(2);
    const hemY = OWL_RECIPE.steps.find((step) => step.id === 'owl-hem')?.hinge.p0[1] ?? 0;
    expect(OWL_FOOT_Y).toBeLessThan(hemY);
    expect(body.named?.FOOT_L).toEqual([-OWL_FOOT_X, OWL_FOOT_Y, 0]);
    expect(body.named?.FOOT_R).toEqual([OWL_FOOT_X, OWL_FOOT_Y, 0]);
    expect(bounds.minY).toBeCloseTo(OWL_FOOT_Y, 5);
    expect(body.faces.some((face) => face.id.includes('hem-foot'))).toBe(true);

    // Step 6 (second-last step): Fold the beak interactively
    expect(engine.currentStep?.id).toBe('owl-beak');
    expect(engine.progress()).toMatchObject({ committedCount: 5, totalSteps: 7, activeIndex: 5 });
    const beakStep = OWL_RECIPE.steps.find((step) => step.id === 'owl-beak')!;
    expect(beakStep.hinge.p0[1]).toBeCloseTo(OWL_BEAK_CREASE_Y, 5);
    expect(Math.abs(beakStep.hinge.p0[0])).toBeCloseTo(OWL_BEAK_HALF_X, 5);
    commitCurrent(engine);

    const beaked = OWL_RECIPE.snapshots.beaked!;
    expect(beaked.named?.B?.[1]).toBeCloseTo(OWL_BEAK_TIP[1], 5);
    expect(beaked.named?.B?.[1]).toBeLessThan(OWL_BEAK_CREASE_Y);
    expect(beaked.named?.B?.[1]).toBeLessThan(belly);

    // Natural two-sided exposure: white inner paper at eye sections, brownish-orange outer paper on wings & folded beak
    expect(topFaceToneAt(beaked, -OWL_EYE_X, OWL_EYE_Y)).toBe('back');
    expect(topFaceToneAt(beaked, OWL_EYE_X, OWL_EYE_Y)).toBe('back');
    expect(topFaceToneAt(beaked, 0, OWL_BEAK_CREASE_Y - 0.008)).toBe('front');
    expect(topFaceToneAt(beaked, -0.04, 0.01)).toBe('front');
    expect(topFaceToneAt(beaked, 0.04, 0.01)).toBe('front');

    const built = buildPaperMesh(beaked, true);
    expect(built.groups.some((group) => group.materialIndex === 0 && group.count > 0)).toBe(true);
    expect(built.groups.some((group) => group.materialIndex === 1 && group.count > 0)).toBe(true);
    expect(built.groups.some((group) => group.materialIndex === 2 && group.count > 0)).toBe(true);

    // Step 7 (final step): Bring your owl to life
    expect(engine.currentStep?.id).toBe('owl-decorate');
    expect(engine.progress()).toMatchObject({ committedCount: 6, totalSteps: 7, activeIndex: 6 });
  });

  it('resets every fold including the beak when the owl starts over', () => {
    const engine = new OrigamiEngine(OWL_RECIPE, OWL_NAMED);
    for (let step = 0; step < 10; step += 1) {
      commitCurrent(engine);
    }
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(true);
    expect(engine.isStepCommitted('owl-side-right')).toBe(true);
    expect(engine.isStepCommitted('owl-hem')).toBe(true);
    expect(engine.isStepCommitted('owl-beak')).toBe(true);
    expect(engine.currentStep?.id).toBe('owl-decorate');

    engine.reset(OWL_RECIPE, OWL_NAMED);
    expect(engine.currentStep?.id).toBe('owl-vertical-fold');
    expect(engine.isStepCommitted('owl-vertical-fold')).toBe(false);
    expect(engine.isStepCommitted('owl-hem')).toBe(false);
    expect(engine.isStepCommitted('owl-beak')).toBe(false);
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 7, activeIndex: 0 });
    expect(engine.fromSnapshot?.named?.L?.[0]).toBeLessThan(-0.1);
    expect(engine.fromSnapshot?.named?.T?.[1]).toBeGreaterThan(0.1);
  });

  it('reveals white-and-black eyes and curved wing feather markings without an artificial cone beak on the final pinch', () => {
    expect(OWL_EYE_COLOR).toBe('#FFFFFF');
    expect(OWL_PUPIL_COLOR).toBe('#1C1A17');

    const pinch = new OwlPinch();
    const host = new Group();
    pinch.attach(host);
    pinch.sync('owl-beak');
    expect(pinch.visualState).toBe('hidden');
    pinch.sync('owl-decorate');
    pinch.tick(300);
    expect(pinch.begin()).toBe(true);
    expect(pinch.begin()).toBe(false);
    pinch.tick(400);
    expect(pinch.progress).toBeGreaterThan(0.2);
    expect(pinch.progress).toBeLessThan(1);
    expect(pinch.consumeCommit()).toBe(false);
    pinch.tick(800);
    expect(pinch.visualState).toBe('done');
    expect(pinch.consumeCommit()).toBe(true);
    expect(pinch.consumeCommit()).toBe(false);
    expect(pinch.contains(new Vector3())).toBe(false);

    const creature = new OwlCreature();
    creature.setReveal(0);
    creature.present(host, true);
    expect(host.getObjectByName('owl-features')?.visible).toBe(false);
    creature.setReveal(1);
    expect(host.getObjectByName('owl-features')?.visible).toBe(true);
    expect(host.getObjectByName('owl-eye-left')?.getObjectByName('owl-eye-white')).toBeTruthy();
    expect(host.getObjectByName('owl-eye-left')?.getObjectByName('owl-pupil')).toBeTruthy();
    expect(host.getObjectByName('owl-eye-right')?.getObjectByName('owl-eye-white')).toBeTruthy();
    expect(host.getObjectByName('owl-eye-right')?.getObjectByName('owl-pupil')).toBeTruthy();
    expect(host.getObjectByName('owl-feather-left-0')).toBeTruthy();
    expect(host.getObjectByName('owl-feather-right-0')).toBeTruthy();
    expect(host.getObjectByName('owl-feather-left-1')).toBeTruthy();
    expect(host.getObjectByName('owl-feather-right-1')).toBeTruthy();
    expect(host.getObjectByName('owl-beak')).toBeUndefined();
  });
});
