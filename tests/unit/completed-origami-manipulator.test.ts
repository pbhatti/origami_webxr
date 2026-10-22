import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CREATURE_SCALE,
  CompletedOrigamiManipulator,
  nextUniformScale,
  type PlayHandSample,
  type PlayManipulationFrame,
} from '../../src/animation/CompletedOrigamiManipulator.ts';
import { PaperStage } from '../../src/origami/PaperStage.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

const savedScale = { ...CREATURE_SCALE };

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

afterEach(() => {
  Object.assign(CREATURE_SCALE, savedScale);
});

function hand(point: Vector3 | null, pinching = point != null, tracking: PlayHandSample['tracking'] = 'ok'): PlayHandSample {
  return { pinching, tracking, point };
}

function frame(
  left: PlayHandSample,
  right: PlayHandSample,
  extra: Partial<Pick<PlayManipulationFrame, 'dtSec' | 'viewer'>> = {},
): PlayManipulationFrame {
  return {
    left,
    right,
    dtSec: extra.dtSec ?? 1 / 72,
    viewer: extra.viewer === undefined ? null : extra.viewer,
  };
}

function rig() {
  const animal = new Group();
  const scaleRoot = new Group();
  const model = new Mesh(new BoxGeometry(0.2, 0.12, 0.02));
  const wing = new Group();
  wing.name = 'wing';
  wing.rotation.y = 0.42;
  wing.position.set(0.08, 0.01, 0);
  model.add(wing);
  scaleRoot.add(model);
  const panel = new Group();
  panel.name = 'panel';
  animal.add(scaleRoot, panel);
  animal.position.set(0, 1.2, -0.6);
  const manipulator = new CompletedOrigamiManipulator(animal, scaleRoot);
  animal.updateWorldMatrix(true, true);
  return { animal, scaleRoot, model, wing, panel, manipulator };
}

function at(x: number, y = 1.2, z = -0.6): Vector3 {
  return new Vector3(x, y, z);
}

function settle(manipulator: CompletedOrigamiManipulator, sample: PlayManipulationFrame, frames = 16): void {
  for (let i = 0; i < frames; i += 1) {
    manipulator.update(sample);
  }
}

describe('nextUniformScale', () => {
  it('scales from the gesture’s starting distance and stays inside the limits', () => {
    expect(nextUniformScale(1, 0.2, 0.2)).toBeCloseTo(1);
    expect(nextUniformScale(1.5, 0.2, 0.4)).toBeCloseTo(3);
    expect(nextUniformScale(1, 0.2, 0.08)).toBeCloseTo(0.4);
    expect(nextUniformScale(1, 0.2, 2)).toBe(CREATURE_SCALE.maxScale);
    expect(nextUniformScale(1, 0.2, 0.01)).toBe(CREATURE_SCALE.minScale);
  });
});

