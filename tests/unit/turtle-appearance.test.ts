import { describe, expect, it } from 'vitest';
import { CircleGeometry, Group, Vector3, type Mesh, type MeshStandardMaterial } from 'three';
import { TurtleCreature } from '../../src/animation/TurtleCreature.ts';
import {
  TURTLE_EYE_RADIUS,
  TURTLE_HEX_LINE_WIDTH,
  TURTLE_HEX_RADIUS,
  TURTLE_PUPIL_RADIUS,
  turtleShellHoneycomb,
  type TurtleShellSegment,
} from '../../src/animation/turtleAppearance.ts';
import { TURTLE_EYE, TURTLE_HEAD_TIP, TURTLE_RECIPE } from '../../src/origami/recipes/turtle.recipe.ts';
import type { Vec3 } from '../../src/origami/types.ts';

function polygonArea(polygon: ReadonlyArray<readonly [number, number]>): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i]!;
    const end = polygon[(i + 1) % polygon.length]!;
    area += start[0] * end[1] - end[0] * start[1];
  }
  return area * 0.5;
}

function insidePolygon(
  px: number,
  py: number,
  polygon: ReadonlyArray<readonly [number, number]>,
  epsilon = 1e-6,
): boolean {
  const ring = polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon;
  for (let i = 0; i < ring.length; i += 1) {
    const start = ring[i]!;
    const end = ring[(i + 1) % ring.length]!;
    const cross = (end[0] - start[0]) * (py - start[1]) - (end[1] - start[1]) * (px - start[0]);
    if (cross < -epsilon) {
      return false;
    }
  }
  return true;
}

