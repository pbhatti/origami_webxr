import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { HandSample } from '../input/HandTrackingAdapter.ts';
import type { HandId } from '../input/HandOwnership.ts';

const GEOMETRY = new SphereGeometry(0.007, 12, 12);

function dot(color: string, name: string): Mesh {
  const mesh = new Mesh(
    GEOMETRY,
    new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    }),
  );
  mesh.name = name;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return mesh;
}

export class HandIndicators {
  readonly group = new Group();
  private readonly dots: Record<HandId, { index: Mesh; thumb: Mesh }> = {
    left: {
      index: dot('#243b55', 'left-index'),
      thumb: dot('#6b8f71', 'left-thumb'),
    },
    right: {
      index: dot('#c9a227', 'right-index'),
      thumb: dot('#e24a1a', 'right-thumb'),
    },
  };

  constructor() {
    this.group.name = 'fold-fly-hand-indicators';
    this.group.add(
      this.dots.left.index,
      this.dots.left.thumb,
      this.dots.right.index,
      this.dots.right.thumb,
    );
  }

  update(left: HandSample, right: HandSample, visible: boolean): void {
    this.place('left', left, visible);
    this.place('right', right, visible);
  }

  dispose(): void {
    this.group.removeFromParent();
  }

  private place(hand: HandId, sample: HandSample, visible: boolean): void {
    const pair = this.dots[hand];
    this.setDot(pair.index, visible ? sample.indexTip : null);
    this.setDot(pair.thumb, visible ? sample.thumbTip : null);
  }

  private setDot(mesh: Mesh, point: HandSample['indexTip']): void {
    if (!point) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set(point[0], point[1], point[2]);
  }
}