describe('CompletedOrigamiManipulator', () => {
  it('enlarges uniformly when both pinches move outward and does not translate', () => {
    CREATURE_SCALE.smoothing = 80;
    const { animal, scaleRoot, wing, panel, manipulator } = rig();
    const start = animal.position.clone();
    manipulator.update(frame(hand(at(-0.04)), hand(at(0.04))));
    expect(scaleRoot.scale.x).toBeCloseTo(1, 2);
    expect(animal.position.distanceTo(start)).toBeLessThan(1e-6);

    const spread = frame(hand(at(-0.12)), hand(at(0.16)));
    settle(manipulator, spread);
    expect(scaleRoot.scale.x).toBeCloseTo(3, 1);
    expect(scaleRoot.scale.y).toBeCloseTo(scaleRoot.scale.x);
    expect(scaleRoot.scale.z).toBeCloseTo(scaleRoot.scale.x);
    expect(animal.position.distanceTo(start)).toBeLessThan(1e-6);
    expect(panel.scale.x).toBe(1);
    expect(wing.rotation.y).toBeCloseTo(0.42);
    expect(wing.position.x).toBeCloseTo(0.08);
    expect(manipulator.state).toBe('TWO_HAND_SCALING');
  });

  it('shrinks when both pinches move inward and keeps a light step on the first frame', () => {
    const { scaleRoot, manipulator } = rig();
    manipulator.update(frame(hand(at(-0.05)), hand(at(0.05))));
    const inward = frame(hand(at(-0.025)), hand(at(0.025)));
    manipulator.update(inward);
    expect(scaleRoot.scale.x).toBeGreaterThan(0.4);
    expect(scaleRoot.scale.x).toBeLessThan(0.95);
    settle(manipulator, inward, 40);
    expect(scaleRoot.scale.x).toBeCloseTo(0.5, 1);
    expect(scaleRoot.scale.y).toBeCloseTo(scaleRoot.scale.x);
    expect(scaleRoot.scale.z).toBeCloseTo(scaleRoot.scale.x);
  });

  it('preserves the new size when either pinch releases and does not jump', () => {
    CREATURE_SCALE.smoothing = 80;
    const { animal, scaleRoot, manipulator } = rig();
    settle(manipulator, frame(hand(at(-0.04)), hand(at(0.04))));
    settle(manipulator, frame(hand(at(-0.08)), hand(at(0.08))));
    const scaled = scaleRoot.scale.x;
    const parked = animal.position.clone();
    expect(scaled).toBeGreaterThan(1.5);

    manipulator.update(frame(hand(at(-1.2)), hand(null, false)));
    expect(scaleRoot.scale.x).toBeCloseTo(scaled);
    expect(animal.position.distanceTo(parked)).toBeLessThan(1e-6);
    expect(manipulator.state).toBe('RELEASED');
    expect(manipulator.blocksUi).toBe(false);
  });

  it('keeps a single-hand grab when the other pinch stays on the animal', () => {
    CREATURE_SCALE.smoothing = 80;
    const { animal, manipulator } = rig();
    settle(manipulator, frame(hand(at(-0.03)), hand(at(0.03))));
    settle(manipulator, frame(hand(at(-0.06)), hand(at(0.06))));
    const parked = animal.position.clone();
    manipulator.update(frame(hand(at(-0.03)), hand(null, false)));
    expect(manipulator.state).toBe('SINGLE_HAND_GRAB');
    expect(animal.position.distanceTo(parked)).toBeLessThan(1e-6);
    manipulator.update(frame(hand(at(0.07)), hand(null, false)));
    expect(animal.position.x).toBeCloseTo(parked.x + 0.1, 2);
    expect(manipulator.scale).toBeGreaterThan(1);
  });

  it('relocates with one hand and lets two hands take over without a jump', () => {
    const { animal, model, manipulator } = rig();
    animal.rotation.x = -0.35;
    animal.updateWorldMatrix(true, true);
    const grabbed = new Vector3(0.04, 0.02, 0);
    model.localToWorld(grabbed);
    manipulator.update(frame(hand(null, false), hand(grabbed)));
    expect(manipulator.state).toBe('SINGLE_HAND_GRAB');
    const moved = grabbed.clone().add(new Vector3(0.05, -0.02, 0.04));
    manipulator.update(frame(hand(null, false), hand(moved)));
    const follow = new Vector3(0.04, 0.02, 0);
    model.updateWorldMatrix(true, false);
    model.localToWorld(follow);
    expect(follow.distanceTo(moved)).toBeLessThan(0.002);

    const left = moved.clone().add(new Vector3(-0.06, 0, 0));
    const right = moved.clone().add(new Vector3(0.06, 0, 0));
    const before = animal.position.clone();
    manipulator.update(frame(hand(left), hand(right)));
    expect(manipulator.state).toBe('TWO_HAND_SCALING');
    expect(animal.position.distanceTo(before)).toBeLessThan(1e-6);
  });

  it('keeps the last scale when tracking is lost and ignores the stale pinch', () => {
    CREATURE_SCALE.smoothing = 80;
    const { animal, manipulator } = rig();
    settle(manipulator, frame(hand(at(-0.04)), hand(at(0.04))));
    settle(manipulator, frame(hand(at(-0.08)), hand(at(0.08))));
    const scaled = manipulator.scale;
    const parked = animal.position.clone();
    manipulator.update(frame(
      hand(at(-0.2), true, 'cancelled'),
      hand(at(0.2)),
    ));
    expect(manipulator.state).toBe('TRACKING_LOST');
    expect(manipulator.scale).toBeCloseTo(scaled);
    expect(animal.position.distanceTo(parked)).toBeLessThan(1e-6);
    expect(manipulator.blocksUi).toBe(false);

    manipulator.update(frame(hand(at(-0.2)), hand(at(0.2))));
    expect(manipulator.scale).toBeCloseTo(scaled);
    manipulator.update(frame(hand(null, false), hand(null, false)));
    manipulator.update(frame(hand(at(-0.04)), hand(at(0.04))));
    expect(manipulator.state).toBe('TWO_HAND_SCALING');
  });

  it('resets size and forgets a pinch that is still closed', () => {
    CREATURE_SCALE.smoothing = 80;
    const { scaleRoot, manipulator } = rig();
    settle(manipulator, frame(hand(at(-0.04)), hand(at(0.04))));
    settle(manipulator, frame(hand(at(-0.08)), hand(at(0.08))));
    expect(scaleRoot.scale.x).toBeGreaterThan(1.5);
    manipulator.reset();
    expect(scaleRoot.scale.x).toBeCloseTo(1);
    expect(scaleRoot.scale.y).toBeCloseTo(1);
    expect(scaleRoot.scale.z).toBeCloseTo(1);
    expect(manipulator.state).toBe('IDLE');
    manipulator.update(frame(hand(at(-0.08)), hand(at(0.08))));
    expect(scaleRoot.scale.x).toBeCloseTo(1);
    expect(manipulator.state).not.toBe('TWO_HAND_SCALING');
  });

  it('does not scale while the feature is disabled or the play session is asleep', () => {
    const { scaleRoot, manipulator } = rig();
    CREATURE_SCALE.enabled = false;
    settle(manipulator, frame(hand(at(-0.04)), hand(at(0.08))));
    expect(scaleRoot.scale.x).toBeCloseTo(1);
    CREATURE_SCALE.enabled = true;
    CREATURE_SCALE.smoothing = 80;
    manipulator.update(frame(hand(at(-0.04)), hand(at(0.04))));
    settle(manipulator, frame(hand(at(-0.08)), hand(at(0.08))));
    const scaled = scaleRoot.scale.x;
    expect(scaled).toBeGreaterThan(1.5);
    manipulator.sleep();
    expect(manipulator.blocksUi).toBe(false);
    expect(scaleRoot.scale.x).toBeCloseTo(scaled);
    manipulator.update(frame(hand(at(-0.12)), hand(at(0.12))));
    expect(manipulator.state).not.toBe('TWO_HAND_SCALING');
    expect(scaleRoot.scale.x).toBeCloseTo(scaled);
  });

  it('stops growing when the animal would reach the viewer', () => {
    CREATURE_SCALE.smoothing = 80;
    const { manipulator } = rig();
    const viewer = at(0, 1.2, -0.45);
    settle(manipulator, frame(hand(at(-0.04)), hand(at(0.04)), { viewer }));
    settle(manipulator, frame(hand(at(-0.2)), hand(at(0.2)), { viewer }), 20);
    expect(manipulator.scale).toBeLessThan(1.15);
  });

  it('shows the scale indicator while scaling and keeps pinch markers off by default', () => {
    const { animal, manipulator } = rig();
    manipulator.update(frame(hand(at(-0.04)), hand(at(0.04))));
    expect(animal.getObjectByName('origami-scale-indicator')?.visible).toBe(true);
    expect(animal.getObjectByName('origami-scale-outline')?.visible).toBe(true);
    expect(animal.getObjectByName('origami-pinch-left')?.visible).toBe(false);
    CREATURE_SCALE.showPinchPoints = true;
    manipulator.update(frame(hand(at(-0.05)), hand(at(0.05))));
    expect(animal.getObjectByName('origami-pinch-left')?.visible).toBe(true);
    expect(animal.getObjectByName('origami-pinch-right')?.visible).toBe(true);
  });
});

