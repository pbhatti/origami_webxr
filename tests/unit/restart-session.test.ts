import { Group, Mesh, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GalleryTransitionController } from '../../src/gallery/GalleryTransitionController.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { PaperStage } from '../../src/origami/PaperStage.ts';
import { CREASE_GUIDE } from '../../src/origami/foldAssist.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import type { Vec3 } from '../../src/origami/types.ts';
import { FoldGuides } from '../../src/ui/FoldGuides.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

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

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  drain(engine);
}

function grabPoint(stage: PaperStage): Vec3 {
  return stage.engine.currentStep?.arrowPathLocal[0] ?? [0.04, -0.04, 0];
}

function creaseVisible(guides: FoldGuides): { crease: boolean; arrow: boolean } {
  const lanes = guides.group.getObjectByName('fold-lanes');
  const crease = lanes?.children[0] as Mesh | undefined;
  const arrow = lanes?.children[1] as Mesh | undefined;
  return { crease: Boolean(crease?.visible), arrow: Boolean(arrow?.visible) };
}

describe('restart origami session', () => {
  it('shows the step 1 crease again after that crease was completed', () => {
    const guides = new FoldGuides();
    const step = WHALE_RECIPE.steps[0];
    if (!step) {
      throw new Error('whale step 1 missing');
    }
    const width = CREASE_GUIDE.widthM;
    try {
      guides.setStep(step, null, [step], [step.id]);
      guides.tick(1, { folding: false, snapping: false, complete: false });
      expect(creaseVisible(guides)).toEqual({ crease: false, arrow: false });

      CREASE_GUIDE.widthM += 0.0001;
      guides.tick(0.01, { folding: false, snapping: false, complete: false });
      guides.tick(1, { folding: false, snapping: false, complete: false });
      expect(creaseVisible(guides).crease).toBe(false);

      guides.setStep(step, null, [step], []);
      guides.tick(0.05, { folding: false, snapping: false, complete: false });
      expect(creaseVisible(guides)).toEqual({ crease: true, arrow: true });
    } finally {
      CREASE_GUIDE.widthM = width;
    }
  });

  it('drops an in-flight gallery callback when the transition is cancelled', () => {
    const controller = new GalleryTransitionController();
    const group = new Group();
    let calls = 0;
    controller.collapse(group, () => {
      calls += 1;
    });
    controller.cancel();
    controller.tick(1);
    expect(calls).toBe(0);
    expect(controller.active).toBe(false);
    expect(group.visible).toBe(false);

    controller.expand(group, () => {
      calls += 1;
    });
    controller.cancel();
    controller.tick(1);
    expect(calls).toBe(0);

    controller.collapse(group, () => {
      calls += 1;
    });
    controller.tick(1);
    expect(calls).toBe(1);
  });

  it('folds whale step 1, restarts, and folds step 1 again', () => {
    const stage = new PaperStage();
    expect(stage.engine.currentStep?.id).toBe(WHALE_RECIPE.steps[0]?.id);
    commitCurrent(stage.engine);
    expect(stage.engine.currentStep?.id).not.toBe(WHALE_RECIPE.steps[0]?.id);

    stage.restartOrigamiSession(null);
    expect(stage.engine.currentStep?.id).toBe('diag-fold');
    expect(stage.engine.enginePhase).toBe('idle');
    expect(stage.engine.angle).toBe(0);
    expect(stage.engine.magneticArmed).toBe(false);
    expect(stage.getProgress().committedCount).toBe(0);
    expect(stage.validateSession().ok).toBe(true);
    expect(stage.paperMeshId).toBe(stage.foldTargetMeshId);

    stage.engine.beginGrab(grabPoint(stage));
    expect(stage.engine.enginePhase).toBe('folding');
  });

  it('restarts bat back to the purple square and accepts a new grab', () => {
    const stage = new PaperStage();
    stage.loadAnimal('bat');
    commitCurrent(stage.engine);
    expect(stage.engine.currentStep?.id).not.toBe('bat-triangle');
    stage.restartOrigamiSession(null);
    expect(stage.activeAnimal).toBe('bat');
    expect(stage.engine.recipeId).toBe(BAT_RECIPE.id);
    expect(stage.engine.currentStep?.id).toBe('bat-triangle');
    expect(stage.engine.enginePhase).toBe('idle');
    expect(stage.engine.angle).toBe(0);
    stage.engine.beginGrab(grabPoint(stage));
    expect(stage.engine.enginePhase).toBe('folding');
  });

  it('restarts fox back to its own first fold and accepts a new grab', () => {
    const stage = new PaperStage();
    stage.loadAnimal('fox');
    commitCurrent(stage.engine);
    stage.restartOrigamiSession(null);
    expect(stage.activeAnimal).toBe('fox');
    expect(stage.engine.recipeId).toBe(FOX_RECIPE.id);
    expect(stage.engine.currentStep?.id).toBe(FOX_RECIPE.steps[0]?.id);
    expect(stage.engine.enginePhase).toBe('idle');
    stage.engine.beginGrab(grabPoint(stage));
    expect(stage.engine.enginePhase).toBe('folding');
  });

  it('restarts before any fold, mid-fold, and during magnetic snap', () => {
    const idle = new PaperStage();
    idle.restartOrigamiSession(null);
    expect(idle.engine.currentStep?.id).toBe('diag-fold');
    expect(idle.engine.enginePhase).toBe('idle');
    idle.engine.beginGrab(grabPoint(idle));
    expect(idle.engine.enginePhase).toBe('folding');

    const folding = new PaperStage();
    const start = grabPoint(folding);
    folding.engine.beginGrab(start);
    folding.engine.updateFold(start, false, 16);
    expect(folding.engine.enginePhase).toBe('folding');
    folding.restartOrigamiSession(null);
    expect(folding.engine.enginePhase).toBe('idle');
    expect(folding.engine.currentStep?.id).toBe('diag-fold');
    expect(folding.engine.angle).toBe(0);

    const snapping = new PaperStage();
    snapping.engine.assistToTarget();
    expect(snapping.engine.enginePhase).toBe('snapping');
    expect(snapping.magneticSnapState).toBe('snapping');
    snapping.restartOrigamiSession(null);
    expect(snapping.engine.enginePhase).toBe('idle');
    expect(snapping.magneticSnapState).toBe('idle');
    expect(snapping.engine.currentStep?.id).toBe('diag-fold');
    snapping.engine.beginGrab(grabPoint(snapping));
    expect(snapping.engine.enginePhase).toBe('folding');
  });

  it('restarts after both fox ears and restores the fox step 1 definition', () => {
    const stage = new PaperStage();
    stage.loadAnimal('fox');
    for (let i = 0; i < 8 && !stage.engine.isStepCommitted('fox-ear-right'); i += 1) {
      commitCurrent(stage.engine);
    }
    expect(stage.engine.isStepCommitted('fox-ear-left')).toBe(true);
    expect(stage.engine.isStepCommitted('fox-ear-right')).toBe(true);
    stage.restartOrigamiSession(null);
    expect(stage.engine.isStepCommitted('fox-ear-left')).toBe(false);
    expect(stage.engine.isStepCommitted('fox-ear-right')).toBe(false);
    expect(stage.engine.currentStep?.id).toBe('fox-half');
    expect(stage.foldInitStatus).toBe('ready');
    stage.engine.beginGrab(grabPoint(stage));
    expect(stage.engine.enginePhase).toBe('folding');
  });

  it('returns a relocated sheet to the preview pose and to hand height when a camera is present', () => {
    const preview = new PaperStage();
    preview.getPaperRoot().position.set(2, 0.2, 2);
    preview.restartOrigamiSession(null);
    expect(preview.getPaperRoot().position.x).toBeCloseTo(0.34);
    expect(preview.getPaperRoot().position.y).toBeCloseTo(1.2);
    expect(preview.getPaperRoot().position.z).toBeCloseTo(-0.42);

    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    const spawned = new PaperStage();
    spawned.getPaperRoot().position.set(4, 0, 4);
    spawned.restartOrigamiSession(camera);
    expect(spawned.getPaperRoot().position.y).toBeGreaterThan(1.2);
    expect(spawned.getPaperRoot().position.y).toBeLessThan(1.7);
    expect(spawned.getPaperRoot().position.z).toBeLessThan(-0.3);
    expect(spawned.isFrozen()).toBe(false);
  });

  it('keeps step 1 foldable across three restarts and a fox-to-whale switch', () => {
    const stage = new PaperStage();
    for (let i = 0; i < 3; i += 1) {
      commitCurrent(stage.engine);
      stage.restartOrigamiSession(null);
      expect(stage.engine.currentStep?.id).toBe('diag-fold');
      expect(stage.engine.enginePhase).toBe('idle');
      stage.engine.beginGrab(grabPoint(stage));
      expect(stage.engine.enginePhase).toBe('folding');
      stage.engine.cancelActive();
      drain(stage.engine);
    }
    expect(stage.restartCount).toBe(3);
    expect(stage.sessionId).toBe('whale-3');

    stage.loadAnimal('fox');
    expect(stage.engine.currentStep?.id).toBe('fox-half');
    stage.loadAnimal('bat');
    expect(stage.engine.currentStep?.id).toBe(BAT_RECIPE.steps[0]?.id);
    expect(stage.engine.recipeId).toBe('origami-bat');
    stage.loadAnimal('whale');
    const generation = stage.sessionGeneration;
    stage.restartOrigamiSession(null);
    expect(stage.sessionGeneration).toBe(generation + 1);
    expect(stage.sessionId).toBe('whale-4');
    expect(stage.engine.recipeId).toBe('origami-whale');
    expect(stage.engine.currentStep?.id).toBe('diag-fold');
    expect(stage.interactionZones).toContain('moving-bottom');
    stage.engine.beginGrab(grabPoint(stage));
    expect(stage.engine.enginePhase).toBe('folding');
  });
});
