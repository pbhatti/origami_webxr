import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { deformByHinge } from '../../src/origami/MeshSplitter.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import {
  TURTLE_BACK_COLOR,
  TURTLE_EDGE_COLOR,
  TURTLE_EYE,
  TURTLE_HEAD_TIP,
  TURTLE_NAMED,
  TURTLE_PAPER_COLOR,
  TURTLE_RECIPE,
  TURTLE_STEPS,
  turtleShellHexes,
} from '../../src/origami/recipes/turtle.recipe.ts';
import type { Vec3 } from '../../src/origami/types.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { TurtlePinch } from '../../src/origami/TurtlePinch.ts';

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

function segmentsCross(a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean {
  const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const ab = cross(a[0], a[1], b[0], b[1], c[0], c[1]) * cross(a[0], a[1], b[0], b[1], d[0], d[1]);
  const cd = cross(c[0], c[1], d[0], d[1], a[0], a[1]) * cross(c[0], c[1], d[0], d[1], b[0], b[1]);
  return ab < -1e-12 && cd < -1e-12;
}

function outlineSelfIntersects(points: Vec3[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(i - j) <= 1 || Math.abs(i - j) === n - 1) {
        continue;
      }
      if (segmentsCross(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return true;
      }
    }
  }
  return false;
}

