import { MeshBasicMaterial, type Texture } from 'three';

/**
 * Warm minimal glass tokens.
 * Pixel radii are the screen-design reference. Spatial panels convert them
 * with canvasRadius() so a 32px corner on a design-width panel matches the
 * texture that is mapped onto the world-space mesh.
 */
export const theme = {
  colors: {
    background: '#F7F3EF',
    surface: '#FFFFFF',
    surfaceWarm: '#E7DDD5',
    surfaceMuted: '#EFEAE5',
    textPrimary: '#222222',
    textSecondary: '#77716E',
    accent: '#FF922E',
    accentSoft: '#FFD3AD',
    border: '#D8D0C9',
    dark: '#1F1F1F',
    onDark: '#FFFFFF',
  },
  radius: {
    card: 28,
    panel: 32,
    button: 999,
    input: 999,
  },
  opacity: {
    glass: 0.88,
    overlay: 0.94,
  },
  animation: {
    hoverMs: 180,
    pressMs: 120,
    panelTransitionMs: 300,
  },
} as const;

export const FONT_SANS = '"Plus Jakarta Sans", "Avenir Next", sans-serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Design-pixel radius scaled onto a canvas that represents `designWidth` px. */
export function canvasRadius(designPx: number, designWidth: number, canvasWidth: number): number {
  return (designPx / designWidth) * canvasWidth;
}

export const uiAppearance: { opacity: number } = {
  opacity: theme.opacity.overlay,
};

const linkedMaterials = new Set<MeshBasicMaterial>();

/**
 * Shared translucent material. Omit opacity to follow the UI Opacity setting.
 * Pass a number for effects that animate their own opacity, such as card sheen.
 */
export function themeMaterial(map: Texture | null, opacity?: number): MeshBasicMaterial {
  const linked = opacity == null;
  const material = new MeshBasicMaterial({
    map,
    transparent: true,
    opacity: linked ? uiAppearance.opacity : opacity,
    depthWrite: false,
    toneMapped: false,
  });
  if (linked) {
    linkedMaterials.add(material);
  }
  return material;
}

export function getUiOpacity(): number {
  return uiAppearance.opacity;
}

export function setUiOpacity(value: number): number {
  const next = Math.min(1, Math.max(0.55, value));
  uiAppearance.opacity = next;
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--ui-opacity', String(next));
  }
  for (const material of linkedMaterials) {
    material.opacity = next;
    material.needsUpdate = true;
  }
  return next;
}

if (typeof document !== 'undefined') {
  document.documentElement.style.setProperty('--ui-opacity', String(uiAppearance.opacity));
}
