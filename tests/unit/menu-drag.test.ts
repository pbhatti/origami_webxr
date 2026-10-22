import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MENU_DRAG_CONFIG, MenuMover, menuFollowAlpha, poseIsReachable, rayDragPoint } from '../../src/gallery/menuDrag.ts';
import { HandSession } from '../../src/input/HandSession.ts';
import { emptyHandSample, type HandSample } from '../../src/input/HandTrackingAdapter.ts';
import { PINCH_ENGAGE_M, PINCH_RELEASE_M } from '../../src/input/PinchRecognizer.ts';

function closed(hand: 'left' | 'right'): HandSample {
  const tip: [number, number, number] = [0, 0, 0];
  return {
    ...emptyHandSample(hand),
    tracked: true,
    valid: true,
    jointCount: 2,
    pinchDistanceM: PINCH_ENGAGE_M * 0.5,
    pinchMidpoint: tip,
    indexTip: tip,
    thumbTip: tip,
    source: 'hand-joints',
  };
}

describe('menu drag mover', () => {
  it('keeps the grab offset so the menu does not jump when pinched', () => {
    const menu = new Object3D();
    menu.position.set(0.2, 1.1, -0.8);
    const mover = new MenuMover();
    mover.begin(menu, new Vector3(0.25, 1.12, -0.78), 'right');
    mover.update(menu, new Vector3(0.4, 1.3, -0.5), 'ok', 1);
    expect(menu.position.x).toBeGreaterThan(0.2);
    expect(menu.position.z).toBeGreaterThan(-0.8);
    const offsetX = 0.2 - 0.25;
    expect(menu.position.x).toBeCloseTo(0.4 + offsetX, 1);
    expect(menu.quaternion.w).toBeCloseTo(1, 5);
  });

  it('freezes at the last valid pose when tracking drops', () => {
    const menu = new Object3D();
    menu.position.set(0, 1, -1);
    const mover = new MenuMover();
    mover.begin(menu, new Vector3(0, 1, -1), 'left');
    mover.update(menu, new Vector3(0.2, 1.1, -0.7), 'ok', 1);
    const frozen = menu.position.clone();
    mover.update(menu, new Vector3(4, 8, -9), 'frozen', 1);
    expect(menu.position.distanceTo(frozen)).toBeLessThan(0.0001);
    expect(mover.dragState).toBe('tracking-lost');
  });

  it('restores the last dragged pose and falls back when it is out of reach', () => {
    const menu = new Object3D();
    const mover = new MenuMover();
    menu.position.set(0.1, 1.2, -0.9);
    mover.remember(menu, new Vector3(0, 1.3, 0));
    const viewer = new Vector3(0, 1.3, 0);
    const forward = new Vector3(0, 0, -1);
    menu.position.set(0, 0, 0);
    mover.restore(menu, viewer, forward, () => {
      menu.position.set(9, 9, 9);
    });
    expect(menu.position.x).toBeCloseTo(0.1);
    expect(menu.position.z).toBeCloseTo(-0.9);

    menu.position.set(8, 1, -8);
    mover.remember(menu, viewer);
    mover.restore(menu, viewer, forward, () => {
      menu.position.set(0.05, 1.24, -1.15);
    });
    expect(menu.position.z).toBeCloseTo(-1.15);
  });

  it('drags along the captured ray depth instead of the hand', () => {
    const menu = new Object3D();
    const mover = new MenuMover();
    const origin = new Vector3(0, 1.2, -0.2);
    const direction = new Vector3(0, 0, -1);
    const depth = 0.9;
    const hit = origin.clone().addScaledVector(direction, depth);
    const offset = new Vector3(0.16, 0.05, 0.02);
    const start = hit.clone().add(offset);
    menu.position.copy(start);
    mover.beginRay(menu, hit, depth, 'left');
    mover.updateRay(menu, origin, direction, 'ok', 1);
    expect(mover.dragMode).toBe('raycast');
    expect(menu.position.distanceTo(start)).toBeLessThan(0.02);

    const turned = new Vector3(0.25, 0.04, -1).normalize();
    mover.updateRay(menu, origin, turned, 'ok', 1);
    const expected = rayDragPoint(origin, turned, depth, offset, new Vector3());
    expect(menu.position.distanceTo(expected)).toBeLessThan(0.02);
    expect(menu.position.distanceTo(origin)).toBeGreaterThan(0.5);
    const frozen = menu.position.clone();
    mover.updateRay(menu, origin, turned, 'frozen', 1);
    expect(menu.position.distanceTo(frozen)).toBeLessThan(0.0001);
    mover.end(menu);
    mover.updateRay(menu, new Vector3(3, 3, 3), turned, 'ok', 1);
    expect(menu.position.distanceTo(frozen)).toBeLessThan(0.0001);
    expect(mover.dragMode).toBe('none');
  });

  it('smooths follow with the configured factor', () => {
    expect(menuFollowAlpha(MENU_DRAG_CONFIG.smoothing, 1 / 60)).toBeCloseTo(0.15);
    expect(poseIsReachable(new Vector3(0, 1.2, -1.1), new Vector3(0, 1.3, 0), new Vector3(0, 0, -1))).toBe(true);
    expect(poseIsReachable(new Vector3(0, 1.2, -8), new Vector3(0, 1.3, 0), new Vector3(0, 0, -1))).toBe(false);
  });
});

