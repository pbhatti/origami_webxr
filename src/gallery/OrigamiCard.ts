import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { theme } from '../theme/tokens.ts';
import { createLabelTexture } from '../ui/labelTexture.ts';
import { lerp } from '../utils/math.ts';
import { COPY } from '../ui/welcomeCopy.ts';
import type { AnimalDefinition } from './animals.ts';
import { cardGlassTexture, cardGradientFor, glassMaterial, pillTexture, sharedShadowMaterial, sheenTexture } from './galleryGlass.ts';

export const CARD_WIDTH = 0.158;
export const CARD_HEIGHT = 0.192;

const HOVER_SETTLE_SEC = theme.animation.hoverMs / 3000;
const PRESS_HOLD_SEC = theme.animation.pressMs / 1000;
const PRESS_SCALE = 0.97;
const HOVER_MODEL_SCALE = 1.04;
const HOVER_PILL_SCALE = 1.06;

const cardPlane = new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
const shadowPlane = new PlaneGeometry(CARD_WIDTH * 1.14, CARD_HEIGHT * 1.12);
const sheenPlane = new PlaneGeometry(CARD_WIDTH * 0.68, CARD_HEIGHT * 0.46);
const namePlane = new PlaneGeometry(0.142, 0.03);
const pillPlane = new PlaneGeometry(0.118, 0.027);

export class OrigamiCard {
  readonly group = new Group();
  readonly hit: Mesh;
  readonly modelRoot = new Group();
  readonly animal: AnimalDefinition;
  private readonly nameplate: Mesh;
  private readonly pill: Mesh;
  private readonly sheen: Mesh;
  private hover = false;
  private selected = false;
  private press = 0;
  private cardScale = 1;
  private modelScale = 1;
  private pillScale = 1;
  private sheenOpacity = 0.08;

  constructor(animal: AnimalDefinition, model: Group) {
    this.animal = animal;
    this.group.name = `origami-card-${animal.id}`;

    const gradient = cardGradientFor(animal.id);
    const backing = new Mesh(cardPlane, glassMaterial(cardGlassTexture(gradient.from, gradient.to)));
    backing.position.z = 0.002;
    backing.renderOrder = 2;

    const shadow = new Mesh(shadowPlane, sharedShadowMaterial());
    shadow.position.set(0, -0.007, -0.008);
    shadow.renderOrder = 1;

    this.sheen = new Mesh(sheenPlane, glassMaterial(sheenTexture(), this.sheenOpacity));
    this.sheen.position.set(0, 0.004, 0.008);
    this.sheen.renderOrder = 3;

    this.hit = new Mesh(cardPlane, new MeshBasicMaterial({ visible: false }));
    this.hit.position.z = 0.024;
    this.hit.name = `card-hit-${animal.id}`;

    this.modelRoot.add(model);
    this.modelRoot.position.set(0, 0.008, 0.016);

    this.nameplate = new Mesh(namePlane, this.nameMaterial());
    this.nameplate.position.set(0, CARD_HEIGHT / 2 - 0.022, 0.02);
    this.nameplate.renderOrder = 5;

    this.pill = new Mesh(pillPlane, this.pillMaterial());
    this.pill.position.set(0, -CARD_HEIGHT / 2 + 0.024, 0.02);
    this.pill.renderOrder = 5;
    if (!animal.playable) {
      this.pill.scale.setScalar(0.96);
    }

    this.group.add(shadow, backing, this.sheen, this.hit, this.modelRoot, this.nameplate, this.pill);
  }

  setHover(hover: boolean): void {
    this.hover = hover;
  }

  setPressed(pressed: boolean): void {
    if (pressed) {
      this.press = 1;
    }
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
  }

  setColliderVisible(visible: boolean): void {
    const material = this.hit.material as MeshBasicMaterial;
    material.visible = visible;
    material.color.set('#22d3ee');
    material.transparent = true;
    material.opacity = 0.28;
    material.needsUpdate = true;
  }

  get hovered(): boolean {
    return this.hover;
  }

  /** Rebuilds canvas text after webfonts finish loading. */
  refreshText(): void {
    const name = this.nameplate.material as MeshBasicMaterial;
    const previousName = name.map;
    const nextName = this.nameMaterial();
    name.map = nextName.map;
    name.needsUpdate = true;
    previousName?.dispose();
    nextName.map = null;
    nextName.dispose();

    const pill = this.pill.material as MeshBasicMaterial;
    const nextPill = this.pillMaterial();
    pill.map = nextPill.map;
    pill.needsUpdate = true;
    nextPill.map = null;
    nextPill.dispose();
  }

  tick(dt: number): void {
    const step = 1 - Math.exp(-Math.max(dt, 0) / HOVER_SETTLE_SEC);
    this.press = Math.max(0, this.press - dt / PRESS_HOLD_SEC);
    const pressing = this.press > 0.05;
    this.cardScale = lerp(this.cardScale, pressing ? PRESS_SCALE : 1, step);
    this.modelScale = lerp(this.modelScale, this.hover && !pressing ? HOVER_MODEL_SCALE : 1, step);
    const pillTarget = this.animal.playable && (this.hover || this.selected) ? HOVER_PILL_SCALE : 1;
    this.pillScale = lerp(this.pillScale, pillTarget, step);
    const sheenTarget = pressing ? 0.48 : this.hover ? 0.3 : this.selected ? 0.16 : 0.08;
    this.sheenOpacity = lerp(this.sheenOpacity, sheenTarget, step);
    this.group.scale.setScalar(this.cardScale);
    this.modelRoot.scale.setScalar(this.modelScale);
    this.pill.scale.set(this.pillScale, this.pillScale, 1);
    (this.sheen.material as MeshBasicMaterial).opacity = this.sheenOpacity;
  }

  private nameMaterial(): MeshBasicMaterial {
    const long = this.animal.name.length > 12;
    return glassMaterial(
      createLabelTexture(this.animal.name, {
        width: 512,
        height: 128,
        fill: 'transparent',
        frame: false,
        ink: theme.colors.textPrimary,
        weight: 500,
        size: long ? 34 : this.animal.name.length > 8 ? 42 : 48,
      }),
    );
  }

  private pillMaterial(): MeshBasicMaterial {
    const label = this.animal.playable ? COPY.gallery.foldNow : COPY.gallery.comingSoon;
    return glassMaterial(pillTexture(label, this.animal.playable ? 'ink' : 'muted'));
  }
}