describe('origami turtle recipe', () => {
  it('is a valid five-step recipe and leaves the other animals alone', () => {
    expect(TURTLE_PAPER_COLOR).toBe('#91C943');
    const paper = origamiPaperMaterial(TURTLE_PAPER_COLOR);
    expect(paper.backColor).toBe(TURTLE_BACK_COLOR.toLowerCase());
    expect(paper.edgeColor).toBe(TURTLE_EDGE_COLOR.toLowerCase());
    expect(validateRecipe(TURTLE_RECIPE)).toEqual([]);
    expect(TURTLE_STEPS).toEqual([
      'diagonal-creases',
      'upper-right-corner',
      'shell-shape',
      'head-tip',
      'turtle-decoration',
    ]);
    expect(progressFromRecipe(TURTLE_RECIPE).totalSteps).toBe(5);
    expect(TURTLE_RECIPE.steps.map((step) => step.instruction)).toEqual([
      'Fold along both diagonals, then unfold.',
      'The paper opens. The first diagonal stays as a guide.',
      'Fold along the other diagonal.',
      'The paper opens into a square. Both diagonals are creased.',
      'Fold the upper-right corner inward.',
      'Fold the opposite corner inward to shape the shell.',
      'Fold the small tip upward to form the head.',
      'Pinch to bring your turtle to life!',
    ]);
    expect(TURTLE_RECIPE.steps.some((step) => (step.lockCreaseIds?.length ?? 0) > 0)).toBe(false);
    expect(TURTLE_RECIPE.steps.at(-1)?.id).toBe('turtle-decorate');
    expect(TURTLE_RECIPE.steps.at(-1)?.actionType).toBe('crease-press');
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    expect(OWL_RECIPE.steps[0]?.id).toBe('owl-vertical-fold');
    for (const step of TURTLE_RECIPE.steps) {
      expect(creaseAlignmentErrorM(step)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
      expect(step.hinge.p0).not.toEqual(step.hinge.p1);
    }
  });

  it('creases both diagonals, then folds a triangular shell and a left-pointing head', () => {
    const engine = new OrigamiEngine(TURTLE_RECIPE, TURTLE_NAMED);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-fold');
    expect(engine.currentStep?.extraCreaseLines?.length).toBe(1);

    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-open');
    commitCurrent(engine);
    commitCurrent(engine);
    expect(engine.currentStep?.id).toBe('turtle-diag-b-open');
    commitCurrent(engine);

    expect(engine.currentStep?.id).toBe('turtle-corner');
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.progress()).toMatchObject({ committedCount: 1, totalSteps: 5, activeIndex: 1 });
    const square = TURTLE_RECIPE.snapshots.square;
    expect(square?.named?.TR?.[0]).toBeGreaterThan(0.09);
    expect(square?.named?.TL?.[1]).toBeGreaterThan(0.09);

    commitCurrent(engine);
    const flap = TURTLE_RECIPE.snapshots.flap;
    expect(flap?.named?.TR?.[0]).toBeLessThan(-0.09);
    expect(flap?.named?.TR?.[1]).toBeLessThan(-0.09);
    const flapBounds = snapshotBounds(flap!);
    expect(flapBounds.maxY - flapBounds.minY).toBeGreaterThan(0.18);

    commitCurrent(engine);
    const shell = TURTLE_RECIPE.snapshots.shell;
    const shellBounds = snapshotBounds(shell!);
    expect(shell?.outline).toEqual([
      [0, 0, 0],
      [0.1, -0.1, 0],
      [-0.1, -0.1, 0],
    ]);
    expect(shellBounds.maxY).toBeCloseTo(0, 2);
    expect(shellBounds.minY).toBeCloseTo(-0.1, 2);
    expect(shellBounds.maxX - shellBounds.minX).toBeCloseTo(0.2, 2);
    expect(shellBounds.maxY - shellBounds.minY).toBeCloseTo(0.1, 2);
    expect(shell?.faces.some((face) => face.layer >= 2)).toBe(true);

    const head = TURTLE_RECIPE.steps.find((step) => step.id === 'turtle-head');
    expect(head?.progressStage).toBe(4);
    expect(head?.toSnapshotId).toBe('headed');
    const hingeEnds = [head!.hinge.p0, head!.hinge.p1];
    for (const point of hingeEnds) {
      expect(point[0]).toBeLessThan(0);
      expect(point[1]).toBeLessThan(-0.07);
      expect(Math.hypot(point[0] + 0.1, point[1] + 0.1)).toBeLessThan(0.1);
    }
    const creaseLength = Math.hypot(hingeEnds[0]![0] - hingeEnds[1]![0], hingeEnds[0]![1] - hingeEnds[1]![1]);
    expect(creaseLength).toBeGreaterThan(0.04);
    expect(creaseLength).toBeLessThan(0.08);
    expect(hingeEnds.some((point) => Math.abs(point[0] - point[1]) < 0.004)).toBe(true);
    expect(hingeEnds.some((point) => Math.abs(point[1] + 0.1) < 0.004)).toBe(true);
    const arrow = head!.arrowPathLocal;
    expect(arrow.at(-1)![1]).toBeGreaterThan(arrow[0]![1] + 0.02);
    const folded = deformByHinge(shell!, head!.hinge, -180, shell!.named?.BL);
    expect([...folded.movingVertexIds].length).toBeGreaterThan(0);
    for (const index of folded.movingVertexIds) {
      const point = folded.snapshot.vertices[index]!;
      expect(point[0]).toBeLessThan(0.02);
      expect(point[1]).toBeLessThan(-0.03);
    }
    expect(folded.snapshot.vertices.some((point) => point[0] > 0.09 && point[1] < -0.09)).toBe(true);

    commitCurrent(engine);
    const headed = TURTLE_RECIPE.snapshots.headed;
    expect(headed?.named?.O).toEqual([0, 0, 0]);
    expect(headed?.named?.BR?.[0]).toBeCloseTo(0.1, 3);
    expect(headed?.named?.BR?.[1]).toBeCloseTo(-0.1, 3);
    expect(TURTLE_HEAD_TIP[1]).toBeGreaterThan(-0.07);
    expect(TURTLE_HEAD_TIP[0]).toBeLessThan(TURTLE_HEAD_TIP[1] - 0.015);
    const outline = headed?.outline ?? [];
    expect(outline).toEqual(TURTLE_RECIPE.finalSilhouette);
    expect(outline).toEqual(TURTLE_RECIPE.snapshots.turtle?.outline);
    expect(outlineSelfIntersects(outline)).toBe(false);
    const bottom = outline.filter((point) => Math.abs(point[1] + 0.1) < 0.004);
    expect(bottom.some((point) => point[0] > 0.09)).toBe(true);
    expect(bottom.some((point) => point[0] < 0 && point[0] > -0.05)).toBe(true);
    expect(bottom.every((point) => point[0] > -0.05)).toBe(true);
    const leftmost = outline.reduce((best, point) => (point[0] < best[0] ? point : best));
    expect(leftmost[0]).toBeCloseTo(TURTLE_HEAD_TIP[0], 4);
    expect(leftmost[1]).toBeGreaterThan(-0.07);
    expect(TURTLE_EYE[0]).toBeLessThan(TURTLE_EYE[1] - 0.01);
    expect(Math.hypot(TURTLE_EYE[0] - TURTLE_HEAD_TIP[0], TURTLE_EYE[1] - TURTLE_HEAD_TIP[1])).toBeLessThan(0.02);
    const headedBounds = snapshotBounds(headed!);
    expect(headedBounds.maxX).toBeCloseTo(0.1, 2);
    expect(headedBounds.maxY).toBeCloseTo(0, 2);
    expect(headedBounds.minY).toBeCloseTo(-0.1, 2);
    expect(engine.currentStep?.id).toBe('turtle-decorate');
    expect(engine.currentStep?.instruction).toBe('Pinch to bring your turtle to life!');
    expect(engine.currentStep?.progressStage).toBe(5);

    commitCurrent(engine);
    expect(engine.isComplete()).toBe(true);
    expect(engine.canStartCreature()).toBe(true);
    expect(engine.lockedCreases).toEqual([]);
    expect(turtleShellHexes().length).toBeGreaterThan(6);
  });

  it('resets every fold when the turtle starts over', () => {
    const engine = new OrigamiEngine(TURTLE_RECIPE, TURTLE_NAMED);
    for (let step = 0; step < 6; step += 1) {
      commitCurrent(engine);
    }
    expect(engine.isStepCommitted('turtle-corner')).toBe(true);
    expect(engine.currentStep?.id).toBe('turtle-head');

    engine.reset(TURTLE_RECIPE, TURTLE_NAMED);
    expect(engine.currentStep?.id).toBe('turtle-diag-a-fold');
    expect(engine.isStepCommitted('turtle-corner')).toBe(false);
    expect(engine.lockedCreases).toEqual([]);
    expect(engine.fromSnapshot?.named?.TL?.[0]).toBeLessThan(-0.09);
    expect(engine.fromSnapshot?.named?.TR?.[1]).toBeGreaterThan(0.09);
  });

  it('plays the decoration once from a single pinch', () => {
    const pinch = new TurtlePinch();
    const host = new Group();
    pinch.attach(host);
    pinch.sync('turtle-decorate');
    pinch.tick(300);
    expect(pinch.begin()).toBe(true);
    expect(pinch.begin()).toBe(false);
    pinch.tick(400);
    expect(pinch.progress).toBeGreaterThan(0.2);
    expect(pinch.consumeCommit()).toBe(false);
    pinch.tick(800);
    expect(pinch.visualState).toBe('done');
    expect(pinch.consumeCommit()).toBe(true);
    expect(pinch.consumeCommit()).toBe(false);
    expect(pinch.contains(new Vector3())).toBe(false);
  });
});
