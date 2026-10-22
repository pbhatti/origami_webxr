import { PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import { Mesh, type MeshBasicMaterial, PlaneGeometry } from 'three';
import { exitPillTexture, pillTexture, type PillTone } from '../gallery/galleryGlass.ts';
import { TOOLBAR_OFFSET_LOCAL } from '../origami/placement.ts';
import { themeMaterial } from '../theme/tokens.ts';
import { COPY } from './welcomeCopy.ts';

export type ToolbarAction =
  | 'menu'
  | 'recenter'
  | 'restart'
  | 'help'
  | 'debug'
  | 'exit'
  | 'confirm-exit'
  | 'cancel-exit';

const BUTTONS: Array<{ action: ToolbarAction; label: string; icon?: 'x' }> = [
  { action: 'menu', label: COPY.session.menu },
  { action: 'recenter', label: COPY.session.recenter },
  { action: 'restart', label: COPY.session.restart },
  { action: 'help', label: COPY.session.help },
  { action: 'debug', label: COPY.session.debug },
  { action: 'exit', label: COPY.session.exit, icon: 'x' },
];

export class SpatialToolbar {
  private readonly buttons = new Map<ToolbarAction, Mesh>();
  private readonly active = new Set<ToolbarAction>();

  mount(world: World, parent: ReturnType<World['createTransformEntity']>): void {
    BUTTONS.forEach((button, index) => {
      const mesh = new Mesh(
        new PlaneGeometry(0.148, 0.034),
        themeMaterial(button.icon === 'x' ? exitPillTexture(button.label) : pillTexture(button.label, 'quiet')),
      );
      mesh.position.set(
        TOOLBAR_OFFSET_LOCAL[0],
        TOOLBAR_OFFSET_LOCAL[1] + 0.08 - index * 0.04,
        TOOLBAR_OFFSET_LOCAL[2],
      );
      mesh.userData.foldFlyAction = button.action;
      mesh.visible = button.action !== 'menu';
      this.buttons.set(button.action, mesh);
      const entity = world.createTransformEntity(mesh, {
        parent,
        persistent: true,
      });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
    });
    void document.fonts?.ready.then(() => this.refreshLabels());
  }

  setActionVisible(action: ToolbarAction, visible: boolean): void {
    const mesh = this.buttons.get(action);
    if (mesh) {
      mesh.visible = visible;
    }
  }

  setActive(action: ToolbarAction, active: boolean): void {
    if (active) {
      this.active.add(action);
    } else {
      this.active.delete(action);
    }
    this.paint(action);
  }

  private refreshLabels(): void {
    for (const action of this.buttons.keys()) {
      this.paint(action);
    }
  }

  private paint(action: ToolbarAction): void {
    const mesh = this.buttons.get(action);
    const spec = BUTTONS.find((button) => button.action === action);
    if (!mesh || !spec) {
      return;
    }
    const tone: PillTone = this.active.has(action) ? 'active' : 'quiet';
    const material = mesh.material as MeshBasicMaterial;
    material.map = spec.icon === 'x' ? exitPillTexture(spec.label) : pillTexture(spec.label, tone);
    material.needsUpdate = true;
  }
}
