import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ScissorsCut } from '../../src/origami/ScissorsCut.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { BAT_NAMED, BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';

describe('bat scissors cut', () => {
  it('spawns on the ear step, cuts once, and can be reset', () => {
    const cut = new ScissorsCut();
    cut.attach(new Group());
    expect(cut.visualState).toBe('HIDDEN');
    expect(cut.blocksPaperFold).toBe(false);

    cut.sync('bat-notch');
    expect(cut.visualState).toBe('SPAWNING');
    cut.tick(300);
    expect(cut.visualState).toBe('READY');
    expect(cut.begin()).toBe(true);
    expect(cut.begin()).toBe(false);
    expect(cut.visualState).toBe('CUTTING');

    cut.tick(1000);
    expect(cut.progress).toBe(1);
    expect(cut.consumeCommit()).toBe(true);
    expect(cut.consumeCommit()).toBe(false);

    cut.tick(90);
    cut.tick(500);
    expect(cut.visualState).toBe('HIDDEN');
    expect(cut.blocksPaperFold).toBe(false);
  });

  it('keeps the guided cut going without another pinch', () => {
    const cut = new ScissorsCut();
    cut.attach(new Group());
    cut.sync('bat-notch');
    cut.tick(300);
    cut.begin();
    cut.sync(null);
    cut.tick(400);
    expect(cut.visualState).toBe('CUTTING');
    expect(cut.progress).toBeGreaterThan(0.3);
    expect(cut.progress).toBeLessThan(1);
  });

  it('answers a nearby pinch and a ray that meets the scissors', () => {
    const parent = new Group();
    const cut = new ScissorsCut();
    cut.attach(parent);
    parent.updateWorldMatrix(true, true);
    cut.sync('bat-notch');
    cut.tick(300);
    const center = new Vector3();
    cut.group.getWorldPosition(center);
    expect(cut.contains(center)).toBe(true);
    expect(cut.contains(center.clone().add(new Vector3(0.2, 0, 0)))).toBe(false);
    expect(cut.raycast(center.clone().add(new Vector3(0, 0, 0.4)), new Vector3(0, 0, -1))).toBe(true);
    expect(cut.raycast(center.clone().add(new Vector3(0.2, 0, 0.4)), new Vector3(0, 0, -1))).toBe(false);
  });

  it('can reach the ear step by committing the earlier folds', () => {
    const engine = new OrigamiEngine(BAT_RECIPE, BAT_NAMED);
    let guard = 0;
    while (engine.currentStep && engine.currentStep.id !== 'bat-notch' && guard < 12) {
      engine.assistToTarget();
      for (let frame = 0; frame < 40 && engine.isAnimating(); frame += 1) {
        engine.tick(32);
      }
      guard += 1;
    }
    expect(engine.currentStep?.id).toBe('bat-notch');
    expect(engine.isStepCommitted('bat-head')).toBe(true);
    expect(engine.isStepCommitted('bat-left-wing-open')).toBe(true);
  });
});
