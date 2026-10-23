import { CanvasTexture, LinearFilter, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { FONT_SANS, theme, themeMaterial } from '../theme/tokens.ts';
import type { AnimalId } from './animals.ts';

/**
 * Warm ivory washes, each card a slightly different beige so neighbors stay
 * distinct. Origami paper colors stay on the models.
 */
const CARD_GRADIENTS: Record<AnimalId, readonly [string, string]> = {
  whale: ['#fff6ee', '#ffe0c4'],
  fox: ['#fff3ea', '#ffd4b4'],
  bat: ['#f6f0fa', '#e4d4f0'],
  owl: ['#f4faf3', '#d5ecd3'],
  rabbit: ['#f7f3ef', '#e7ddd5'],
  elephant: ['#f4f0eb', '#e4d8ce'],
  bird: ['#f8f4ef', '#eadfd4'],
  swan: ['#fff7f1', '#f0dcc8'],
  crane: ['#f6f1ec', '#e8dcd0'],
  frog: ['#f3f0ea', '#e5ddd2'],
  boat: ['#f7f4f0', '#e6dcd2'],
  cat: ['#fff5ee', '#f0d5c4'],
  dog: ['#f6f1eb', '#e6d9cc'],
  horse: ['#f4eee8', '#e3d4c6'],
  'dog-sitting': ['#f8f4ef', '#e8dccf'],
  mouse: ['#f7f2ee', '#e9dfd6'],
  'cat-sitting': ['#fff6f1', '#efe0d4'],
  'dog-standing': ['#f5f0ea', '#e4d6c8'],
};

const textures = new Map<string, CanvasTexture>();
let shadowMaterial: MeshBasicMaterial | null = null;

export function cardGradientFor(id: string): { from: string; to: string } {
  const pair = CARD_GRADIENTS[id as AnimalId] ?? ['#e7e2dc', '#d5dbe6'];
  return { from: pair[0], to: pair[1] };
}

/** Drops cached pill labels so they can be redrawn once webfonts are ready. */
export function invalidatePillTextures(): void {
  for (const key of [...textures.keys()]) {
    if (key.startsWith('pill:') || key.startsWith('hint:')) {
      textures.delete(key);
    }
  }
}

export function cardGlassTexture(from: string, to: string): CanvasTexture {
  return cached(`card:${from}:${to}`, () => {
    const width = 256;
    const height = 320;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    traceRoundRect(ctx, 1, 1, width - 2, height - 2, 48);
    ctx.save();
    ctx.clip();
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, from);
    wash.addColorStop(1, to);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    const orb = ctx.createRadialGradient(width * 0.7, height * 0.62, 8, width * 0.7, height * 0.62, width * 0.7);
    orb.addColorStop(0, rgba(to, 0.85));
    orb.addColorStop(1, rgba(to, 0));
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, width, height);

    const core = ctx.createRadialGradient(width * 0.46, height * 0.44, 4, width * 0.46, height * 0.44, width * 0.52);
    core.addColorStop(0, 'rgba(255,255,255,0.55)');
    core.addColorStop(0.45, 'rgba(255,255,255,0.08)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    traceRoundRect(ctx, 1.5, 1.5, width - 3, height - 3, 47);
    ctx.strokeStyle = 'rgba(216, 208, 201, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return toTexture(canvas);
  });
}

export function panelGlassTexture(): CanvasTexture {
  return cached('panel', () => {
    const width = 1024;
    const height = 768;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    traceRoundRect(ctx, 2, 2, width - 4, height - 4, 56);
    ctx.save();
    ctx.clip();

    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, '#fffaf6');
    wash.addColorStop(0.55, theme.colors.background);
    wash.addColorStop(1, theme.colors.surfaceMuted);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    fillOrb(ctx, width * 0.84, height * 0.08, width * 0.34, theme.colors.accentSoft, 0.85);
    fillOrb(ctx, width * 0.12, height * 0.9, width * 0.28, theme.colors.surfaceWarm, 0.55);

    ctx.fillStyle = 'rgba(255, 252, 248, 0.28)';
    ctx.fillRect(0, 0, width, height);

    const sheen = ctx.createLinearGradient(0, 0, 0, height * 0.42);
    sheen.addColorStop(0, 'rgba(255,255,255,0.42)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height * 0.42);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    traceRoundRect(ctx, 2.5, 2.5, width - 5, height - 5, 54);
    ctx.strokeStyle = 'rgba(216, 208, 201, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return toTexture(canvas);
  });
}

export function sheenTexture(): CanvasTexture {
  return cached('sheen', () => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = context(canvas);
    const glow = ctx.createRadialGradient(size * 0.5, size * 0.46, 4, size * 0.5, size * 0.5, size * 0.48);
    glow.addColorStop(0, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    return toTexture(canvas);
  });
}

export function softShadowTexture(): CanvasTexture {
  return cached('shadow', () => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = context(canvas);
    const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.48);
    glow.addColorStop(0, 'rgba(48, 32, 40, 0.28)');
    glow.addColorStop(1, 'rgba(48, 32, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    return toTexture(canvas);
  });
}

