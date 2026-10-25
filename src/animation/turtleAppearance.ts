import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { PAPER_LAYER_GAP_M, PAPER_THICKNESS_M } from '../origami/paperDepth.ts';
import {
  TURTLE_CREAM,
  TURTLE_EYE,
  TURTLE_EYE_COLOR,
  TURTLE_EYE_HIGHLIGHT,
  TURTLE_HEAD_TIP,
  TURTLE_SHELL,
} from '../origami/recipes/turtle.recipe.ts';

/**
 * Flat-top hex radius, center to vertex. The shell is 10 cm tall, so this
 * radius is a fifth of that height and the flat-to-flat pitch is about a third.
 */
export const TURTLE_HEX_RADIUS = 0.02;
/** Cream stroke. About 5.5% of the hex radius, the same width on every edge. */
export const TURTLE_HEX_LINE_WIDTH = 0.0011;
export const TURTLE_EYEBALL_COLOR = '#FFFFFF';
/** White eyeball diameter. Large enough to read at arm's length. */
export const TURTLE_EYE_RADIUS = 0.012;
/** 50% of the eyeball diameter. */
export const TURTLE_PUPIL_RADIUS = 0.006;
export const TURTLE_EYE_HIGHLIGHT_RADIUS = 0.0018;

/** Green shell top is fold layer 3. The head flap above it is layer 7. */
const SHELL_LAYER = 3;
const HEAD_LAYER = 7;
const shellFrontZ = SHELL_LAYER * PAPER_LAYER_GAP_M + PAPER_THICKNESS_M;
const headFrontZ = HEAD_LAYER * PAPER_LAYER_GAP_M + PAPER_THICKNESS_M;

/**
 * Just above the green shell and below the head flap, so folded paper still
 * occludes the lines and the stroke does not fight the shell.
 */
export const TURTLE_SHELL_PATTERN_Z = shellFrontZ + 0.00022;
/** Flat disk seated on the head flap rather than floating at the old sphere center. */
export const TURTLE_EYE_SURFACE_Z = headFrontZ + 0.00045;

const FRONT_SHIFT = 0.0022;

function towardTip(distance: number): readonly [number, number] {
  const dx = TURTLE_HEAD_TIP[0] - TURTLE_EYE[0];
  const dy = TURTLE_HEAD_TIP[1] - TURTLE_EYE[1];
  const length = Math.hypot(dx, dy) || 1;
  return [(dx / length) * distance, (dy / length) * distance];
}

/** Pupil sits slightly toward the head tip, which points left of the shell. */
export const TURTLE_PUPIL_OFFSET = towardTip(FRONT_SHIFT);
/** Small glint on the pupil, up and to the right of that shift. */
export const TURTLE_HIGHLIGHT_OFFSET: readonly [number, number] = [
  TURTLE_PUPIL_OFFSET[0] + 0.0021,
  TURTLE_PUPIL_OFFSET[1] + 0.0015,
];

export interface TurtleShellSegment {
  a: readonly [number, number];
  b: readonly [number, number];
}

export interface TurtleHoneycomb {
  /** Unique edges after clipping. A shared hex side appears once. */
  segments: TurtleShellSegment[];
  /** Edges dropped because a neighboring hex already emitted them. */
  sharedEdgeCount: number;
  radius: number;
  edgeLength: number;
  /** CCW shell polygon the grid was clipped against. */
  shell: ReadonlyArray<readonly [number, number]>;
}

type Point = [number, number];

function shellPolygon(): Point[] {
  const polygon = TURTLE_SHELL.map((point): Point => [point[0], point[1]]);
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area < 0 ? polygon.reverse() : polygon;
}

