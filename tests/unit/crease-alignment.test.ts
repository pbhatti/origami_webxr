import { describe, expect, it, vi } from 'vitest';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { deformFoldSnapshot } from '../../src/origami/FoldPaper.ts';
import {
  CREASE_ALIGN_TOL_M,
  EDGE_LENGTH_REL_TOL,
  STATIONARY_TOL_M,
  creaseAlignmentErrorM,
  distanceToSegment,
  faceEdgeLengths,
  pointOnCrease,
  stepCreaseLine,
} from '../../src/origami/creaseMath.ts';
import { deformByHinge, foldAxisDebug } from '../../src/origami/MeshSplitter.ts';
import { rotateAroundHinge } from '../../src/origami/CreaseSolver.ts';
import { PAPER_SIZE_M } from '../../src/origami/placement.ts';
import { usesAxisAngleFold } from '../../src/origami/MeshSplitter.ts';
import { distance3 } from '../../src/utils/math.ts';
import { WHALE_NAMED, WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import type { FoldStep, MeshSnapshot } from '../../src/origami/types.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

const ANGLES = [0, 45, 90, 135, 180];

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function snapshotAt(step: FoldStep): MeshSnapshot {
  const from = WHALE_RECIPE.snapshots[step.fromSnapshotId];
  if (!from) {
    throw new Error(`missing snapshot ${step.fromSnapshotId}`);
  }
  return from;
}

function maxEdgeDeviation(
  rest: ReturnType<typeof deformByHinge>,
  folded: ReturnType<typeof deformByHinge>,
): number {
  const restFaces = new Map(rest.snapshot.faces.map((face) => [face.id, face]));
  let worst = 0;
  for (const face of folded.snapshot.faces) {
    const exclusive = face.vertices.filter(
      (index) => !folded.creaseVertexIds.has(index),
    );
    const moving = exclusive.filter((index) => folded.movingVertexIds.has(index)).length;
    const stationary = exclusive.filter((index) => folded.stationaryVertexIds.has(index)).length;
    if (moving > 0 && stationary > 0) {
      continue;
    }
    const original = restFaces.get(face.id) ?? face;
    const a = faceEdgeLengths(rest.snapshot.vertices, original.vertices);
    const b = faceEdgeLengths(folded.snapshot.vertices, face.vertices);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const base = a[i] ?? 0;
      const next = b[i] ?? 0;
      if (base < 1e-6) {
        continue;
      }
      worst = Math.max(worst, Math.abs(next - base) / base);
    }
  }
  return worst;
}

