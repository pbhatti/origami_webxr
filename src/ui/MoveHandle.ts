import {
  CircleGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { pillTexture } from '../gallery/galleryGlass.ts';
import {
  MOVE_HANDLE_HIT_RADIUS_M,
  MOVE_HANDLE_OFFSET_LOCAL,
} from '../origami/placement.ts';
import { themeMaterial } from '../theme/tokens.ts';

const _world = new Vector3();

export const MOVE_HANDLE_INSPECTOR = {
  collider: false,
  meshBounds: false,
  interactionLayer: false,
};

export class MoveHandle {
  readonly group = new Group();
  readonly grabTarget: Mesh;
  private readonly tab: Mesh;
  private readonly collider: Mesh;
  private readonly bounds: LineSegments;
  private readonly layer: Mesh;
  private tone: 'ink' | 'active' = 'ink';

  constructor() {
    this.group.name = 'fold-fly-move-handle';
    this.group.position.set(...MOVE_HANDLE_OFFSET_LOCAL);

    this.tab = new Mesh(
      new PlaneGeometry(0.078, 0.03),
      themeMaterial(pillTexture('Move', 'ink')),
    );
    (this.tab.material as MeshBasicMaterial).side = DoubleSide;
    this.tab.userData.foldFlyMoveHandle = true;
    this.grabTarget = this.tab;

    this.bounds = new LineSegments(
      new EdgesGeometry(new PlaneGeometry(0.078, 0.03)),
      new LineBasicMaterial({ color: '#22d3ee' }),
    );
    this.bounds.visible = false;
    this.bounds.position.z = 0.002;
    this.bounds.raycast = () => {};

    this.collider = new Mesh(
      new CircleGeometry(MOVE_HANDLE_HIT_RADIUS_M, 28),
      new MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.collider.visible = false;
    this.collider.position.z = 0.001;
    this.collider.raycast = () => {};

    this.layer = new Mesh(
      new CircleGeometry(MOVE_HANDLE_HIT_RADIUS_M, 28),
      new MeshBasicMaterial({
        color: '#ff922e',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.layer.visible = false;
    this.layer.position.z = -0.001;
    this.layer.raycast = () => {};

    this.group.add(this.layer, this.collider, this.bounds, this.tab);
  }

  contains(worldPoint: Vector3, radiusM = MOVE_HANDLE_HIT_RADIUS_M): boolean {
    this.tab.updateWorldMatrix(true, false);
    this.tab.getWorldPosition(_world);
    return _world.distanceTo(worldPoint) <= radiusM;
  }

  setState(input: { hover: boolean; active: boolean }): void {
    const tone = input.active || input.hover ? 'active' : 'ink';
    if (tone !== this.tone) {
      this.tone = tone;
      const material = this.tab.material as MeshBasicMaterial;
      material.map = pillTexture('Move', tone);
      material.color.set('#ffffff');
      material.needsUpdate = true;
    }
    this.group.scale.setScalar(input.active ? 0.98 : input.hover ? 1.02 : 1);
    this.syncDebug();
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  private syncDebug(): void {
    this.collider.visible = MOVE_HANDLE_INSPECTOR.collider;
    this.bounds.visible = MOVE_HANDLE_INSPECTOR.meshBounds;
    this.layer.visible = MOVE_HANDLE_INSPECTOR.interactionLayer;
  }
}