export type PillTone = 'ink' | 'quiet' | 'muted' | 'active';

export function dragHandleTexture(highlight = false): CanvasTexture {
  return cached(`handle:${highlight ? 'hot' : 'idle'}`, () => {
    const width = 512;
    const height = 160;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    const inset = 10;
    traceRoundRect(ctx, inset, inset, width - inset * 2, height - inset * 2, (height - inset * 2) / 2);
    ctx.save();
    ctx.clip();
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, highlight ? 'rgba(255, 247, 240, 0.96)' : 'rgba(255, 252, 248, 0.9)');
    wash.addColorStop(1, highlight ? 'rgba(255, 211, 173, 0.72)' : 'rgba(231, 221, 213, 0.82)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    ctx.lineWidth = highlight ? 5 : 3;
    ctx.strokeStyle = highlight ? theme.colors.accent : 'rgba(31, 31, 31, 0.35)';
    ctx.stroke();

    ctx.fillStyle = highlight ? theme.colors.dark : 'rgba(31, 31, 31, 0.55)';
    const barW = 18;
    const barH = 52;
    const gap = 28;
    const startX = width / 2 - gap - barW / 2;
    const y = height / 2 - barH / 2;
    for (let i = 0; i < 3; i += 1) {
      traceRoundRect(ctx, startX + i * gap, y, barW, barH, 9);
      ctx.fill();
    }
    return toTexture(canvas);
  });
}

export function pillTexture(label: string, tone: PillTone): CanvasTexture {
  return cached(`pill:${tone}:${label}`, () => {
    const width = 512;
    const height = 160;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    const inset = 8;
    traceRoundRect(ctx, inset, inset, width - inset * 2, height - inset * 2, (height - inset * 2) / 2);
    if (tone === 'ink') {
      ctx.fillStyle = theme.colors.dark;
      ctx.fill();
    } else if (tone === 'muted') {
      ctx.fillStyle = theme.colors.surfaceWarm;
      ctx.fill();
    } else if (tone === 'active') {
      ctx.fillStyle = 'rgba(255, 250, 246, 0.96)';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = theme.colors.accent;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 252, 248, 0.72)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.colors.dark;
      ctx.stroke();
    }
    ctx.fillStyle = tone === 'ink'
      ? theme.colors.onDark
      : tone === 'muted'
        ? theme.colors.textSecondary
        : theme.colors.textPrimary;
    ctx.font = `500 ${label.length > 14 ? 42 : label.length > 10 ? 48 : 56}px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2 + 1);
    return toTexture(canvas);
  });
}

/** Quiet pill with a drawn X, used by the toolbar Exit control. */
export function exitPillTexture(label: string): CanvasTexture {
  return cached(`pill:exit:${label}`, () => {
    const width = 512;
    const height = 160;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    const inset = 8;
    traceRoundRect(ctx, inset, inset, width - inset * 2, height - inset * 2, (height - inset * 2) / 2);
    ctx.fillStyle = 'rgba(255, 252, 248, 0.72)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = theme.colors.dark;
    ctx.stroke();

    ctx.save();
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.colors.dark;
    ctx.beginPath();
    ctx.moveTo(96, 52);
    ctx.lineTo(148, 108);
    ctx.moveTo(148, 52);
    ctx.lineTo(96, 108);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = theme.colors.textPrimary;
    ctx.font = `500 56px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 310, height / 2 + 1);
    return toTexture(canvas);
  });
}

export function gestureHintTexture(label: string): CanvasTexture {
  return cached(`hint:${label}`, () => {
    const width = 1024;
    const height = 96;
    const canvas = makeCanvas(width, height);
    const ctx = context(canvas);
    ctx.strokeStyle = theme.colors.textSecondary;
    ctx.fillStyle = theme.colors.textSecondary;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(28, 70);
    ctx.lineTo(36, 28);
    ctx.moveTo(64, 70);
    ctx.lineTo(56, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(36, 28, 5, 0, Math.PI * 2);
    ctx.arc(56, 28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `500 28px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 84, height / 2 + 1);
    return toTexture(canvas);
  });
}

export function glassMaterial(map: CanvasTexture, opacity = 1): MeshBasicMaterial {
  return themeMaterial(map, opacity === 1 ? undefined : opacity);
}

export function sharedShadowMaterial(): MeshBasicMaterial {
  if (!shadowMaterial) {
    shadowMaterial = glassMaterial(softShadowTexture(), 1);
  }
  return shadowMaterial;
}

function cached(key: string, create: () => CanvasTexture): CanvasTexture {
  const existing = textures.get(key);
  if (existing) {
    return existing;
  }
  const texture = create();
  textures.set(key, texture);
  return texture;
}

function fillOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const orb = ctx.createRadialGradient(x, y, 8, x, y, radius);
  orb.addColorStop(0, rgba(color, alpha));
  orb.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = orb;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
