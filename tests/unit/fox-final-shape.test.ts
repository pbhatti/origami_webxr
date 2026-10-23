import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { PaperStage } from '../../src/origami/PaperStage.ts';
import { deformByHinge } from '../../src/origami/MeshSplitter.ts';
import {
  FOX_FACE_LEFT,
  FOX_FINAL_SHAPE,
  FOX_LOWER_LEFT_SAMPLES,
  FOX_LOWER_RIGHT_SAMPLES,
  FOX_SHAPE_INSPECTOR,
  FOX_SHAPE_TOLERANCE_M,
  facesCoveringPoint,
  foxPointCovered,
  validateFoxGeometry,
} from '../../src/origami/foxFinalShape.ts';
import { FOX_NAMED, FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { FoxShapeInspector } from '../../src/ui/FoxShapeInspector.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';

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

function drain(engine: OrigamiEngine): void {
  for (let i = 0; i < 40; i += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function finish(engine: OrigamiEngine): void {
  for (let i = 0; i < 8 && !engine.isComplete(); i += 1) {
    engine.assistToTarget();
    drain(engine);
  }
}

function rounded(vertices: Vec3[]): number[][] {
  return vertices.map((vertex) => vertex.map((value) => Number(value.toFixed(5))));
}

describe('fox final shape', () => {
  it('matches the canonical diamond, ears, and nose', () => {
    const fox = FOX_RECIPE.snapshots.fox;
    if (!fox) {
      throw new Error('fox snapshot missing');
    }
    const report = validateFoxGeometry(fox);
    expect(report.errors, report.errors.join('; ')).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.earSymmetryM).toBeLessThan(0.004);
    expect(report.earHeightM).toBeGreaterThan(0.04);
    expect(report.noseOffsetX).toBeLessThan(0.004);
    expect(report.cornerDeltaY).toBeLessThan(0.004);
    expect(report.gapM).toBeGreaterThan(0.02);
    expect(report.gapM).toBeLessThan(0.06);
    expect(report.degenerateTriangles).toBe(0);
    expect(report.components).toBe(1);
    expect(report.silhouetteErrorM).toBeLessThan(FOX_SHAPE_TOLERANCE_M);
    expect(report.maxEdgeM).toBeLessThanOrEqual(0.165);
    expect(report.lowerLeftAreaM2).toBeGreaterThan(1e-5);
    expect(report.lowerRightAreaM2).toBeGreaterThan(1e-5);
    expect(report.projectedLeftOk).toBe(true);
    expect(report.projectedRightOk).toBe(true);
    for (const sample of FOX_LOWER_LEFT_SAMPLES) {
      expect(foxPointCovered(fox, sample), `left ${sample}`).toBe(true);
    }
    for (const sample of FOX_LOWER_RIGHT_SAMPLES) {
      expect(foxPointCovered(fox, sample), `right ${sample}`).toBe(true);
    }
    expect(FOX_FINAL_SHAPE.points.map((entry) => entry.id)).toEqual([
      'left-outer',
      'left-ear-tip',
      'left-inner',
      'right-inner',
      'right-ear-tip',
      'right-outer',
      'nose',
    ]);
    const leftTip = FOX_FINAL_SHAPE.points.find((entry) => entry.id === 'left-ear-tip');
    const rightTip = FOX_FINAL_SHAPE.points.find((entry) => entry.id === 'right-ear-tip');
    expect(leftTip && rightTip && leftTip.local[1] > FOX_FACE_LEFT[1]).toBe(true);
    expect(leftTip && rightTip && rightTip.local[1] > FOX_FACE_LEFT[1]).toBe(true);
  });

  it('reproduces the same folded vertices across sessions', () => {
    const first = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    const second = new OrigamiEngine(FOX_RECIPE, FOX_NAMED);
    finish(first);
    finish(second);
    expect(first.isComplete()).toBe(true);
    expect(second.isComplete()).toBe(true);
    expect(rounded(second.fromSnapshot?.vertices ?? [])).toEqual(rounded(first.fromSnapshot?.vertices ?? []));
    const again = validateFoxGeometry(first.fromSnapshot!);
    expect(again.ok, again.errors.join('; ')).toBe(true);
  });

  it('keeps local geometry when the paper root moves and the sheet turns over', () => {
    const stage = new PaperStage();
    stage.loadAnimal('fox');
    const beforeFold = rounded(stage.engine.fromSnapshot?.vertices ?? []);
    finish(stage.engine);
    const folded = rounded(stage.engine.fromSnapshot?.vertices ?? []);
    expect(folded).not.toEqual(beforeFold);
    stage.applyFoldVisuals(false);
    const sheet = stage.getPaperRoot().getObjectByName('fold-fly-paper-sheet');
    const face = sheet?.getObjectByName('fox-face');
    const nose = sheet?.getObjectByName('fox-nose');
    expect(sheet?.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(face?.visible).toBe(true);
    expect(nose?.position.z).toBeLessThan(0);
    expect(nose?.position.x).toBe(0);
    const flipped = validateFoxGeometry(stage.engine.fromSnapshot!);
    expect(flipped.projectedLeftOk, flipped.errors.join('; ')).toBe(true);
    expect(flipped.projectedRightOk).toBe(true);

    stage.getPaperRoot().position.set(0.35, -0.22, -0.9);
    stage.getPaperRoot().rotation.x = -0.35;
    stage.applyFoldVisuals(false);
    expect(rounded(stage.engine.fromSnapshot?.vertices ?? [])).toEqual(folded);
    expect(sheet?.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(validateFoxGeometry(stage.engine.fromSnapshot!).ok).toBe(true);

    stage.recenter(new PerspectiveCamera(50, 1, 0.1, 20));
    stage.applyFoldVisuals(false);
    expect(rounded(stage.engine.fromSnapshot?.vertices ?? [])).toEqual(folded);
  });

  it('leaves the whale recipe on its own silhouette', () => {
    expect(WHALE_RECIPE.finalSilhouette).toHaveLength(3);
    expect(WHALE_RECIPE.steps.map((step) => step.id)).not.toContain('fox-ear-left');
    expect(WHALE_RECIPE.snapshots.diamond?.faces).toHaveLength(4);
  });

  it('keeps both diamond cheeks after each ear, in either order', () => {
    const brow = FOX_RECIPE.snapshots.brow!;
    const left = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-left')!;
    const right = FOX_RECIPE.steps.find((step) => step.id === 'fox-ear-right')!;
    const afterLeft = deformByHinge(brow, left.hinge, -180, brow.named?.L);
    expectStationaryCheeks(afterLeft.snapshot, afterLeft.stationaryFaceIds);
    const afterBoth = deformByHinge(afterLeft.snapshot, right.hinge, -180, FOX_NAMED.RIGHT);
    expectStationaryCheeks(afterBoth.snapshot, afterBoth.stationaryFaceIds);

    const afterRight = deformByHinge(brow, right.hinge, -180, FOX_NAMED.RIGHT);
    expectStationaryCheeks(afterRight.snapshot, afterRight.stationaryFaceIds);
    const afterBothRightFirst = deformByHinge(afterRight.snapshot, left.hinge, -180, FOX_NAMED.L);
    expectStationaryCheeks(afterBothRightFirst.snapshot, afterBothRightFirst.stationaryFaceIds);
    expect(validateFoxGeometry(FOX_RECIPE.snapshots.fox!).ok).toBe(true);
  });

  it('exposes fox geometry inspector overlays for the missing-face debug pass', () => {
    const inspector = new FoxShapeInspector();
    inspector.update(FOX_RECIPE.snapshots.fox!, 1, true, { movingFaceIds: [], stationaryFaceIds: [] });
    expect(inspector.group.getObjectByName('fox-lower-left-faces')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-lower-right-faces')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-stationary-faces')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-moving-ear-faces')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-triangle-normals')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-face-ids')).toBeTruthy();
    expect(inspector.group.getObjectByName('fox-expected-silhouette')).toBeTruthy();
    expect(FOX_SHAPE_INSPECTOR.disableBackfaceCulling).toBe(true);
    expect(inspector.report?.projectedLeftOk).toBe(true);
    expect(inspector.report?.projectedRightOk).toBe(true);
  });
});

function expectStationaryCheeks(snapshot: MeshSnapshot, stationary: Set<string>): void {
  for (const sample of [...FOX_LOWER_LEFT_SAMPLES, ...FOX_LOWER_RIGHT_SAMPLES]) {
    expect(foxPointCovered(snapshot, sample), `cover ${sample}`).toBe(true);
  }
  const leftCover = FOX_LOWER_LEFT_SAMPLES.flatMap((sample) => facesCoveringPoint(snapshot, sample));
  expect(leftCover.some((face) => stationary.has(face.id))).toBe(true);
}