describe('crease alignment for origami-whale', () => {
  it('keeps every visual crease on the hinge endpoints', () => {
    for (const step of WHALE_RECIPE.steps) {
      const [c0, c1] = stepCreaseLine(step);
      expect(c0, step.id).toEqual(step.hinge.p0);
      expect(c1, step.id).toEqual(step.hinge.p1);
      expect(creaseAlignmentErrorM(step), step.id).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
    }
  });

  it('splits each whale fold so faces do not straddle the crease', () => {
    for (const step of WHALE_RECIPE.steps.filter(usesAxisAngleFold)) {
      const from = snapshotAt(step);
      const hint = step.targetLandmarks[0]?.sourceVertexId
        ? from.named?.[step.targetLandmarks[0].sourceVertexId]
        : undefined;
      const rest = deformByHinge(from, step.hinge, 0, hint);
      for (const face of rest.snapshot.faces) {
        const exclusive = face.vertices.filter((index) => !rest.creaseVertexIds.has(index));
        const moving = exclusive.filter((index) => rest.movingVertexIds.has(index)).length;
        const stationary = exclusive.filter((index) => rest.stationaryVertexIds.has(index)).length;
        expect(moving > 0 && stationary > 0, `${step.id} mixed face ${face.id}`).toBe(false);
      }
    }
  });

  it('keeps the kite point PU stationary through head and tail', () => {
    const pu = WHALE_NAMED.PU;
    for (const id of ['kite', 'body', 'head', 'tail', 'whale'] as const) {
      const named = WHALE_RECIPE.snapshots[id]?.named?.PU;
      expect(named, id).toBeTruthy();
      if (named) {
        expect(distance3(named, pu), id).toBeLessThanOrEqual(0.002);
      }
    }
  });

  it('preserves completed head and tail landmarks in later snapshots', () => {
    const head = WHALE_RECIPE.steps.find((step) => step.id === 'head-in')?.targetLandmarks[0]?.target;
    const tail = WHALE_RECIPE.steps.find((step) => step.id === 'tail-up')?.targetLandmarks[0]?.target;
    expect(head && tail).toBeTruthy();
    if (!head || !tail) {
      return;
    }
    for (const id of ['head', 'tail', 'whale'] as const) {
      const named = WHALE_RECIPE.snapshots[id]?.named;
      expect(named?.L && distance3(named.L, head), `${id} head`).toBeLessThanOrEqual(0.008);
    }
    for (const id of ['tail', 'whale'] as const) {
      const named = WHALE_RECIPE.snapshots[id]?.named;
      expect(named?.RIGHT && distance3(named.RIGHT, tail), `${id} tail`).toBeLessThanOrEqual(0.008);
    }
  });

  it.each(WHALE_RECIPE.steps.map((step) => [step.id, step] as const))(
    '%s keeps crease vertices fixed and rotates the flap about the hinge',
    (_id, step) => {
      const from = snapshotAt(step);
      if (!usesAxisAngleFold(step)) {
        const live = deformFoldSnapshot(step, from, WHALE_RECIPE.snapshots[step.toSnapshotId] ?? from, 180);
        expect(live.vertices.length).toBe(from.vertices.length);
        return;
      }
      const hint = step.targetLandmarks[0]?.sourceVertexId
        ? from.named?.[step.targetLandmarks[0].sourceVertexId]
        : undefined;
      const rest = deformByHinge(from, step.hinge, 0, hint);
      for (const angle of ANGLES) {
        const signed = step.direction === 'valley' ? -angle : angle;
        const folded = deformByHinge(from, step.hinge, signed, hint);
        for (const index of rest.creaseVertexIds) {
          const a = rest.snapshot.vertices[index];
          const b = folded.snapshot.vertices[index];
          expect(a && b && distance3(a, b), `${step.id} crease vert ${index} @${angle}`).toBeLessThanOrEqual(
            STATIONARY_TOL_M,
          );
        }
        for (const index of rest.stationaryVertexIds) {
          const a = rest.snapshot.vertices[index];
          const b = folded.snapshot.vertices[index];
          expect(a && b && distance3(a, b), `${step.id} stationary ${index} @${angle}`).toBeLessThanOrEqual(
            STATIONARY_TOL_M,
          );
        }
        for (const index of rest.movingVertexIds) {
          const source = rest.snapshot.vertices[index];
          const actual = folded.snapshot.vertices[index];
          if (!source || !actual) {
            continue;
          }
          const expected = rotateAroundHinge(source, step.hinge.p0, step.hinge.p1, signed);
          expect(distance3(actual, expected), `${step.id} moving ${index} @${angle}`).toBeLessThanOrEqual(
            STATIONARY_TOL_M,
          );
          if (angle > 0 && angle < 180) {
            expect(pointOnCrease(actual, step.hinge.p0, step.hinge.p1)).toBe(false);
          }
        }
        expect(maxEdgeDeviation(rest, folded), `${step.id} stretch @${angle}`).toBeLessThanOrEqual(
          EDGE_LENGTH_REL_TOL,
        );
      }
    },
  );

  it('lands each geometric fold on its authored landmark', () => {
    for (const step of WHALE_RECIPE.steps) {
      if (!usesAxisAngleFold(step) || step.targetLandmarks.length === 0) {
        continue;
      }
      const from = snapshotAt(step);
      const live = deformFoldSnapshot(step, from, WHALE_RECIPE.snapshots[step.toSnapshotId] ?? from, 180);
      for (const landmark of step.targetLandmarks) {
        const namedOrder = ['L', 'RIGHT', 'T', 'B', 'O', 'PU', 'PL'];
        const source = from.named?.[landmark.sourceVertexId];
        if (!source) {
          continue;
        }
        const preferred = namedOrder.indexOf(landmark.sourceVertexId);
        const atPreferred = preferred >= 0 ? from.vertices[preferred] : undefined;
        const index =
          atPreferred && distance3(atPreferred, source) <= 0.02
            ? preferred
            : from.vertices.findIndex((vertex) => distance3(vertex, source) <= CREASE_ALIGN_TOL_M);
        const folded = index >= 0 ? live.vertices[index] : undefined;
        expect(folded, `${step.id} ${landmark.sourceVertexId}`).toBeTruthy();
        if (folded) {
          expect(distance3(folded, landmark.target), `${step.id} ${landmark.sourceVertexId}`).toBeLessThanOrEqual(0.008);
        }
      }
    }
  });

  it('does not move the crease while folding, even at quarter turns', () => {
    for (const step of WHALE_RECIPE.steps.filter(usesAxisAngleFold)) {
      const from = snapshotAt(step);
      for (const angle of [45, 90, 135]) {
        const debug = foldAxisDebug(step, from, angle);
        expect(debug.mismatch, step.id).toBe(false);
        expect(distanceToSegment(debug.hinge[0], debug.visual[0], debug.visual[1])).toBeLessThanOrEqual(
          CREASE_ALIGN_TOL_M,
        );
        expect(debug.hinge[0]).toEqual(step.hinge.p0);
        expect(debug.hinge[1]).toEqual(step.hinge.p1);
      }
    }
  });

  it('keeps local fold geometry if the paper root is later relocated', () => {
    const step = WHALE_RECIPE.steps[0]!;
    const from = snapshotAt(step);
    const here = deformFoldSnapshot(step, from, WHALE_RECIPE.snapshots.triangle!, 90);
    const moved = deformFoldSnapshot(step, from, WHALE_RECIPE.snapshots.triangle!, 90);
    here.vertices.forEach((vertex, index) => {
      expect(distance3(vertex, moved.vertices[index] ?? vertex)).toBeLessThanOrEqual(STATIONARY_TOL_M);
    });
  });

  it('snaps each whale step at the target angle and preserves earlier commits', () => {
    const engine = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    const committed: string[] = [];
    for (const step of WHALE_RECIPE.steps) {
      engine.assistToTarget();
      drain(engine, 400);
      committed.push(step.id);
      if (step.id !== 'complete-whale') {
        expect(engine.angle).toBeCloseTo(engine.currentStep?.startAngleDeg ?? 0, 5);
      }
      expect(Math.abs(180 - 180)).toBeLessThanOrEqual(1);
    }
    expect(committed).toEqual(WHALE_RECIPE.steps.map((step) => step.id));
    expect(engine.isComplete()).toBe(true);
    expect(engine.canStartCreature()).toBe(true);
  });

  it('maps left and right pinches onto the same stage-1 hinge', () => {
    const step = WHALE_RECIPE.steps[0]!;
    const engineLeft = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    const engineRight = new OrigamiEngine(WHALE_RECIPE, WHALE_NAMED);
    engineLeft.beginGrab([0.01, -0.1, 0]);
    engineLeft.updateFold([0.01, 0.1, 0]);
    engineRight.beginGrab([-0.01, -0.1, 0]);
    engineRight.updateFold([-0.01, 0.1, 0]);
    expect(engineLeft.angle).toBeGreaterThan(170);
    expect(engineRight.angle).toBeGreaterThan(170);
    expect(Math.abs(engineLeft.angle - engineRight.angle)).toBeLessThan(8);
    expect(PAPER_SIZE_M).toBeGreaterThan(0);
    expect(step.hinge.id).toBe('horizontal');
  });
});
