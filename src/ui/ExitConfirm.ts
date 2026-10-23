import { PokeInteractable, RayInteractable, type Entity, type World } from '@iwsdk/core';
import {
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  type MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { pillTexture } from '../gallery/galleryGlass.ts';
import { FONT_SANS, theme, themeMaterial } from '../theme/tokens.ts';
import { COPY } from './welcomeCopy.ts';

const PAD_PX = 48;
const TITLE_PX = 52;
const BODY_PX = 30;
const NOTICE_PX = 26;
const BUTTON_PX = 96;
const TEXT_GAP_PX = 16;
const BUTTON_GAP_PX = 36;
const BUTTON_COL_GAP_PX = 24;
const METERS_PER_PX = 0.00042;
const BUTTON_Z = 0.008;

export interface ExitConfirmButtonLayout {
  id: 'yes' | 'no';
  action: 'confirm-exit' | 'cancel-exit';
  label: string;
  tone: 'ink' | 'quiet';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface ExitConfirmLayout {
  canvasW: number;
  canvasH: number;
  worldW: number;
  worldH: number;
  padM: number;
  textBottomY: number;
  buttons: [ExitConfirmButtonLayout, ExitConfirmButtonLayout];
}

/**
 * Sizes the panel from the heading, description, and button row.
 * Padding is the same on every side. Buttons sit below the description.
 */
export function layoutExitConfirm(
  measure: (text: string, size: number) => number,
  notice = '',
): ExitConfirmLayout {
  const title = COPY.session.leaveHeading;
  const body = COPY.session.leaveBody;
  const titleW = Math.max(measure(title, TITLE_PX), title.length * TITLE_PX * 0.52);
  const bodyW = Math.max(measure(body, BODY_PX), body.length * BODY_PX * 0.5);
  const noticeW = notice
    ? Math.max(measure(notice, NOTICE_PX), notice.length * NOTICE_PX * 0.48)
    : 0;
  const contentW = Math.max(titleW, bodyW, noticeW, 560);
  const canvasW = Math.ceil(contentW + PAD_PX * 2);
  const noticeBlock = notice ? TEXT_GAP_PX + NOTICE_PX : 0;
  const canvasH = Math.ceil(
    PAD_PX + TITLE_PX + TEXT_GAP_PX + BODY_PX + noticeBlock + BUTTON_GAP_PX + BUTTON_PX + PAD_PX,
  );
  const buttonW = (canvasW - PAD_PX * 2 - BUTTON_COL_GAP_PX) / 2;
  const buttonCenterY = canvasH - PAD_PX - BUTTON_PX / 2;
  const textBottomPx = PAD_PX + TITLE_PX + TEXT_GAP_PX + BODY_PX + noticeBlock;
  const toX = (px: number) => (px - canvasW / 2) * METERS_PER_PX;
  const toY = (px: number) => (canvasH / 2 - px) * METERS_PER_PX;
  const yes: ExitConfirmButtonLayout = {
    id: 'yes',
    action: 'confirm-exit',
    label: COPY.session.yesLeave,
    tone: 'ink',
    x: toX(PAD_PX + buttonW / 2),
    y: toY(buttonCenterY),
    w: buttonW * METERS_PER_PX,
    h: BUTTON_PX * METERS_PER_PX,
    z: BUTTON_Z,
  };
  const no: ExitConfirmButtonLayout = {
    id: 'no',
    action: 'cancel-exit',
    label: COPY.session.noStay,
    tone: 'quiet',
    x: toX(PAD_PX + buttonW + BUTTON_COL_GAP_PX + buttonW / 2),
    y: toY(buttonCenterY),
    w: buttonW * METERS_PER_PX,
    h: BUTTON_PX * METERS_PER_PX,
    z: BUTTON_Z,
  };
  return {
    canvasW,
    canvasH,
    worldW: canvasW * METERS_PER_PX,
    worldH: canvasH * METERS_PER_PX,
    padM: PAD_PX * METERS_PER_PX,
    textBottomY: toY(textBottomPx),
    buttons: [yes, no],
  };
}

const _world = new Vector3();

/**
 * One confirmation panel. Button meshes are children of this group entity so
 * the transform system cannot pull them off the panel.
 */
export class ExitConfirm {
  readonly group = new Group();
  private readonly panel: Mesh;
  private readonly confirm: Mesh;
  private readonly cancel: Mesh;
  private readonly baseRaycast: Mesh['raycast'];
  private layout = layoutExitConfirm(() => 0);
  private notice = '';
  private panelEntity: Entity | null = null;
  private colliderReady = false;
  private open = false;

  constructor() {
    this.group.name = 'fold-play-exit-confirm';
    this.group.visible = false;
    this.group.position.set(0, 0.02, 0.06);
    this.panel = new Mesh(new PlaneGeometry(1, 1), themeMaterial(null));
    this.panel.name = 'fold-play-exit-panel';
    this.panel.renderOrder = 30;
    const panelMaterial = this.panel.material as MeshBasicMaterial;
    panelMaterial.side = DoubleSide;
    panelMaterial.depthWrite = false;
    this.confirm = this.button('confirm-exit', 'ink');
    this.cancel = this.button('cancel-exit', 'quiet');
    this.baseRaycast = this.confirm.raycast;
    this.group.add(this.panel, this.confirm, this.cancel);
    this.applyLayout(this.measure());
    void document.fonts?.ready.then(() => {
      if (this.notice === '') {
        this.applyLayout(this.measure());
      }
    });
  }

  mount(world: World, parent: ReturnType<World['createTransformEntity']>): void {
    this.panelEntity = world.createTransformEntity(this.group, { parent, persistent: true });
    let colliders = 0;
    for (const mesh of [this.confirm, this.cancel]) {
      const entity = world.createTransformEntity(mesh, {
        parent: this.panelEntity,
        persistent: true,
      });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      if (entity.hasComponent(RayInteractable) && entity.hasComponent(PokeInteractable) && mesh.parent === this.group) {
        colliders += 1;
      }
    }
    this.colliderReady = colliders === 2;
    this.logState('mounted');
  }

  setVisible(visible: boolean, notice = ''): void {
    const nextNotice = visible ? notice : '';
    if (nextNotice !== this.notice) {
      this.notice = nextNotice;
      this.applyLayout(this.measure());
    }
    this.open = visible;
    this.group.visible = visible;
    this.confirm.visible = visible;
    this.cancel.visible = visible;
    const raycast = visible ? this.baseRaycast : () => {};
    this.confirm.raycast = raycast;
    this.cancel.raycast = raycast;
    if (visible) {
      this.logState('open');
    }
  }

  face(cameraPosition: { x: number; y: number; z: number }): void {
    if (!this.group.visible) {
      return;
    }
    this.group.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  }

  private button(action: 'confirm-exit' | 'cancel-exit', tone: 'ink' | 'quiet'): Mesh {
    const label = action === 'confirm-exit' ? COPY.session.yesLeave : COPY.session.noStay;
    const mesh = new Mesh(new PlaneGeometry(0.12, 0.034), themeMaterial(pillTexture(label, tone)));
    mesh.name = `fold-play-${action}`;
    mesh.userData.foldFlyAction = action;
    mesh.renderOrder = 31;
    mesh.frustumCulled = false;
    const material = mesh.material as MeshBasicMaterial;
    material.side = DoubleSide;
    material.depthTest = false;
    material.depthWrite = false;
    return mesh;
  }

  private measure(): (text: string, size: number) => number {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return (text: string, size: number) => {
      if (!ctx) {
        return text.length * size * 0.52;
      }
      ctx.font = `500 ${size}px ${FONT_SANS}`;
      const width = ctx.measureText(text).width;
      return width > 8 ? width : text.length * size * 0.52;
    };
  }

  private applyLayout(measure: (text: string, size: number) => number): void {
    this.layout = layoutExitConfirm(measure, this.notice);
    const { worldW, worldH, buttons } = this.layout;
    this.panel.geometry.dispose();
    this.panel.geometry = new PlaneGeometry(worldW, worldH);
    const material = this.panel.material as MeshBasicMaterial;
    material.map?.dispose();
    material.map = panelTexture(this.layout, this.notice);
    material.needsUpdate = true;
    for (const spec of buttons) {
      const mesh = spec.id === 'yes' ? this.confirm : this.cancel;
      mesh.geometry.dispose();
      mesh.geometry = new PlaneGeometry(spec.w, spec.h);
      mesh.position.set(spec.x, spec.y, spec.z);
    }
  }

  private logState(event: 'mounted' | 'open'): void {
    this.group.updateWorldMatrix(true, true);
    const buttons = this.layout.buttons.map((spec) => {
      const mesh = spec.id === 'yes' ? this.confirm : this.cancel;
      mesh.getWorldPosition(_world);
      return {
        label: spec.label,
        visible: mesh.visible,
        parent: mesh.parent?.name ?? null,
        local: [Number(mesh.position.x.toFixed(4)), Number(mesh.position.y.toFixed(4)), Number(mesh.position.z.toFixed(4))],
        world: [Number(_world.x.toFixed(4)), Number(_world.y.toFixed(4)), Number(_world.z.toFixed(4))],
        collider: this.colliderReady ? 'ray+poke' : 'missing',
      };
    });
    console.info('[FoldPlay] exit-confirm', {
      event,
      state: this.open ? 'open' : 'closed',
      dimensions: {
        canvas: [this.layout.canvasW, this.layout.canvasH],
        world: [Number(this.layout.worldW.toFixed(4)), Number(this.layout.worldH.toFixed(4))],
        padM: Number(this.layout.padM.toFixed(4)),
      },
      buttonCount: buttons.length,
      buttons,
    });
  }
}

function panelTexture(layout: ExitConfirmLayout, notice: string): CanvasTexture {
  const { canvasW, canvasH } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  const radius = 46;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(canvasW, 0, canvasW, canvasH, radius);
  ctx.arcTo(canvasW, canvasH, 0, canvasH, radius);
  ctx.arcTo(0, canvasH, 0, 0, radius);
  ctx.arcTo(0, 0, canvasW, 0, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 252, 248, 0.96)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = theme.colors.dark;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.font = `500 ${TITLE_PX}px ${FONT_SANS}`;
  ctx.fillText(COPY.session.leaveHeading, canvasW / 2, PAD_PX + TITLE_PX / 2);
  ctx.fillStyle = theme.colors.textSecondary;
  ctx.font = `400 ${BODY_PX}px ${FONT_SANS}`;
  ctx.fillText(COPY.session.leaveBody, canvasW / 2, PAD_PX + TITLE_PX + TEXT_GAP_PX + BODY_PX / 2);
  if (notice) {
    ctx.fillStyle = theme.colors.accent;
    ctx.font = `500 ${NOTICE_PX}px ${FONT_SANS}`;
    const noticeY = PAD_PX + TITLE_PX + TEXT_GAP_PX + BODY_PX + TEXT_GAP_PX + NOTICE_PX / 2;
    ctx.fillText(notice, canvasW / 2, noticeY);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
