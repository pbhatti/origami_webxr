import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { FONT_SANS, theme } from '../theme/tokens.ts';

export function createLabelTexture(
  text: string,
  options: {
    width?: number;
    height?: number;
    fill?: string;
    ink?: string;
    size?: number;
    /** Gold rectangular frame. Gallery headings turn this off. */
    frame?: boolean;
    weight?: number;
    font?: string;
    tracking?: number;
  } = {},
): CanvasTexture {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  const framed = options.frame === true;
  const fill = options.fill ?? (framed ? theme.colors.background : 'transparent');
  if (fill !== 'transparent') {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  if (framed) {
    ctx.strokeStyle = theme.colors.border;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, width - 16, height - 16);
  }
  ctx.fillStyle = options.ink ?? theme.colors.textPrimary;
  ctx.font = `${options.weight ?? 500} ${options.size ?? 42}px ${options.font ?? FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillTrackedText(ctx, text, width / 2, height / 2, options.tracking ?? 0);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

function fillTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  if (tracking <= 0) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, chars.length - 1);
  let cursor = x - total / 2;
  for (let index = 0; index < chars.length; index += 1) {
    const width = widths[index] ?? 0;
    ctx.fillText(chars[index] ?? '', cursor + width / 2, y);
    cursor += width + tracking;
  }
}