function quantKey(x: number, y: number): string {
  return `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
}

function edgeKey(a: Point, b: Point): string {
  const ak = quantKey(a[0], a[1]);
  const bk = quantKey(b[0], b[1]);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

/** Clip one segment to a convex CCW polygon. Boundary points stay. */
function clipSegment(start: Point, end: Point, polygon: readonly Point[]): Point[] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  for (let i = 0; i < polygon.length; i += 1) {
    const c = polygon[i]!;
    const d = polygon[(i + 1) % polygon.length]!;
    const ex = d[0] - c[0];
    const ey = d[1] - c[1];
    const nx = -ey;
    const ny = ex;
    const distStart = (start[0] - c[0]) * nx + (start[1] - c[1]) * ny;
    const distEnd = (end[0] - c[0]) * nx + (end[1] - c[1]) * ny;
    const denom = distStart - distEnd;
    if (Math.abs(denom) < 1e-12) {
      if (distStart < -1e-8) {
        return null;
      }
      continue;
    }
    const t = distStart / denom;
    if (distStart < distEnd) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }
    if (t0 > t1 + 1e-9) {
      return null;
    }
  }
  return [
    [start[0] + dx * t0, start[1] + dy * t0],
    [start[0] + dx * t1, start[1] + dy * t1],
  ];
}

function flatTopVertex(cx: number, cy: number, radius: number, index: number): Point {
  const angle = (Math.PI / 3) * index;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/**
 * Repeating flat-top honeycomb over the shell, then clipped so boundary
 * hexes keep only the part that lies on the green shell.
 */
export function turtleShellHoneycomb(radius = TURTLE_HEX_RADIUS): TurtleHoneycomb {
  const shell = shellPolygon();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of shell) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pitchX = radius * 1.5;
  const pitchY = radius * Math.sqrt(3);
  const pad = radius * 2;
  const seen = new Set<string>();
  const segments: TurtleShellSegment[] = [];
  let sharedEdgeCount = 0;
  const qMin = Math.floor((minX - cx - pad) / pitchX) - 1;
  const qMax = Math.ceil((maxX - cx + pad) / pitchX) + 1;

  for (let q = qMin; q <= qMax; q += 1) {
    const yShift = (q / 2) * pitchY;
    const rMin = Math.floor((minY - cy - yShift - pad) / pitchY) - 1;
    const rMax = Math.ceil((maxY - cy - yShift + pad) / pitchY) + 1;
    for (let r = rMin; r <= rMax; r += 1) {
      const centerX = cx + pitchX * q;
      const centerY = cy + pitchY * (r + q / 2);
      for (let edge = 0; edge < 6; edge += 1) {
        const a = flatTopVertex(centerX, centerY, radius, edge);
        const b = flatTopVertex(centerX, centerY, radius, (edge + 1) % 6);
        const key = edgeKey(a, b);
        if (seen.has(key)) {
          sharedEdgeCount += 1;
          continue;
        }
        seen.add(key);
        const clipped = clipSegment(a, b, shell);
        if (!clipped) {
          continue;
        }
        const length = Math.hypot(clipped[1]![0] - clipped[0]![0], clipped[1]![1] - clipped[0]![1]);
        if (length < TURTLE_HEX_LINE_WIDTH * 0.35) {
          continue;
        }
        segments.push({ a: clipped[0]!, b: clipped[1]! });
      }
    }
  }

  return { segments, sharedEdgeCount, radius, edgeLength: radius, shell };
}

function patternMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(TURTLE_CREAM),
    roughness: 0.62,
    metalness: 0,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function diskMaterial(color: string, offset: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.45,
    metalness: 0,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
}

/** Ribbon along each clipped edge. Shared sides are already unique, so they are drawn once. */
export function createTurtleShellPattern(radius = TURTLE_HEX_RADIUS): Mesh {
  const honeycomb = turtleShellHoneycomb(radius);
  const half = TURTLE_HEX_LINE_WIDTH / 2;
  const positions: number[] = [];
  const z = TURTLE_SHELL_PATTERN_Z;
  for (const segment of honeycomb.segments) {
    const dx = segment.b[0] - segment.a[0];
    const dy = segment.b[1] - segment.a[1];
    const length = Math.hypot(dx, dy) || 1;
    const px = (-dy / length) * half;
    const py = (dx / length) * half;
    const ex = (dx / length) * half;
    const ey = (dy / length) * half;
    const ax = segment.a[0] - ex;
    const ay = segment.a[1] - ey;
    const bx = segment.b[0] + ex;
    const by = segment.b[1] + ey;
    positions.push(
      ax + px, ay + py, z,
      ax - px, ay - py, z,
      bx + px, by + py, z,
      ax - px, ay - py, z,
      bx - px, by - py, z,
      bx + px, by + py, z,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, patternMaterial());
  mesh.name = 'turtle-shell-pattern';
  mesh.renderOrder = 2;
  mesh.userData.honeycomb = 'clipped';
  mesh.userData.segmentCount = honeycomb.segments.length;
  return mesh;
}

export function createTurtleEye(): Group {
  const group = new Group();
  group.name = 'turtle-eye';
  const eyeball = new Mesh(new CircleGeometry(TURTLE_EYE_RADIUS, 40), diskMaterial(TURTLE_EYEBALL_COLOR, -4));
  eyeball.name = 'turtle-eyeball';
  eyeball.renderOrder = 4;
  const pupil = new Mesh(new CircleGeometry(TURTLE_PUPIL_RADIUS, 32), diskMaterial(TURTLE_EYE_COLOR, -5));
  pupil.name = 'turtle-pupil';
  pupil.position.set(TURTLE_PUPIL_OFFSET[0], TURTLE_PUPIL_OFFSET[1], 0.00025);
  pupil.renderOrder = 5;
  const highlight = new Mesh(
    new CircleGeometry(TURTLE_EYE_HIGHLIGHT_RADIUS, 18),
    diskMaterial(TURTLE_EYE_HIGHLIGHT, -6),
  );
  highlight.name = 'turtle-highlight';
  highlight.position.set(TURTLE_HIGHLIGHT_OFFSET[0], TURTLE_HIGHLIGHT_OFFSET[1], 0.00045);
  highlight.renderOrder = 6;
  group.add(eyeball, pupil, highlight);
  group.position.set(TURTLE_EYE[0], TURTLE_EYE[1], TURTLE_EYE_SURFACE_Z);
  return group;
}