describe('completed animals share one scale root', () => {
  it('scales whale, fox, and bat from the parent and Fold Again restores 1×', () => {
    CREATURE_SCALE.smoothing = 80;
    for (const id of ['whale', 'fox', 'bat', 'owl'] as const) {
      const stage = new PaperStage();
      stage.loadAnimal(id);
      stage.startCreature();
      const sheet = stage.getPaperRoot().getObjectByName('fold-fly-paper-sheet');
      const panel = stage.getPaperRoot().getObjectByName('unified-folding-panel');
      expect(sheet?.parent?.name).toBe('origami-scale-root');
      expect(panel?.parent).toBe(stage.getPaperRoot());
      expect(stage.validateSession().ok).toBe(true);
      stage.manipulator.update(frame(hand(null, false), hand(null, false)));

      const wing = new Vector3();
      if (id === 'bat') {
        stage.batCreature.tick(0.2);
        const batWing = stage.getPaperRoot().getObjectByName('bat-wing-left');
        wing.copy(batWing?.rotation ?? new Vector3());
        expect(batWing?.parent?.parent?.parent?.name).toBe('origami-scale-root');
      }

      stage.manipulator.update(frame(hand(at(-0.03, 0, 0)), hand(at(0.03, 0, 0))));
      settle(stage.manipulator, frame(hand(at(-0.09, 0, 0)), hand(at(0.09, 0, 0))));
      const scaleRoot = sheet?.parent;
      expect(scaleRoot).toBeTruthy();
      expect(scaleRoot?.scale.x).toBeGreaterThan(1.5);
      expect(scaleRoot?.scale.y).toBeCloseTo(scaleRoot?.scale.x ?? 0);
      expect(panel?.scale.x).toBe(1);
      if (id === 'bat') {
        const batWing = stage.getPaperRoot().getObjectByName('bat-wing-left');
        expect(batWing?.rotation.y).toBeCloseTo(wing.y);
      }

      stage.restartOrigamiSession(null);
      expect(sheet?.parent?.scale.x).toBeCloseTo(1);
      expect(stage.manipulator.state).toBe('IDLE');
      stage.manipulator.update(frame(hand(at(-0.09, 0, 0)), hand(at(0.09, 0, 0))));
      expect(sheet?.parent?.scale.x).toBeCloseTo(1);
      expect(stage.engine.enginePhase).toBe('idle');
    }
  });

  it('leaves a camera restart at the original size', () => {
    const stage = new PaperStage();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    stage.startCreature();
    CREATURE_SCALE.smoothing = 80;
    stage.manipulator.update(frame(hand(at(-0.03, 0, 0)), hand(null, false)));
    stage.restartOrigamiSession(camera);
    const sheet = stage.getPaperRoot().getObjectByName('fold-fly-paper-sheet');
    expect(sheet?.parent?.scale.x).toBeCloseTo(1);
    expect(stage.getPaperRoot().position.y).toBeGreaterThan(1.2);
  });
});
