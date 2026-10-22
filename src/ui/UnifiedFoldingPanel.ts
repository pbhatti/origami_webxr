import { PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { pillTexture } from '../gallery/galleryGlass.ts';
import { TRACKER_OFFSET_LOCAL } from '../origami/placement.ts';
import { FONT_SANS, getUiOpacity, theme, themeMaterial } from '../theme/tokens.ts';
import { COPY } from './welcomeCopy.ts';

/** Canvas width. World width maps 1:1 so padding in pixels converts to meters. */
export const PANEL_CANVAS_W = 768;
export const PANEL_WORLD_W = 0.24;
/** 18px on a ~300px-wide card, scaled onto the canvas. */
export const PANEL_PAD_PX = 46;
const METERS_PER_PX = PANEL_WORLD_W / PANEL_CANVAS_W;
const PAPER_RIGHT_M = 0.141;
const PAPER_GAP_M = 0.02;
const TRANSITION_MS = 260;
const CONNECTOR_FILL_SEC = 0.16;

export const STEPPER_INSPECTOR = {
  connectorBounds: false,
  connectorState: false,
};

export type FoldingPanelMode = 'folding' | 'step-transition' | 'completed' | 'error';

export interface FoldingPanelInput {
  recipeId: string;
  stepId: string;
  title: string;
  body: string;
  committed: number;
  activeIndex: number | null;
  total: number;
  completed: boolean;
  error: string | null;
}

export interface FoldingPanelLayout {
  canvasWidth: number;
  canvasHeight: number;
  worldWidth: number;
  worldHeight: number;
  padPx: number;
  padM: number;
  contentLeft: number;
  contentRight: number;
  contentTop: number;
  contentBottom: number;
  headerBaseline: number;
  count: string;
  steps: Array<{ x: number; y: number; radius: number; state: 'done' | 'active' | 'upcoming'; label: string }>;
  connectors: Array<{ x0: number; x1: number; y: number; done: boolean }>;
  dividerY: number | null;
  title: string;
  titleBaseline: number | null;
  bodyLines: Array<{ text: string; y: number }>;
  errorLines: Array<{ text: string; y: number }>;
  buttons: Array<{ label: string; tone: 'ink' | 'quiet'; x: number; y: number; w: number; h: number }>;
}

export interface FoldingPanelDebug {
  recipeId: string;
  stepId: string;
  total: number;
  current: string;
  mode: FoldingPanelMode;
  widthM: number;
  heightM: number;
  content: string;
  pad: string;
  padBalanced: boolean;
}

export function measureTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  size: number,
): number {
  ctx.font = font;
  try {
    const measured = ctx.measureText(text)?.width;
    if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) {
      return measured;
    }
  } catch {
    /* jsdom proxies often have no real text metrics */
  }
  return Math.max(1, text.length) * size * 0.52;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measureTextWidth(ctx, next, font, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export function layoutFoldingPanel(input: FoldingPanelInput, ctx: CanvasRenderingContext2D): FoldingPanelLayout {
  const pad = PANEL_PAD_PX;
  const inner = PANEL_CANVAS_W - pad * 2;
  const headerSize = 32;
  const titleSize = 34;
  const bodySize = 24;
  const bodyFont = `400 ${bodySize}px ${FONT_SANS}`;
  const errorFont = `500 ${bodySize}px ${FONT_SANS}`;
  const radius = 20;
  let y = pad;
  const headerBaseline = y + headerSize;
  y = headerBaseline + 22;

  const count = countLabel(input);
  const steps = stepMarks(input, pad, inner, y + radius, radius);
  const connectors = stepConnectors(steps);
  y += radius * 2;

  const showCopy = Boolean(input.title || input.body || input.error || input.completed);
  const dividerY: number | null = null;
  let title = '';
  let titleBaseline: number | null = null;
  const bodyLines: Array<{ text: string; y: number }> = [];
  const errorLines: Array<{ text: string; y: number }> = [];
  const buttons: FoldingPanelLayout['buttons'] = [];

  if (showCopy) {
    y += 28;
    if (input.title) {
      title = input.title;
      titleBaseline = y + titleSize;
      y = titleBaseline + 14;
    }
    for (const line of wrapText(ctx, input.body, bodyFont, bodySize, inner)) {
      const baseline = y + bodySize;
      bodyLines.push({ text: line, y: baseline });
      y = baseline + 8;
    }
    if (input.error) {
      y += 6;
      for (const line of wrapText(ctx, input.error, errorFont, bodySize, inner)) {
        const baseline = y + bodySize;
        errorLines.push({ text: line, y: baseline });
        y = baseline + 8;
      }
    }
    if (input.completed && !input.error) {
      y += 16;
      const buttonH = 108;
      const gap = 16;
      const buttonW = (inner - gap) / 2;
      const buttonY = y + buttonH / 2;
      buttons.push(
        { label: COPY.completion.again, tone: 'ink', x: pad + buttonW / 2, y: buttonY, w: buttonW, h: buttonH },
        { label: COPY.completion.explore, tone: 'quiet', x: pad + buttonW + gap + buttonW / 2, y: buttonY, w: buttonW, h: buttonH },
      );
      y += buttonH;
    }
  }

  const canvasHeight = Math.ceil(y + pad);
  return {
    canvasWidth: PANEL_CANVAS_W,
    canvasHeight,
    worldWidth: PANEL_WORLD_W,
    worldHeight: canvasHeight * METERS_PER_PX,
    padPx: pad,
    padM: pad * METERS_PER_PX,
    contentLeft: pad,
    contentRight: PANEL_CANVAS_W - pad,
    contentTop: pad,
    contentBottom: canvasHeight - pad,
    headerBaseline,
    count,
    steps,
    connectors,
    dividerY,
    title,
    titleBaseline,
    bodyLines,
    errorLines,
    buttons,
  };
}

function countLabel(input: FoldingPanelInput): string {
  if (input.total <= 0) {
    return '0 of 0';
  }
  const current = input.completed || input.activeIndex == null ? input.total : input.activeIndex + 1;
  return `${current} of ${input.total}`;
}

function stepMarks(
  input: FoldingPanelInput,
  pad: number,
  inner: number,
  y: number,
  radius: number,
): FoldingPanelLayout['steps'] {
  const total = Math.max(0, input.total);
  if (total === 0) {
    return [];
  }
  const left = pad + radius;
  const right = pad + inner - radius;
  return Array.from({ length: total }, (_, index) => {
    const x = total === 1 ? pad + inner / 2 : left + ((right - left) * index) / (total - 1);
    const done = input.completed || index < input.committed;
    const active = !done && index === input.activeIndex;
    return {
      x,
      y,
      radius,
      state: done ? 'done' : active ? 'active' : 'upcoming',
      label: String(index + 1),
    };
  });
}

function stepConnectors(steps: FoldingPanelLayout['steps']): FoldingPanelLayout['connectors'] {
  const connectors: FoldingPanelLayout['connectors'] = [];
  for (let index = 0; index < steps.length - 1; index += 1) {
    const current = steps[index];
    const next = steps[index + 1];
    if (!current || !next) {
      continue;
    }
    connectors.push({
      x0: current.x + current.radius,
      x1: next.x - next.radius,
      y: current.y,
      done: current.state === 'done',
    });
  }
  return connectors;
}

/** Left-to-right fill. Snaps only when the remainder is already invisible. */
export function stepConnectorFill(shown: number, target: number, dt: number): number {
  if (Math.abs(shown - target) < 0.01) {
    return target;
  }
  const next = shown + (target - shown) * (1 - Math.exp(-Math.max(dt, 0) / CONNECTOR_FILL_SEC));
  if (Math.abs(next - target) < 0.01) {
    return target;
  }
  return next;
}

export class UnifiedFoldingPanel {
  readonly group = new Group();
  readonly again: Mesh;
  readonly explore: Mesh;
  private readonly mesh: Mesh;
  private texture: CanvasTexture;
  private layout: FoldingPanelLayout;
  private input: FoldingPanelInput;
  private fade = 1;
  private transitionUntil = 0;
  private signature = '';
  private connectorShown: number[] = [];
  private inspectorKey = '';

  constructor() {
    this.group.name = 'unified-folding-panel';
    this.group.position.set(
      PAPER_RIGHT_M + PAPER_GAP_M + PANEL_WORLD_W / 2,
      TRACKER_OFFSET_LOCAL[1],
      TRACKER_OFFSET_LOCAL[2],
    );
    this.input = emptyInput();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas is unavailable');
    }
    this.layout = layoutFoldingPanel(this.input, ctx);
    this.fitConnectorFills();
    this.texture = paint(this.layout, this.connectorShown);
    this.mesh = new Mesh(new PlaneGeometry(this.layout.worldWidth, this.layout.worldHeight), themeMaterial(this.texture));
    this.mesh.name = 'fold-fly-progress';
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 4;
    this.again = this.button(COPY.completion.again, 'restart', 'ink');
    this.explore = this.button(COPY.completion.explore, 'menu', 'quiet');
    this.group.add(this.mesh, this.again, this.explore);
    this.placeButtons();
    void document.fonts?.ready.then(() => this.redraw());
  }

  mount(world: World, parent: ReturnType<World['createTransformEntity']>): void {
    for (const mesh of [this.again, this.explore]) {
      const entity = world.createTransformEntity(mesh, { parent, persistent: true });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.group.add(mesh);
    }
  }

  setContent(input: FoldingPanelInput): void {
    const next = signatureOf(input);
    const changed = next !== this.signature;
    this.input = input;
    this.signature = next;
    if (!changed) {
      this.applyButtonVisibility();
      return;
    }
    this.fade = 0.62;
    this.transitionUntil = performance.now() + TRANSITION_MS;
    this.redraw();
  }

  tick(dt: number): void {
    const step = 1 - Math.exp(-Math.max(dt, 0) / (TRANSITION_MS / 1000));
    this.fade += (1 - this.fade) * step;
    const opacity = getUiOpacity() * this.fade;
    (this.mesh.material as MeshBasicMaterial).opacity = opacity;
    (this.again.material as MeshBasicMaterial).opacity = opacity;
    (this.explore.material as MeshBasicMaterial).opacity = opacity;
    if (this.advanceConnectors(dt)) {
      this.redraw();
    }
  }

  face(cameraPosition: { x: number; y: number; z: number }): void {
    this.group.lookAt(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  }

  debug(): FoldingPanelDebug {
    const layout = this.layout;
    const top = layout.contentTop;
    const bottom = layout.canvasHeight - layout.contentBottom;
    return {
      recipeId: this.input.recipeId,
      stepId: this.input.stepId,
      total: this.input.total,
      current: layout.count,
      mode: this.mode(),
      widthM: layout.worldWidth,
      heightM: layout.worldHeight,
      content: `${layout.contentLeft},${layout.contentTop} ${layout.contentRight},${layout.contentBottom}`,
      pad: `T${(top * METERS_PER_PX).toFixed(4)} R${layout.padM.toFixed(4)} B${(bottom * METERS_PER_PX).toFixed(4)} L${layout.padM.toFixed(4)}`,
      padBalanced: Math.abs(top - bottom) <= 1 && Math.abs(layout.contentLeft - (layout.canvasWidth - layout.contentRight)) <= 1,
    };
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
  }

  private mode(): FoldingPanelMode {
    if (this.input.error) {
      return 'error';
    }
    if (this.input.completed) {
      return 'completed';
    }
    if (performance.now() < this.transitionUntil) {
      return 'step-transition';
    }
    return 'folding';
  }

  private advanceConnectors(dt: number): boolean {
    const targets = this.layout.connectors.map((connector) => (connector.done ? 1 : 0));
    let dirty = false;
    if (this.connectorShown.length !== targets.length) {
      this.connectorShown = targets.slice();
      dirty = true;
    } else {
      for (let index = 0; index < targets.length; index += 1) {
        const next = stepConnectorFill(this.connectorShown[index] ?? 0, targets[index] ?? 0, dt);
        if (next !== this.connectorShown[index]) {
          this.connectorShown[index] = next;
          dirty = true;
        }
      }
    }
    const key = `${STEPPER_INSPECTOR.connectorBounds ? 1 : 0}${STEPPER_INSPECTOR.connectorState ? 1 : 0}`;
    if (key !== this.inspectorKey) {
      this.inspectorKey = key;
      dirty = true;
    }
    return dirty;
  }

  private fitConnectorFills(): void {
    const targets = this.layout.connectors.map((connector) => (connector.done ? 1 : 0));
    if (this.connectorShown.length !== targets.length) {
      this.connectorShown = targets.slice();
    }
  }

  private redraw(): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.layout = layoutFoldingPanel(this.input, ctx);
    this.fitConnectorFills();
    const next = paint(this.layout, this.connectorShown);
    const material = this.mesh.material as MeshBasicMaterial;
    const previous = material.map;
    material.map = next;
    material.needsUpdate = true;
    this.texture = next;
    if (previous && previous !== next) {
      previous.dispose();
    }
    this.mesh.geometry.dispose();
    this.mesh.geometry = new PlaneGeometry(this.layout.worldWidth, this.layout.worldHeight);
    this.placeButtons();
  }

  private placeButtons(): void {
    const layout = this.layout;
    for (const mesh of [this.again, this.explore]) {
      const match = layout.buttons[mesh === this.again ? 0 : 1];
      if (!match) {
        mesh.visible = false;
        continue;
      }
      mesh.position.set(
        (match.x - layout.canvasWidth / 2) * METERS_PER_PX,
        (layout.canvasHeight / 2 - match.y) * METERS_PER_PX,
        0.004,
      );
      mesh.geometry.dispose();
      mesh.geometry = new PlaneGeometry(match.w * METERS_PER_PX, Math.max(match.h * METERS_PER_PX, 0.034));
    }
    this.applyButtonVisibility();
  }

  private applyButtonVisibility(): void {
    const show = this.input.completed && !this.input.error && this.layout.buttons.length === 2;
    this.again.visible = show;
    this.explore.visible = show;
  }

  private button(label: string, action: 'restart' | 'menu', tone: 'ink' | 'quiet'): Mesh {
    const mesh = new Mesh(new PlaneGeometry(0.1, 0.034), themeMaterial(pillTexture(label, tone)));
    mesh.name = `fold-panel-${label}`;
    mesh.userData.foldFlyAction = action;
    mesh.visible = false;
    mesh.renderOrder = 6;
    return mesh;
  }
}

