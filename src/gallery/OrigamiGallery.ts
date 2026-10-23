import { PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import {
  BoxHelper,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { offsetInViewerSpace, type Vec3 } from '../origami/placement.ts';
import { FONT_SANS, theme } from '../theme/tokens.ts';
import { createLabelTexture } from '../ui/labelTexture.ts';
import { COPY } from '../ui/welcomeCopy.ts';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import {
  ANIMALS,
  GALLERY_COLUMNS,
  GALLERY_VISIBLE_ROWS,
  galleryRowCount,
  type AnimalId,
} from './animals.ts';
import { COMING_SOON_MESSAGE } from './ExperienceRouter.ts';
import { FloatingAnimationController } from './FloatingAnimationController.ts';
import { dragHandleTexture, gestureHintTexture, glassMaterial, invalidatePillTextures, panelGlassTexture, pillTexture, sharedShadowMaterial } from './galleryGlass.ts';
import { GalleryTransitionController } from './GalleryTransitionController.ts';
import { MENU_DRAG_CONFIG, MENU_DRAG_INSPECTOR, MenuMover, type MenuDragMode } from './menuDrag.ts';
import { CARD_HEIGHT, CARD_WIDTH, OrigamiCard } from './OrigamiCard.ts';
import { origamiModels } from './OrigamiModelRegistry.ts';

export const GALLERY_OFFSET_LOCAL: Vec3 = [0, -0.06, -1.15];

const COL_GAP = 0.016;
const ROW_GAP = 0.016;
const HEADER = 0.142;
const FOOTER = 0.11;
const PAGE_ROWS = GALLERY_VISIBLE_ROWS;
const TITLE_FONT = FONT_SANS;

const _position = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();
const _quat = new Quaternion();
const _local = new Vector3();
const _world = new Vector3();
const _rayInv = new Matrix4();
const _rayOrigin = new Vector3();
const _rayDir = new Vector3();
const _rayHit = new Vector3();

const HANDLE_WIDTH = 0.078;
const HANDLE_HEIGHT = 0.018;
const HANDLE_HIT_WIDTH = 0.16;
const HANDLE_HIT_HEIGHT = 0.046;
const DEPTH_HIT_M = 0.07;

export type GalleryControl =
  | 'page-next'
  | 'page-prev'
  | 'continue'
  | 'restart'
  | 'confirm-restart'
  | 'cancel'
  | 'recenter-menu';

export type GalleryPointerEvent =
  | { type: 'hover'; id: AnimalId; hovered: boolean }
  | { type: 'press'; id: AnimalId }
  | { type: 'control'; control: GalleryControl }
  | { type: 'drag-hover'; hovered: boolean };

export interface GalleryDebug {
  state: 'hidden' | 'open' | 'collapsing' | 'expanding' | 'overlay';
  hoveredCard: string | null;
  selectedCard: string | null;
  modelsLoaded: number;
  floatsActive: number;
  page: number;
  pageCount: number;
  open: boolean;
  dragEnabled: boolean;
  dragState: string;
  dragHand: string | null;
  position: Vec3;
  handleCollider: boolean;
  boundingBox: boolean;
  dragMode: MenuDragMode;
  rayDistance: number;
}

export interface MenuRayGuide {
  origin: Vector3;
  direction: Vector3;
  hit: Vector3 | null;
  distance: number;
  hot: boolean;
}

function vec3(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function controlMesh(label: string, width: number, control: GalleryControl, tone: 'ink' | 'quiet' = 'ink'): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(width, 0.034),
    glassMaterial(pillTexture(label, tone)),
  );
  mesh.renderOrder = 6;
  mesh.userData.foldFlyGalleryControl = control;
  return mesh;
}

export class OrigamiGallery {
  readonly group = new Group();
  readonly floats = new FloatingAnimationController();
  readonly transition = new GalleryTransitionController();
  readonly mover = new MenuMover();
  private readonly cards = new Map<AnimalId, OrigamiCard>();
  private readonly panel: Mesh;
  private readonly brand: Mesh;
  private readonly title: Mesh;
  private readonly subtitle: Mesh;
  private readonly toast: Mesh;
  private readonly gestureHint: Mesh;
  private readonly handle: Mesh;
  private readonly handleHit: Mesh;
  private readonly recenterBtn: Mesh;
  private readonly bounds: BoxHelper;
  private readonly promptButtons: Mesh[] = [];
  private readonly confirmButtons: Mesh[] = [];
  private readonly prevPage: Mesh;
  private readonly nextPage: Mesh;
  private readonly panelWidth: number;
  private readonly panelHeight: number;
  private readonly handleY: number;
  private page = 0;
  private hovered: AnimalId | null = null;
  private selected: AnimalId | null = null;
  private mode: GalleryDebug['state'] = 'hidden';
  private toastUntil = 0;
  private colliders = false;
  private handleHover = false;
  private readonly rayLines: Line[];
  private readonly rayDots: Mesh[];
  private rayGuides: { left: MenuRayGuide | null; right: MenuRayGuide | null } = { left: null, right: null };

  constructor() {
    this.group.name = 'fold-fly-origami-gallery';
    this.group.visible = false;

    const panelWidth = GALLERY_COLUMNS * CARD_WIDTH + (GALLERY_COLUMNS - 1) * COL_GAP + 0.1;
    const panelHeight = HEADER + PAGE_ROWS * CARD_HEIGHT + (PAGE_ROWS - 1) * ROW_GAP + FOOTER;
    this.panelWidth = panelWidth;
    this.panelHeight = panelHeight;
    this.handleY = panelHeight / 2 + 0.026;
    const panelShadow = new Mesh(
      new PlaneGeometry(panelWidth * 1.06, panelHeight * 1.08),
      sharedShadowMaterial(),
    );
    panelShadow.position.set(0, -0.012, -0.046);
    panelShadow.renderOrder = 0;

    this.panel = new Mesh(new PlaneGeometry(panelWidth, panelHeight), glassMaterial(panelGlassTexture()));
    this.panel.position.z = -0.03;
    this.panel.renderOrder = 1;
    this.panel.userData.foldFlyGalleryDrag = 'background';

    this.handle = new Mesh(new PlaneGeometry(HANDLE_WIDTH, HANDLE_HEIGHT), glassMaterial(dragHandleTexture()));
    this.handle.position.set(0, this.handleY, 0.034);
    this.handle.renderOrder = 8;
    this.handle.userData.foldFlyGalleryDrag = 'handle';

    this.handleHit = new Mesh(
      new PlaneGeometry(HANDLE_HIT_WIDTH, HANDLE_HIT_HEIGHT),
      new MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.handleHit.visible = false;
    this.handleHit.position.set(0, this.handleY, 0.036);
    this.handleHit.renderOrder = 9;
    this.handleHit.userData.foldFlyGalleryDrag = 'handle';

    this.recenterBtn = controlMesh(COPY.session.recenter, 0.11, 'recenter-menu', 'quiet');
    this.recenterBtn.position.set(0.16, this.handleY, 0.034);

    this.brand = new Mesh(new PlaneGeometry(0.42, 0.022), this.brandMaterial());
    this.brand.position.set(0, panelHeight / 2 - 0.028, 0.03);
    this.brand.renderOrder = 6;

    this.title = new Mesh(new PlaneGeometry(0.58, 0.048), this.titleMaterial());
    this.title.position.set(0, panelHeight / 2 - 0.068, 0.03);
    this.title.renderOrder = 6;

    this.subtitle = new Mesh(new PlaneGeometry(0.52, 0.022), this.subtitleMaterial());
    this.subtitle.position.set(0, panelHeight / 2 - 0.104, 0.028);
    this.subtitle.renderOrder = 6;

    ANIMALS.forEach((animal) => {
      const model = origamiModels.create(animal.id, animal.paperColor);
      const card = new OrigamiCard(animal, model);
      card.group.position.copy(this.cardPosition(animal.row, animal.column, panelHeight));
      card.group.position.z = 0.01;
      card.group.userData.foldFlyGalleryId = animal.id;
      this.floats.add(card.modelRoot, animal.id, card.modelRoot.position.y);
      this.cards.set(animal.id, card);
    });

    this.prevPage = controlMesh(COPY.gallery.back, 0.12, 'page-prev', 'quiet');
    this.nextPage = controlMesh(COPY.gallery.more, 0.2, 'page-next');
    this.prevPage.position.set(-0.16, -panelHeight / 2 + 0.042, 0.02);
    this.nextPage.position.set(0.16, -panelHeight / 2 + 0.042, 0.02);

    this.toast = new Mesh(new PlaneGeometry(0.46, 0.038), glassMaterial(pillTexture(COMING_SOON_MESSAGE, 'ink')));
    this.toast.position.set(0, -panelHeight / 2 + 0.078, 0.03);
    this.toast.renderOrder = 7;
    this.toast.visible = false;

    this.gestureHint = new Mesh(new PlaneGeometry(0.52, 0.024), this.hintMaterial());
    this.gestureHint.position.set(0, -panelHeight / 2 + 0.086, 0.028);
    this.gestureHint.renderOrder = 6;
    this.gestureHint.raycast = () => {};

    const continueBtn = controlMesh(COPY.gallery.continue, 0.16, 'continue');
    const restartBtn = controlMesh(COPY.session.restart, 0.16, 'restart', 'quiet');
    continueBtn.position.set(-0.1, -panelHeight / 2 + 0.078, 0.03);
    restartBtn.position.set(0.1, -panelHeight / 2 + 0.078, 0.03);
    continueBtn.visible = false;
    restartBtn.visible = false;
    this.promptButtons.push(continueBtn, restartBtn);

    const confirmBtn = controlMesh(COPY.session.confirmRestart, 0.22, 'confirm-restart');
    const cancelBtn = controlMesh(COPY.session.cancel, 0.12, 'cancel', 'quiet');
    confirmBtn.position.set(-0.1, -panelHeight / 2 + 0.078, 0.03);
    cancelBtn.position.set(0.13, -panelHeight / 2 + 0.078, 0.03);
    confirmBtn.visible = false;
    cancelBtn.visible = false;
    this.confirmButtons.push(confirmBtn, cancelBtn);

    this.bounds = new BoxHelper(this.panel, '#22d3ee');
    this.bounds.visible = false;
    this.rayLines = [makeRayLine(), makeRayLine()];
    this.rayDots = [makeRayDot(), makeRayDot()];
    this.group.add(
      panelShadow,
      this.panel,
      this.handle,
      this.handleHit,
      this.recenterBtn,
      this.brand,
      this.title,
      this.subtitle,
      this.gestureHint,
      this.toast,
      this.bounds,
      ...this.rayLines,
      ...this.rayDots,
    );
    this.cards.forEach((card) => this.group.add(card.group));
    this.group.add(this.prevPage, this.nextPage, ...this.promptButtons, ...this.confirmButtons);
    this.applyPage();
    void document.fonts?.ready.then(() => this.refreshText());
  }

  private refreshText(): void {
    invalidatePillTextures();
    this.replaceMap(this.brand, this.brandMaterial());
    this.replaceMap(this.title, this.titleMaterial());
    this.replaceMap(this.subtitle, this.subtitleMaterial());
    this.replaceMap(this.gestureHint, this.hintMaterial());
    this.replaceMap(this.toast, glassMaterial(pillTexture(COMING_SOON_MESSAGE, 'ink')));
    this.replaceMap(this.prevPage, glassMaterial(pillTexture(COPY.gallery.back, 'quiet')));
    this.replaceMap(this.nextPage, glassMaterial(pillTexture(COPY.gallery.more, 'ink')));
    this.replaceMap(this.recenterBtn, glassMaterial(pillTexture(COPY.session.recenter, 'quiet')));
    this.replaceMap(this.handle, glassMaterial(dragHandleTexture(this.handleHover)));
    for (const button of this.promptButtons) {
      const label = button === this.promptButtons[0] ? COPY.gallery.continue : COPY.session.restart;
      this.replaceMap(button, glassMaterial(pillTexture(label, 'ink')));
    }
    for (const button of this.confirmButtons) {
      const label = button === this.confirmButtons[0] ? COPY.session.confirmRestart : COPY.session.cancel;
      this.replaceMap(button, glassMaterial(pillTexture(label, label === COPY.session.cancel ? 'quiet' : 'ink')));
    }
    this.cards.forEach((card) => card.refreshText());
  }

  /**
   * The card group is the only interactable. The Fold Now / Coming Soon pill is a child of
   * that group, so a pinch on the button and a pinch on the glass emit one event.
   */
  mount(world: World): void {
    const root = world.createTransformEntity(this.group, { persistent: true });
    const objects: Array<Mesh | Group> = [
      ...[...this.cards.values()].map((card) => card.group),
      this.prevPage,
      this.nextPage,
      this.recenterBtn,
      this.handle,
      this.panel,
      ...this.promptButtons,
      ...this.confirmButtons,
    ];
    for (const object of objects) {
      const entity = world.createTransformEntity(object, { parent: root, persistent: true });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
    }
  }

  placeFromCamera(
    camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldQuaternion: (q: Quaternion) => Quaternion },
    mode: 'default' | 'restore' | 'reset' = 'restore',
  ): void {
    if (mode === 'restore') {
      this.placeOrRestore(camera);
      return;
    }
    this.applyComfortablePose(camera);
    if (mode === 'reset') {
      this.mover.clearSaved();
    }
    this.mover.remember(this.group, _position);
    debugEvents.emit('galleryRecentered', { position: vec3(this.group.position), mode });
  }

  placeOrRestore(
    camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldQuaternion: (q: Quaternion) => Quaternion },
  ): void {
    camera.getWorldPosition(_position);
    camera.getWorldQuaternion(_quat);
    _forward.set(0, 0, -1).applyQuaternion(_quat);
    this.mover.restore(this.group, _position, _forward, () => this.applyComfortablePose(camera));
  }

  recenterToCamera(
    camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldQuaternion: (q: Quaternion) => Quaternion },
  ): void {
    this.comfortableTarget(camera);
    this.mover.startRecenter(this.group, _world, _quat);
    debugEvents.emit('galleryRecentered', { position: vec3(_world), animated: true });
  }

  show(kind: 'open' | 'overlay' = 'open'): void {
    this.mode = kind;
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.floats.resume();
    this.applyPage();
    debugEvents.emit('galleryOpened', { kind });
  }

  hide(): void {
    this.mover.remember(this.group);
    this.mode = 'hidden';
    this.group.visible = false;
    this.floats.pause();
    this.hidePrompts();
    debugEvents.emit('galleryClosed', {});
  }

  cancelTransition(): void {
    this.transition.cancel();
    this.mode = 'hidden';
    this.group.visible = false;
    this.floats.pause();
    this.hidePrompts();
  }

  collapse(onDone?: () => void): void {
    this.mode = 'collapsing';
    this.floats.pause();
    this.mover.remember(this.group);
    this.transition.collapse(this.group, () => {
      this.mode = 'hidden';
      this.hidePrompts();
      onDone?.();
    });
  }

  expand(kind: 'open' | 'overlay' = 'open', onDone?: () => void): void {
    this.mode = 'expanding';
    this.transition.expand(this.group, () => {
      this.show(kind);
      onDone?.();
    });
  }

  tick(dtSec: number): void {
    this.transition.tick(dtSec);
    if (!this.mover.active) {
      this.mover.update(this.group, null, 'ok', dtSec);
    }
    if (this.group.visible && (this.mode === 'open' || this.mode === 'overlay' || this.mode === 'expanding')) {
      this.floats.tick();
    }
    if (this.group.visible) {
      this.cards.forEach((card) => card.tick(dtSec));
    }
    if (this.toast.visible && this.now() > this.toastUntil) {
      this.toast.visible = false;
    }
    this.syncGestureHint();
    this.handleHit.visible = MENU_DRAG_INSPECTOR.handleCollider && this.group.visible;
    this.bounds.visible = MENU_DRAG_INSPECTOR.boundingBox && this.group.visible;
    if (this.bounds.visible) {
      this.bounds.update();
    }
    this.syncRayGuides();
    this.setDragEmphasis(this.mover.active);
  }

  handlePointer(event: GalleryPointerEvent): void {
    if (event.type === 'drag-hover') {
      this.setHandleHover(event.hovered);
      return;
    }
    if (event.type === 'hover') {
      this.hovered = event.hovered ? event.id : this.hovered === event.id ? null : this.hovered;
      const card = this.cards.get(event.id);
      card?.setHover(event.hovered);
      if (card) {
        this.floats.setHover(card.modelRoot, event.hovered);
      }
      return;
    }
    if (event.type === 'press') {
      if (this.blocksCardSelection) {
        return;
      }
      this.select(event.id);
    }
  }

  showComingSoon(): void {
    this.hidePrompts();
    this.toast.visible = true;
    this.toastUntil = this.now() + 1800;
    this.syncGestureHint();
  }

  showResumePrompt(): void {
    this.toast.visible = false;
    this.setVisibleAll(this.confirmButtons, false);
    this.setVisibleAll(this.promptButtons, true);
    this.syncGestureHint();
  }

  showRestartConfirm(): void {
    this.setVisibleAll(this.promptButtons, false);
    this.setVisibleAll(this.confirmButtons, true);
    this.syncGestureHint();
  }

  hidePrompts(): void {
    this.setVisibleAll(this.promptButtons, false);
    this.setVisibleAll(this.confirmButtons, false);
    this.toast.visible = false;
    this.syncGestureHint();
  }

  setPage(page: number): void {
    const max = this.pageCount - 1;
    this.page = Math.max(0, Math.min(max, page));
    this.applyPage();
  }

  get pageIndex(): number {
    return this.page;
  }

  get pageCount(): number {
    return Math.ceil(galleryRowCount() / PAGE_ROWS);
  }

  setCollidersVisible(visible: boolean): void {
    this.colliders = visible;
    this.cards.forEach((card) => card.setColliderVisible(visible));
  }

  get collidersVisible(): boolean {
    return this.colliders;
  }

  get debug(): GalleryDebug {
    return {
      state: this.mode,
      hoveredCard: this.hovered,
      selectedCard: this.selected,
      modelsLoaded: origamiModels.loadedCount,
      floatsActive: this.floats.activeCount,
      page: this.page + 1,
      pageCount: this.pageCount,
      open: this.group.visible,
      dragEnabled: MENU_DRAG_CONFIG.enabled,
      dragState: this.mover.dragState,
      dragHand: this.mover.activeHand,
      position: vec3(this.group.position),
      handleCollider: MENU_DRAG_INSPECTOR.handleCollider,
      boundingBox: MENU_DRAG_INSPECTOR.boundingBox,
      dragMode: this.mover.dragMode,
      rayDistance: this.mover.rayDistance,
    };
  }

  get blocksCardSelection(): boolean {
    return this.mover.blocksSelection;
  }

  get isDragging(): boolean {
    return this.mover.active;
  }

  setHandleHover(hover: boolean): void {
    if (this.handleHover === hover && !this.mover.active) {
      this.mover.setHover(hover);
      return;
    }
    this.handleHover = hover;
    this.mover.setHover(hover);
    this.replaceMap(this.handle, glassMaterial(dragHandleTexture(hover || this.mover.active)));
  }

  containsGallery(worldPoint: Vector3): boolean {
    if (!this.group.visible) {
      return false;
    }
    const local = this.toLocal(worldPoint);
    return this.inHandle(local) || this.inPanel(local) || this.inInteractive(local);
  }

  containsDragTarget(worldPoint: Vector3): boolean {
    if (!this.group.visible || !MENU_DRAG_CONFIG.enabled) {
      return false;
    }
    const local = this.toLocal(worldPoint);
    if (this.inInteractive(local)) {
      return false;
    }
    return this.inHandle(local) || this.inPanel(local);
  }

  containsHandle(worldPoint: Vector3): boolean {
    return this.group.visible && this.inHandle(this.toLocal(worldPoint));
  }

  /**
   * Intersect a world ray with the drag-handle plane.
   * Returns the world distance to the hit, or null when the ray misses the handle.
   */
  raycastHandle(origin: Vector3, direction: Vector3, hitOut: Vector3): number | null {
    if (!this.group.visible || !MENU_DRAG_CONFIG.enabled) {
      return null;
    }
    this.group.updateWorldMatrix(true, false);
    _rayInv.copy(this.group.matrixWorld).invert();
    _rayOrigin.copy(origin).applyMatrix4(_rayInv);
    _rayDir.copy(direction).transformDirection(_rayInv);
    if (Math.abs(_rayDir.z) < 1e-5) {
      return null;
    }
    const planeZ = this.handle.position.z;
    const travel = (planeZ - _rayOrigin.z) / _rayDir.z;
    if (!(travel > 0.02)) {
      return null;
    }
    _rayHit.copy(_rayOrigin).addScaledVector(_rayDir, travel);
    if (!this.inHandle(_rayHit)) {
      return null;
    }
    hitOut.copy(_rayHit).applyMatrix4(this.group.matrixWorld);
    const distance = origin.distanceTo(hitOut);
    return distance > 0.02 ? distance : null;
  }

  setRayGuides(guides: { left: MenuRayGuide | null; right: MenuRayGuide | null }): void {
    this.rayGuides = guides;
    this.syncRayGuides();
  }

  setDragEmphasis(active: boolean): void {
    const material = this.panel.material as MeshBasicMaterial;
    material.color.set(active ? '#fff1e4' : '#ffffff');
    this.handle.scale.setScalar(active ? 1.06 : this.handleHover ? 1.03 : 1);
  }

  get selectedId(): AnimalId | null {
    return this.selected;
  }

  get hoveredId(): AnimalId | null {
    return this.hovered;
  }

  private applyComfortablePose(
    camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldQuaternion: (q: Quaternion) => Quaternion },
  ): void {
    this.comfortableTarget(camera);
    this.group.position.copy(_world);
    this.group.quaternion.copy(_quat);
  }

  private comfortableTarget(
    camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldQuaternion: (q: Quaternion) => Quaternion },
  ): void {
    camera.getWorldPosition(_position);
    camera.getWorldQuaternion(_quat);
    _forward.set(0, 0, -1).applyQuaternion(_quat);
    _up.set(0, 1, 0).applyQuaternion(_quat);
    const target = offsetInViewerSpace(vec3(_position), vec3(_forward), vec3(_up), GALLERY_OFFSET_LOCAL);
    _world.set(...target);
  }

  private toLocal(worldPoint: Vector3): Vector3 {
    this.group.updateWorldMatrix(true, false);
    return this.group.worldToLocal(_local.copy(worldPoint));
  }

  private inHandle(local: Vector3): boolean {
    return (
      Math.abs(local.x) <= HANDLE_HIT_WIDTH / 2 &&
      Math.abs(local.y - this.handleY) <= HANDLE_HIT_HEIGHT / 2 &&
      Math.abs(local.z) <= DEPTH_HIT_M
    );
  }

  private inPanel(local: Vector3): boolean {
    return (
      Math.abs(local.x) <= this.panelWidth / 2 &&
      Math.abs(local.y) <= this.panelHeight / 2 &&
      Math.abs(local.z) <= DEPTH_HIT_M
    );
  }

  private inInteractive(local: Vector3): boolean {
    if (this.hitsMesh(local, this.recenterBtn) || this.hitsMesh(local, this.prevPage) || this.hitsMesh(local, this.nextPage)) {
      return true;
    }
    for (const button of [...this.promptButtons, ...this.confirmButtons]) {
      if (this.hitsMesh(local, button)) {
        return true;
      }
    }
    for (const card of this.cards.values()) {
      if (!card.group.visible) {
        continue;
      }
      const x = local.x - card.group.position.x;
      const y = local.y - card.group.position.y;
      if (Math.abs(x) <= CARD_WIDTH / 2 && Math.abs(y) <= CARD_HEIGHT / 2 && Math.abs(local.z) <= DEPTH_HIT_M) {
        return true;
      }
    }
    return false;
  }

  private hitsMesh(local: Vector3, mesh: Mesh): boolean {
    if (!mesh.visible) {
      return false;
    }
    const geometry = mesh.geometry as PlaneGeometry;
    const width = geometry.parameters.width ?? 0.1;
    const height = geometry.parameters.height ?? 0.03;
    return (
      Math.abs(local.x - mesh.position.x) <= width / 2 + 0.006 &&
      Math.abs(local.y - mesh.position.y) <= height / 2 + 0.006 &&
      Math.abs(local.z) <= DEPTH_HIT_M
    );
  }

  private select(id: AnimalId): void {
    this.selected = id;
    this.cards.forEach((card, key) => {
      const chosen = key === id;
      card.setSelected(chosen);
      if (chosen) {
        card.setPressed(true);
      }
    });
    debugEvents.emit('gallerySelected', { id });
  }

  private brandMaterial(): MeshBasicMaterial {
    return glassMaterial(
      createLabelTexture(COPY.product.name.toUpperCase(), {
        width: 1024,
        height: 96,
        fill: 'transparent',
        frame: false,
        ink: theme.colors.accent,
        weight: 600,
        size: 28,
        tracking: 6,
      }),
    );
  }

  private titleMaterial(): MeshBasicMaterial {
    return glassMaterial(
      createLabelTexture(COPY.gallery.heading, {
        width: 1024,
        height: 180,
        fill: 'transparent',
        frame: false,
        ink: theme.colors.textPrimary,
        weight: 500,
        size: 64,
        font: TITLE_FONT,
      }),
    );
  }

  private subtitleMaterial(): MeshBasicMaterial {
    return glassMaterial(
      createLabelTexture(COPY.product.tagline.toUpperCase(), {
        width: 1024,
        height: 96,
        fill: 'transparent',
        frame: false,
        ink: theme.colors.textSecondary,
        weight: 500,
        size: 24,
        tracking: 3,
      }),
    );
  }

  private hintMaterial(): MeshBasicMaterial {
    return glassMaterial(gestureHintTexture(COPY.gallery.gestureHint));
  }

  private syncGestureHint(): void {
    const overlay =
      this.toast.visible ||
      this.promptButtons.some((button) => button.visible) ||
      this.confirmButtons.some((button) => button.visible);
    this.gestureHint.visible = this.group.visible && !overlay;
  }

  private replaceMap(mesh: Mesh, next: MeshBasicMaterial): void {
    const current = mesh.material as MeshBasicMaterial;
    const previous = current.map;
    current.map = next.map;
    current.needsUpdate = true;
    if (previous && previous !== current.map) {
      previous.dispose();
    }
    next.map = null;
    next.dispose();
  }

  private cardPosition(row: number, column: number, panelHeight: number): Vector3 {
    const gridWidth = GALLERY_COLUMNS * CARD_WIDTH + (GALLERY_COLUMNS - 1) * COL_GAP;
    const x = -gridWidth / 2 + CARD_WIDTH / 2 + column * (CARD_WIDTH + COL_GAP);
    const localRow = row % PAGE_ROWS;
    const top = panelHeight / 2 - HEADER - CARD_HEIGHT / 2;
    const y = top - localRow * (CARD_HEIGHT + ROW_GAP);
    return new Vector3(x, y, 0);
  }

  private applyPage(): void {
    const start = this.page * PAGE_ROWS;
    const end = start + PAGE_ROWS;
    this.cards.forEach((card) => {
      const visible = card.animal.row >= start && card.animal.row < end;
      card.group.visible = visible;
      card.hit.visible = visible;
    });
    this.prevPage.visible = this.page > 0;
    this.nextPage.visible = this.page < this.pageCount - 1;
  }

  private setVisibleAll(meshes: Mesh[], visible: boolean): void {
    for (const mesh of meshes) {
      mesh.visible = visible;
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private syncRayGuides(): void {
    const guides = [this.rayGuides.left, this.rayGuides.right];
    guides.forEach((guide, index) => {
      const line = this.rayLines[index];
      const dot = this.rayDots[index];
      if (!line || !dot) {
        return;
      }
      const showLine = Boolean(guide && MENU_DRAG_INSPECTOR.handRay && this.group.visible);
      const showDot = Boolean(
        guide?.hit &&
          this.group.visible &&
          (guide.hot || MENU_DRAG_INSPECTOR.rayHit),
      );
      line.visible = showLine;
      dot.visible = showDot;
      if (guide && showLine) {
        placeRayLine(this.group, line, guide.origin, guide.direction, guide.hit ? guide.distance : 0.45);
      }
      if (guide?.hit && showDot) {
        this.group.worldToLocal(dot.position.copy(guide.hit));
      }
    });
  }
}

function makeRayLine(): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const line = new Line(
    geometry,
    new LineBasicMaterial({ color: '#ff922e', transparent: true, opacity: 0.9, depthTest: false }),
  );
  line.visible = false;
  line.frustumCulled = false;
  line.renderOrder = 12;
  line.raycast = () => {};
  return line;
}

function makeRayDot(): Mesh {
  const dot = new Mesh(
    new SphereGeometry(0.008, 12, 8),
    new MeshBasicMaterial({ color: '#ff922e', depthTest: false }),
  );
  dot.visible = false;
  dot.renderOrder = 13;
  dot.raycast = () => {};
  return dot;
}

function placeRayLine(group: Group, line: Line, origin: Vector3, direction: Vector3, length: number): void {
  const positions = line.geometry.getAttribute('position') as BufferAttribute;
  group.worldToLocal(_rayOrigin.copy(origin));
  group.worldToLocal(_rayHit.copy(origin).addScaledVector(direction, Math.max(length, 0.05)));
  positions.setXYZ(0, _rayOrigin.x, _rayOrigin.y, _rayOrigin.z);
  positions.setXYZ(1, _rayHit.x, _rayHit.y, _rayHit.z);
  positions.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}
