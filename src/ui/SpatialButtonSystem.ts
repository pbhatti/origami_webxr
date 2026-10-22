import {
  Hovered,
  Pressed,
  RayInteractable,
  createSystem,
} from '@iwsdk/core';
import type { Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera } from 'three';
import type { AnimalId } from '../gallery/animals.ts';
import type { GalleryControl, GalleryPointerEvent } from '../gallery/OrigamiGallery.ts';
import type { ToolbarAction } from './SpatialToolbar.ts';

export interface SpatialButtonSystemHandlers {
  onAction: (action: ToolbarAction) => void;
  onGalleryEvent?: (event: GalleryPointerEvent) => void;
  onFrame?: (camera: PerspectiveCamera, dtSec: number) => void;
  isUiLocked?: () => boolean;
  isPlayLocked?: () => boolean;
  isGallerySelectLocked?: () => boolean;
}

const pressedLastFrame = new WeakSet<object>();

export function createSpatialButtonSystem(handlers: SpatialButtonSystemHandlers) {
  return class SpatialButtonSystem extends createSystem({
    buttons: { required: [RayInteractable] },
  }) {
    update(delta: number): void {
      handlers.onFrame?.(this.camera, delta);
      const locked = Boolean(handlers.isUiLocked?.());
      const playLocked = Boolean(handlers.isPlayLocked?.());
      const galleryLocked = Boolean(handlers.isGallerySelectLocked?.());
      let handleHot = false;
      this.queries.buttons.entities.forEach((entity) => {
        const object = entity.object3D as Object3D | undefined;
        if (!object?.visible) {
          return;
        }
        if (
          object.userData.foldFlyGalleryDrag === 'handle' &&
          (entity.hasComponent(Hovered) || entity.hasComponent(Pressed))
        ) {
          handleHot = true;
        }
      });
      this.queries.buttons.entities.forEach((entity) => {
        const object = entity.object3D as Object3D | undefined;
        if (!object || !object.visible) {
          return;
        }
        const action = object.userData.foldFlyAction as ToolbarAction | undefined;
        const galleryId = object.userData.foldFlyGalleryId as AnimalId | undefined;
        const control = object.userData.foldFlyGalleryControl as GalleryControl | undefined;
        const dragKind = object.userData.foldFlyGalleryDrag as 'handle' | 'background' | undefined;
        const hovered = entity.hasComponent(Hovered);
        const pressed = entity.hasComponent(Pressed);
        const wasPressed = pressedLastFrame.has(entity);

        if (action) {
          const mesh = object as Mesh;
          const material = mesh.material as MeshBasicMaterial | undefined;
          if (material?.color) {
            material.color.set(hovered ? '#fff6ec' : '#ffffff');
          }
          const scale = pressed ? 0.96 : hovered ? 1.02 : 1;
          mesh.scale.setScalar(scale);
          const exitAction = action === 'exit' || action === 'confirm-exit' || action === 'cancel-exit';
          if (pressed && !wasPressed && (exitAction || (!playLocked && (!locked || action === 'restart')))) {
            handlers.onAction(action);
          }
        }

        if (dragKind === 'handle') {
          handlers.onGalleryEvent?.({ type: 'drag-hover', hovered });
        }

        if (!locked && !galleryLocked && !playLocked && !handleHot && galleryId) {
          handlers.onGalleryEvent?.({ type: 'hover', id: galleryId, hovered });
          if (pressed && !wasPressed) {
            handlers.onGalleryEvent?.({ type: 'press', id: galleryId });
          }
        }

        if (!locked && !galleryLocked && !playLocked && control && pressed && !wasPressed) {
          handlers.onGalleryEvent?.({ type: 'control', control });
        }

        if (pressed) {
          pressedLastFrame.add(entity);
        } else {
          pressedLastFrame.delete(entity);
        }
      });
    }
  };
}