function emptyInput(): FoldingPanelInput {
  return {
    recipeId: 'none',
    stepId: '',
    title: '',
    body: '',
    committed: 0,
    activeIndex: null,
    total: 0,
    completed: false,
    error: null,
  };
}

function signatureOf(input: FoldingPanelInput): string {
  return [
    input.recipeId,
    input.stepId,
    input.title,
    input.body,
    input.committed,
    input.activeIndex ?? 'x',
    input.total,
    input.completed ? '1' : '0',
    input.error ?? '',
  ].join('|');
}

function paint(layout: FoldingPanelLayout, fills: number[]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  drawPanel(ctx, layout, fills);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function drawPanel(ctx: CanvasRenderingContext2D, layout: FoldingPanelLayout, fills: number[]): void {
  const { canvasWidth: width, canvasHeight: height } = layout;
  const radius = 56;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(width, 0, width, height, radius);
  ctx.arcTo(width, height, 0, height, radius);
  ctx.arcTo(0, height, 0, 0, radius);
  ctx.arcTo(0, 0, width, 0, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 252, 248, 0.94)';
  ctx.fill();
  const glow = ctx.createLinearGradient(width * 0.45, 0, width, height * 0.35);
  glow.addColorStop(0, 'rgba(255, 211, 173, 0.4)');
  glow.addColorStop(1, 'rgba(255, 211, 173, 0)');
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.font = `500 32px ${FONT_SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(COPY.session.progress, layout.contentLeft, layout.headerBaseline);
  ctx.fillStyle = theme.colors.textSecondary;
  ctx.font = `500 26px ${FONT_SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText(layout.count, layout.contentRight, layout.headerBaseline);

  layout.connectors.forEach((connector, index) => {
    const fill = Math.min(1, Math.max(0, fills[index] ?? (connector.done ? 1 : 0)));
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.colors.surfaceWarm;
    ctx.beginPath();
    ctx.moveTo(connector.x0, connector.y);
    ctx.lineTo(connector.x1, connector.y);
    ctx.stroke();
    if (fill > 0) {
      ctx.strokeStyle = theme.colors.accent;
      ctx.beginPath();
      ctx.moveTo(connector.x0, connector.y);
      ctx.lineTo(connector.x0 + (connector.x1 - connector.x0) * fill, connector.y);
      ctx.stroke();
    }
    if (STEPPER_INSPECTOR.connectorBounds) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.strokeRect(connector.x0, connector.y - 6, connector.x1 - connector.x0, 12);
    }
    if (STEPPER_INSPECTOR.connectorState) {
      ctx.fillStyle = theme.colors.textSecondary;
      ctx.font = `500 11px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const label = fill >= 0.99 ? 'done' : fill > 0.01 ? 'fill' : 'open';
      ctx.fillText(label, (connector.x0 + connector.x1) / 2, connector.y - 8);
    }
  });

  for (const step of layout.steps) {
    ctx.beginPath();
    ctx.fillStyle = step.state === 'done'
      ? theme.colors.dark
      : step.state === 'active'
        ? theme.colors.accent
        : theme.colors.surfaceWarm;
    ctx.arc(step.x, step.y, step.radius, 0, Math.PI * 2);
    ctx.fill();
    if (step.state === 'done') {
      drawCheck(ctx, step.x, step.y, step.radius);
    } else {
      ctx.fillStyle = step.state === 'active' ? theme.colors.onDark : theme.colors.textSecondary;
      ctx.font = `600 20px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(step.label, step.x, step.y + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  if (layout.title && layout.titleBaseline != null) {
    ctx.fillStyle = theme.colors.textPrimary;
    ctx.font = `500 34px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(layout.title, layout.contentLeft, layout.titleBaseline);
  }
  ctx.fillStyle = theme.colors.textSecondary;
  ctx.font = `400 24px ${FONT_SANS}`;
  ctx.textAlign = 'left';
  for (const line of layout.bodyLines) {
    ctx.fillText(line.text, layout.contentLeft, line.y);
  }
  ctx.fillStyle = theme.colors.accent;
  ctx.font = `500 24px ${FONT_SANS}`;
  for (const line of layout.errorLines) {
    ctx.fillText(line.text, layout.contentLeft, line.y);
  }
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = theme.colors.onDark;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(x - radius * 0.38, y);
  ctx.lineTo(x - radius * 0.08, y + radius * 0.32);
  ctx.lineTo(x + radius * 0.42, y - radius * 0.34);
  ctx.stroke();
}
