import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { FOLD_GEOMETRY_INSPECTOR } from '../origami/foldGeometryInspector.ts';
import { PAPER_SIZE_M } from '../origami/placement.ts';
import type { InteractionSnapshot } from '../input/HandSession.ts';
import type { GrabRegion, Vec2 } from '../origami/types.ts';

function meshFromUv(polygon: Vec2[], color: string, name: string): Mesh {
  const shape = new Shape();
  polygon.forEach((uv, index) => {
    const x = (uv[0] - 0.5) * PAPER_SIZE_M;
    const y = (uv[1] - 0.5) * PAPER_SIZE_M;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });
  shape.closePath();
  const mesh = new Mesh(
    new ShapeGeometry(shape),
    new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.position.z = 0.006;
  mesh.name = name;
  mesh.renderOrder = 3;
  return mesh;
}

export class GrabRegionOverlay {
  readonly group = new Group();
  private moving: Mesh;
  private hold: Mesh;
  private readonly extras = new Group();
  private pulse = 0;
  private movingActive = false;
  private holdActive = false;
  private movingAllowed = false;

  constructor() {
    this.group.name = 'fold-fly-grab-regions';
    this.moving = meshFromUv(
      [
        [0.5, 0],
        [1, 0],
        [1, 1],
        [0.5, 1],
      ],
      '#ff7a3d',
      'moving-region',
    );
    this.hold = meshFromUv(
      [
        [0, 0],
        [0.5, 0],
        [0.5, 1],
        [0, 1],
      ],
      '#243b55',
      'hold-region',
    );
    this.extras.name = 'extra-moving-regions';
    this.moving.visible = false;
    this.hold.visible = false;
    this.group.add(this.hold, this.moving, this.extras);
  }

  setRegions(moving?: GrabRegion, hold?: GrabRegion, extraMoving: GrabRegion[] = []): void {
    this.movingActive = Boolean(moving);
    this.holdActive = Boolean(hold);
    this.movingAllowed = this.regionAllowed(moving);
    if (moving) {
      this.replace('moving', moving.polygonUV, '#ff7a3d');
    }
    this.moving.visible = this.movingActive && this.movingAllowed;
    if (hold) {
      this.replace('hold', hold.polygonUV, '#243b55');
    }
    this.hold.visible = this.holdActive;
    [...this.extras.children].forEach((child) => {
      this.extras.remove(child);
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as MeshBasicMaterial).dispose();
      }
    });
    extraMoving.forEach((region, index) => {
      if (region.id === moving?.id) {
        return;
      }
      const show =
        region.id.includes('left') ? FOLD_GEOMETRY_INSPECTOR.leftFoldRegion : FOLD_GEOMETRY_INSPECTOR.rightFoldRegion;
      if (!show) {
        return;
      }
      const color = region.id.includes('left') ? '#f59e0b' : '#fb7185';
      this.extras.add(meshFromUv(region.polygonUV, color, `moving-region-${index}`));
    });
    this.moving.visible = moving?.id.includes('left')
      ? FOLD_GEOMETRY_INSPECTOR.leftFoldRegion
      : moving?.id.includes('right')
        ? FOLD_GEOMETRY_INSPECTOR.rightFoldRegion
        : true;
  }

  apply(snapshot: InteractionSnapshot): void {
    if (snapshot.rejectedPulse) {
      this.pulse = 1;
    } else {
      this.pulse = Math.max(0, this.pulse - 0.08);
    }

    const movingMat = this.moving.material as MeshBasicMaterial;
    const holdMat = this.hold.material as MeshBasicMaterial;
    movingMat.opacity = snapshot.grabbed
      ? 0.55
      : snapshot.hoverMoving
        ? 0.38
        : 0.16 + this.pulse * 0.25;
    holdMat.opacity = snapshot.holdOwner ? 0.36 : snapshot.hoverHold ? 0.24 : 0.1;
    this.moving.visible = this.movingActive && this.movingAllowed;
    this.hold.visible = this.holdActive;
    this.extras.children.forEach((child) => {
      const extra = child as Mesh;
      (extra.material as MeshBasicMaterial).opacity = snapshot.hoverMoving ? 0.32 : 0.16 + this.pulse * 0.2;
    });
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.moving.visible = visible && this.movingActive && this.movingAllowed;
    this.hold.visible = visible && this.holdActive;
  }

  reset(): void {
    this.pulse = 0;
    (this.moving.material as MeshBasicMaterial).opacity = 0.12;
    (this.hold.material as MeshBasicMaterial).opacity = 0.08;
  }

  private regionAllowed(region?: GrabRegion): boolean {
    if (!region) {
      return false;
    }
    if (region.id.includes('left')) {
      return FOLD_GEOMETRY_INSPECTOR.leftFoldRegion;
    }
    if (region.id.includes('right')) {
      return FOLD_GEOMETRY_INSPECTOR.rightFoldRegion;
    }
    return true;
  }

  private replace(kind: 'moving' | 'hold', polygon: Vec2[], color: string): void {
    const current = kind === 'moving' ? this.moving : this.hold;
    this.group.remove(current);
    current.geometry.dispose();
    (current.material as MeshBasicMaterial).dispose();
    const next = meshFromUv(polygon, color, `${kind}-region`);
    if (kind === 'moving') {
      this.moving = next;
    } else {
      this.hold = next;
    }
    this.group.add(next);
  }
}