function strictlyInside(px: number, py: number, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  const ring = polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon;
  for (let i = 0; i < ring.length; i += 1) {
    const start = ring[i]!;
    const end = ring[(i + 1) % ring.length]!;
    const cross = (end[0] - start[0]) * (py - start[1]) - (end[1] - start[1]) * (px - start[0]);
    if (cross <= 1e-5) {
      return false;
    }
  }
  return true;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / lengthSq));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function segmentKey(segment: TurtleShellSegment): string {
  const quant = (value: number) => Math.round(value * 1e6);
  const a = `${quant(segment.a[0])},${quant(segment.a[1])}`;
  const b = `${quant(segment.b[0])},${quant(segment.b[1])}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function segmentLength(segment: TurtleShellSegment): number {
  return Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]);
}

describe('turtle shell honeycomb', () => {
  it('clips one shared-edge grid across the whole shell', () => {
    const honeycomb = turtleShellHoneycomb();
    const { segments, shell } = honeycomb;
    expect(honeycomb.radius).toBe(TURTLE_HEX_RADIUS);
    expect(honeycomb.radius / 0.1).toBeCloseTo(0.2, 5);
    expect(segments.length).toBeGreaterThan(20);
    expect(honeycomb.sharedEdgeCount).toBeGreaterThan(20);

    const keys = new Set<string>();
    for (const segment of segments) {
      const key = segmentKey(segment);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      const midpoint: [number, number] = [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2];
      expect(insidePolygon(segment.a[0], segment.a[1], shell)).toBe(true);
      expect(insidePolygon(segment.b[0], segment.b[1], shell)).toBe(true);
      expect(insidePolygon(midpoint[0], midpoint[1], shell)).toBe(true);
    }

    for (let i = 0; i < segments.length; i += 1) {
      const left = segments[i]!;
      const leftMid = [(left.a[0] + left.b[0]) / 2, (left.a[1] + left.b[1]) / 2] as const;
      const leftDir = [left.b[0] - left.a[0], left.b[1] - left.a[1]] as const;
      const leftLen = segmentLength(left) || 1;
      for (let j = i + 1; j < segments.length; j += 1) {
        const right = segments[j]!;
        const rightMid = [(right.a[0] + right.b[0]) / 2, (right.a[1] + right.b[1]) / 2] as const;
        if (Math.hypot(leftMid[0] - rightMid[0], leftMid[1] - rightMid[1]) > honeycomb.edgeLength * 0.15) {
          continue;
        }
        const rightDir = [right.b[0] - right.a[0], right.b[1] - right.a[1]] as const;
        const rightLen = segmentLength(right) || 1;
        const parallel = Math.abs(leftDir[0] * rightDir[1] - leftDir[1] * rightDir[0]) / (leftLen * rightLen);
        expect(parallel).toBeGreaterThan(0.2);
      }
    }

    const shellXs = shell.map((point) => point[0]);
    const shellYs = shell.map((point) => point[1]);
    const minX = Math.min(...shellXs);
    const maxX = Math.max(...shellXs);
    const minY = Math.min(...shellYs);
    const maxY = Math.max(...shellYs);
    const xs = segments.flatMap((segment) => [segment.a[0], segment.b[0]]);
    const ys = segments.flatMap((segment) => [segment.a[1], segment.b[1]]);
    expect(Math.min(...xs)).toBeLessThan(minX + honeycomb.radius);
    expect(Math.max(...xs)).toBeGreaterThan(maxX - honeycomb.radius);
    expect(Math.min(...ys)).toBeLessThan(minY + honeycomb.radius);
    expect(Math.max(...ys)).toBeGreaterThan(maxY - honeycomb.radius);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan((maxX - minX) * 0.8);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan((maxY - minY) * 0.9);

    for (let edge = 0; edge < shell.length; edge += 1) {
      const start = shell[edge]!;
      const end = shell[(edge + 1) % shell.length]!;
      const nearest = segments.reduce((best, segment) => {
        return Math.min(
          best,
          distanceToSegment(segment.a[0], segment.a[1], start[0], start[1], end[0], end[1]),
          distanceToSegment(segment.b[0], segment.b[1], start[0], start[1], end[0], end[1]),
        );
      }, Infinity);
      expect(nearest).toBeLessThan(1e-4);
    }

    const full = segments.filter((segment) => segmentLength(segment) > honeycomb.edgeLength * 0.98);
    const partial = segments.filter((segment) => segmentLength(segment) < honeycomb.edgeLength * 0.98);
    expect(full.length).toBeGreaterThan(8);
    expect(partial.length).toBeGreaterThan(8);

    const degree = new Map<string, number>();
    for (const segment of full) {
      for (const point of [segment.a, segment.b]) {
        const key = `${Math.round(point[0] * 1e5)},${Math.round(point[1] * 1e5)}`;
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    }
    const interior = [...degree.values()].filter((count) => count === 3);
    expect(interior.length).toBeGreaterThan(0);

    const head = (TURTLE_RECIPE.finalSilhouette ?? []).slice(3, 6) as Vec3[];
    expect(head).toHaveLength(3);
    const headRing = head.map((point) => [point[0], point[1]] as const);
    for (const segment of segments) {
      const midpoint: [number, number] = [(segment.a[0] + segment.b[0]) / 2, (segment.a[1] + segment.b[1]) / 2];
      expect(strictlyInside(midpoint[0], midpoint[1], headRing)).toBe(false);
    }
  });
});

describe('turtle eye', () => {
  it('draws a white disk, a half-size pupil toward the tip, and a smaller highlight', () => {
    const creature = new TurtleCreature();
    const eye = creature.group.getObjectByName('turtle-eye');
    const eyeball = eye?.getObjectByName('turtle-eyeball') as Mesh | undefined;
    const pupil = eye?.getObjectByName('turtle-pupil') as Mesh | undefined;
    const highlight = eye?.getObjectByName('turtle-highlight') as Mesh | undefined;
    expect(eyeball?.geometry).toBeInstanceOf(CircleGeometry);
    expect(pupil?.geometry).toBeInstanceOf(CircleGeometry);
    expect(highlight?.geometry).toBeInstanceOf(CircleGeometry);

    const eyeballRadius = (eyeball?.geometry as CircleGeometry).parameters.radius;
    const pupilRadius = (pupil?.geometry as CircleGeometry).parameters.radius;
    const highlightRadius = (highlight?.geometry as CircleGeometry).parameters.radius;
    expect(eyeballRadius).toBe(TURTLE_EYE_RADIUS);
    expect(pupilRadius).toBe(TURTLE_PUPIL_RADIUS);
    expect(pupilRadius / eyeballRadius).toBeGreaterThanOrEqual(0.45);
    expect(pupilRadius / eyeballRadius).toBeLessThanOrEqual(0.55);
    expect(highlightRadius).toBeLessThan(pupilRadius);

    const eyeballMaterial = eyeball?.material as MeshStandardMaterial;
    const pupilMaterial = pupil?.material as MeshStandardMaterial;
    const highlightMaterial = highlight?.material as MeshStandardMaterial;
    const pattern = creature.group.getObjectByName('turtle-shell-pattern') as Mesh;
    const patternMaterial = pattern.material as MeshStandardMaterial;
    expect(eyeballMaterial.color.getHexString()).toBe('ffffff');
    expect(eyeballMaterial.depthTest).toBe(true);
    expect(pupilMaterial.depthTest).toBe(true);
    expect(highlightMaterial.depthTest).toBe(true);
    expect(patternMaterial.depthTest).toBe(true);
    expect(patternMaterial.color.getHexString()).toBe('f6f1d4');
    expect(pattern.userData.honeycomb).toBe('clipped');

    const positions = pattern.geometry.getAttribute('position');
    expect(positions.count).toBe(turtleShellHoneycomb().segments.length * 6);
    const width = Math.hypot(positions.getX(0) - positions.getX(1), positions.getY(0) - positions.getY(1));
    expect(width).toBeCloseTo(TURTLE_HEX_LINE_WIDTH, 6);

    const towardTipX = TURTLE_HEAD_TIP[0] - TURTLE_EYE[0];
    const towardTipY = TURTLE_HEAD_TIP[1] - TURTLE_EYE[1];
    const shift = (pupil?.position.x ?? 0) * towardTipX + (pupil?.position.y ?? 0) * towardTipY;
    expect(shift).toBeGreaterThan(0);
    const shiftLength = Math.hypot(pupil?.position.x ?? 0, pupil?.position.y ?? 0);
    expect(shiftLength).toBeGreaterThan(eyeballRadius * 0.08);
    expect(shiftLength).toBeLessThan(eyeballRadius * 0.35);
    expect(eye?.position.x).toBeCloseTo(TURTLE_EYE[0], 6);
    expect(eye?.position.y).toBeCloseTo(TURTLE_EYE[1], 6);

    const shell = creature.group.getObjectByName('turtle-shell');
    expect(pattern.parent).toBe(shell);
    expect(shell?.parent?.name).toBe('turtle-features');
    expect(eye?.parent?.name).toBe('turtle-features');
  });

  it('keeps the eye on the sheet that grab, rotate, and scale transform', () => {
    const creature = new TurtleCreature();
    const host = new Group();
    creature.start(new Vector3(0.2, 0.1, 0), host);
    const features = host.getObjectByName('turtle-features');
    const eye = features?.getObjectByName('turtle-eye');
    expect(features?.parent).toBe(host);
    expect(eye?.parent).toBe(features);

    host.position.set(0.3, -0.2, 0.05);
    host.rotation.z = 0.7;
    host.scale.setScalar(1.8);
    host.updateMatrixWorld(true);
    const world = new Vector3();
    eye?.getWorldPosition(world);
    const local = eye?.position.clone() ?? new Vector3();
    local.applyMatrix4(host.matrixWorld);
    expect(world.x).toBeCloseTo(local.x, 5);
    expect(world.y).toBeCloseTo(local.y, 5);
    expect(world.z).toBeCloseTo(local.z, 5);
    expect(Math.hypot(world.x - host.position.x, world.y - host.position.y)).toBeGreaterThan(TURTLE_EYE_RADIUS);
  });
});
