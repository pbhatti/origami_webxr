import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import { PAPER_DEPTH, PAPER_EDGE_WIDTH_M, PAPER_THICKNESS_M } from './paperDepth.ts';

/** Front, back, and edge slots on a paper mesh. */
export const PAPER_SIDE = {
  front: 0,
  back: 1,
  edge: 2,
} as const;

export interface OrigamiPaperMaterial {
  frontColor: string;
  backColor: string;
  edgeColor: string;
  paperThickness: number;
  edgeWidth: number;
}

export const FOLD_PAPER_COLOR = '#e24a1a';
export const MOUSE_PAPER_COLOR = '#6eb0d4';

const EXACT: Record<string, { back: string; edge: string }> = {
  '#91c943': { back: '#b7df7a', edge: '#648c38' },
};

const DESIGNED: Array<{ front: string; edgeHue: number }> = [
  { front: FOLD_PAPER_COLOR, edgeHue: 12 },
  { front: '#d9782f', edgeHue: -10 },
  { front: '#9564ad', edgeHue: -16 },
  { front: '#4e9a4a', edgeHue: -22 },
  { front: MOUSE_PAPER_COLOR, edgeHue: -28 },
];

/** Two paper sides about 16% apart, plus a darker accent shifted a little around the wheel. */
export function origamiPaperMaterial(frontColor: string): OrigamiPaperMaterial {
  const front = normalizeHex(frontColor);
  const exact = EXACT[front];
  if (exact) {
    return {
      frontColor: front,
      backColor: exact.back,
      edgeColor: exact.edge,
      paperThickness: PAPER_THICKNESS_M,
      edgeWidth: PAPER_EDGE_WIDTH_M,
    };
  }
  const designed = DESIGNED.find((entry) => entry.front === front);
  const edgeHue = designed?.edgeHue ?? 18;
  return {
    frontColor: front,
    backColor: shiftPaperTone(front, 0.16, designed ? 6 : 4, 0.9),
    edgeColor: shiftPaperTone(front, -0.1, edgeHue, 0.82),
    paperThickness: PAPER_THICKNESS_M,
    edgeWidth: PAPER_EDGE_WIDTH_M,
  };
}

export function createPaperMaterials(spec: OrigamiPaperMaterial): MeshStandardMaterial[] {
  return [spec.frontColor, spec.backColor, spec.edgeColor].map((color) => paperSide(color));
}

export function applyPaperMaterial(materials: MeshStandardMaterial[], spec: OrigamiPaperMaterial): void {
  const colors = [spec.frontColor, spec.backColor, spec.edgeColor];
  materials.forEach((material, index) => {
    const color = colors[index];
    if (color) {
      material.color.set(color);
    }
    material.roughness = PAPER_DEPTH.roughness;
    material.metalness = 0;
  });
}

export function paperLightness(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  return rgbToHsl(red, green, blue).l;
}

function paperSide(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: PAPER_DEPTH.roughness,
    metalness: 0,
    side: DoubleSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  });
}

export function shiftPaperTone(hex: string, lightnessDelta: number, hueDelta = 0, saturationScale = 1): string {
  const [red, green, blue] = hexToRgb(hex);
  const hsl = rgbToHsl(red, green, blue);
  const [nextRed, nextGreen, nextBlue] = hslToRgb(
    hsl.h + hueDelta,
    clamp01(hsl.s * saturationScale),
    clamp(hsl.l + lightnessDelta, 0.08, 0.92),
  );
  return rgbToHex(nextRed, nextGreen, nextBlue);
}

function normalizeHex(hex: string): string {
  const body = hex.trim().replace('#', '');
  const full = body.length === 3 ? body.split('').map((char) => char + char).join('') : body;
  return `#${full.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(normalizeHex(hex).slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function rgbToHsl(red: number, green: number, blue: number): { h: number; s: number; l: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === r) {
    h = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  return { h: h * 60, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hue = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (hue < 1) {
    red = chroma;
    green = x;
  } else if (hue < 2) {
    red = x;
    green = chroma;
  } else if (hue < 3) {
    green = chroma;
    blue = x;
  } else if (hue < 4) {
    green = x;
    blue = chroma;
  } else if (hue < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }
  const match = l - chroma / 2;
  return [(red + match) * 255, (green + match) * 255, (blue + match) * 255];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
