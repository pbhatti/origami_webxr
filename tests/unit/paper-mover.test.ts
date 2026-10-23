import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { PaperMover, clampPaperReach } from '../../src/origami/PaperMover.ts';
import { PAPER_MOVE_MIN_DISTANCE_M, PAPER_SCALE_MAX } from '../../src/origami/placement.ts';
import { FISH_NAMED, FISH_RECIPE } from '../../src/origami/recipes/fish.recipe.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

function drain(engine: OrigamiEngine, durationMs: number): void {
  for (let elapsed = 0; elapsed <= durationMs + 16; elapsed += 16) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

describe('PaperMover', () => {
  it('translates the paper so the grab point stays under the hand', () => {
    const paper = new Group();
    paper.position.set(0, 1.2, -0.6);
    const mover = new PaperMover();
    const grab = new Vector3(0.02, 1.2, -0.6);
    mover.begin(paper, 'right', grab);
    mover.update(paper, 'right', new Vector3(0.12, 1.25, -0.5), null, null);
    expect(paper.position.x).toBeCloseTo(0.1);
    expect(paper.position.y).toBeCloseTo(1.25);
    expect(paper.position.z).toBeCloseTo(-0.5);
  });

  it('two-hand pinch scales without leaving the allowed range', () => {
    const paper = new Group();
    paper.position.set(0, 1.2, -0.6);
    const mover = new PaperMover();
    const a = new Vector3(-0.05, 1.2, -0.6);
    const b = new Vector3(0.05, 1.2, -0.6);
    mover.begin(paper, 'right', a);
    mover.update(paper, 'right', a, null, b);
    mover.update(paper, 'right', new Vector3(-0.2, 1.2, -0.6), null, new Vector3(0.2, 1.2, -0.6));
    expect(paper.scale.x).toBeGreaterThan(1);
    expect(paper.scale.x).toBeLessThanOrEqual(PAPER_SCALE_MAX);
  });

  it('does not reset fold progress when the sheet is moved', () => {
    const engine = new OrigamiEngine(FISH_RECIPE, FISH_NAMED);
    engine.assistToTarget();
    drain(engine, 400);
    expect(engine.progress().committedCount).toBe(1);
    const paper = new Group();
    const mover = new PaperMover();
    mover.begin(paper, 'left', new Vector3(0, 1, -0.5));
    mover.update(paper, 'left', new Vector3(0.2, 1.1, -0.4), null, null);
    mover.end();
    expect(engine.progress().committedCount).toBe(1);
    expect(engine.currentStep?.id).toBe('packet-square');
  });

  it('clamps a pose that is too close to the viewer', () => {
    const paper = new Group();
    paper.position.set(0, 1.6, -0.05);
    clampPaperReach(paper, new Vector3(0, 1.6, 0));
    expect(paper.position.distanceTo(new Vector3(0, 1.6, 0))).toBeGreaterThanOrEqual(
      PAPER_MOVE_MIN_DISTANCE_M - 1e-6,
    );
  });
});