function pinchMenu(
  session: HandSession,
  sample: HandSample,
  extras: { menu?: boolean; gallery?: boolean; ray?: boolean },
  startMs = 0,
) {
  let snapshot = session.update({
    nowMs: startMs,
    left: sample.hand === 'left' ? sample : emptyHandSample('left'),
    right: sample.hand === 'right' ? sample : emptyHandSample('right'),
    leftLocal: sample.hand === 'left' ? [0, 0, 0] : null,
    rightLocal: sample.hand === 'right' ? [0, 0, 0] : null,
    leftPanel: false,
    rightPanel: false,
    leftMenu: sample.hand === 'left' && extras.menu,
    rightMenu: sample.hand === 'right' && extras.menu,
    leftGallery: sample.hand === 'left' && extras.gallery,
    rightGallery: sample.hand === 'right' && extras.gallery,
    leftRayHandle: sample.hand === 'left' && extras.ray,
    rightRayHandle: sample.hand === 'right' && extras.ray,
  });
  for (let i = 1; i < 3; i += 1) {
    snapshot = session.update({
      ...snapshotFrame(sample, extras, startMs + i),
    });
  }
  return snapshot;
}

function snapshotFrame(sample: HandSample, extras: { menu?: boolean; gallery?: boolean; ray?: boolean }, nowMs: number) {
  return {
    nowMs,
    left: sample.hand === 'left' ? sample : emptyHandSample('left'),
    right: sample.hand === 'right' ? sample : emptyHandSample('right'),
    leftLocal: sample.hand === 'left' ? ([0, 0, 0] as [number, number, number]) : null,
    rightLocal: sample.hand === 'right' ? ([0, 0, 0] as [number, number, number]) : null,
    leftPanel: false,
    rightPanel: false,
    leftMenu: sample.hand === 'left' && Boolean(extras.menu),
    rightMenu: sample.hand === 'right' && Boolean(extras.menu),
    leftGallery: sample.hand === 'left' && Boolean(extras.gallery),
    rightGallery: sample.hand === 'right' && Boolean(extras.gallery),
    leftRayHandle: sample.hand === 'left' && Boolean(extras.ray),
    rightRayHandle: sample.hand === 'right' && Boolean(extras.ray),
  };
}

describe('menu drag ownership', () => {
  it('lets either hand grab the menu without starting a fold', () => {
    const session = new HandSession();
    const grabbed = pinchMenu(session, closed('right'), { menu: true, gallery: true });
    expect(grabbed.menuDragging).toBe(true);
    expect(grabbed.menuOwner).toBe('right');
    expect(grabbed.foldOwner).toBeNull();
    expect(grabbed.paperMoving).toBe(false);

    const open: HandSample = { ...closed('right'), pinchDistanceM: PINCH_RELEASE_M * 1.5 };
    let released = pinchMenu(session, open, { menu: true, gallery: true }, 10);
    released = pinchMenu(session, open, { menu: true, gallery: true }, 14);
    expect(released.menuDragging).toBe(false);
  });

  it('does not start menu dragging when the pinch is on a card', () => {
    const session = new HandSession();
    const snapshot = pinchMenu(session, closed('left'), { menu: false, gallery: true });
    expect(snapshot.menuDragging).toBe(false);
    expect(snapshot.foldOwner).toBeNull();
  });

  it('grabs from a ray without treating a near pinch as a ray grab', () => {
    const aimed = new HandSession();
    const ray = pinchMenu(aimed, closed('left'), { ray: true, gallery: true });
    expect(ray.menuDragging).toBe(true);
    expect(ray.menuDragMode).toBe('raycast');
    expect(ray.foldOwner).toBeNull();

    const near = new HandSession();
    const direct = pinchMenu(near, closed('right'), { menu: true, ray: true, gallery: true });
    expect(direct.menuDragMode).toBe('direct');
    expect(direct.menuOwner).toBe('right');
  });
});
