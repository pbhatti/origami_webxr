import { describe, expect, it } from 'vitest';
import { FoldPaper, deformFoldSnapshot } from '../../src/origami/FoldPaper.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import { HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import {
  PAPER_LAYER_GAP_M,
  PAPER_THICKNESS_M,
  buildPaperMesh,
} from '../../src/origami/paperDepth.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';

function triangle(layer: number, indexOffset = 0): MeshSnapshot['faces'][number] {
  return {
    id: `face-${layer}`,
    vertices: [indexOffset, indexOffset + 1, indexOffset + 2],
    layer,
    materialId: 'paper',
  };
}

const stacked: MeshSnapshot = {
  vertices: [
    [0, 0, 0],
    [0.1, 0, 0],
    [0.05, 0.08, 0],
    [0, 0, 0],
    [0.1, 0, 0],
    [0.05, 0.08, 0],
  ],
  faces: [triangle(0, 0), triangle(1, 3)],
};

function bounds(values: Float32Array): { x: number; y: number; z: number; minZ: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 3) {
    const x = values[index] ?? 0;
    const y = values[index + 1] ?? 0;
    const z = values[index + 2] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ, minZ, maxZ };
}

describe('folded paper depth', () => {
  it('keeps a physical thickness inside 0.3–0.6 mm and separates stacked layers', () => {
    expect(PAPER_THICKNESS_M).toBeGreaterThanOrEqual(0.0003);
    expect(PAPER_THICKNESS_M).toBeLessThanOrEqual(0.0006);
    expect(PAPER_LAYER_GAP_M).toBeGreaterThan(PAPER_THICKNESS_M);

    const mesh = buildPaperMesh(stacked, true);
    expect(mesh.faceCount).toBe(2);
    expect(mesh.positions.length).toBeGreaterThan(24 * 3);
    const lowerFront = mesh.positions[2] ?? 0;
    const upperFront = mesh.positions[24 * 3 + 2] ?? 0;
    expect(lowerFront).toBeCloseTo(PAPER_THICKNESS_M, 5);
    expect(upperFront - lowerFront).toBeCloseTo(PAPER_LAYER_GAP_M, 5);
    expect(mesh.colors[0]).toBeGreaterThan(0.95);
    expect(mesh.colors[24 * 3] ?? 0).toBeGreaterThan(0.95);
    expect(mesh.shadowPositions.length / 3).toBe(mesh.shadowColors.length / 4);
    if (mesh.shadowPositions.length > 0) {
      const shadow = bounds(mesh.shadowPositions);
      expect(shadow.x).toBeLessThan(0.12);
      expect(shadow.y).toBeLessThan(0.1);
      expect(shadow.maxZ).toBeLessThan(PAPER_LAYER_GAP_M + PAPER_THICKNESS_M);
    }
  });

  it('stacks a reversed valley winding in front of the sheet', () => {
    const flipped: MeshSnapshot = {
      vertices: [
        [0, 0, 0],
        [0.1, 0, 0],
        [0.05, 0.08, 0],
        [0, 0, 0],
        [0.05, 0.08, 0],
        [0.1, 0, 0],
      ],
      faces: [
        { id: 'lower', vertices: [0, 1, 2], layer: 0, materialId: 'paper' },
        { id: 'upper', vertices: [3, 4, 5], layer: 1, materialId: 'paper' },
      ],
    };
    const mesh = buildPaperMesh(flipped, true);
    const shell = bounds(mesh.positions);
    expect(shell.minZ).toBeGreaterThan(-0.00005);
    expect(shell.maxZ).toBeGreaterThan(PAPER_LAYER_GAP_M);
  });

  it('keeps a finished half fold layered and shades only the paper', () => {
    const step = HALF_FOLD_RECIPE.steps[0];
    const from = HALF_FOLD_RECIPE.snapshots.square;
    const to = HALF_FOLD_RECIPE.snapshots.rectangle;
    if (!step || !from || !to) {
      throw new Error('fixture snapshots missing');
    }
    const folded = deformFoldSnapshot(step, from, to, 180);
    expect(folded.faces.some((face) => face.layer >= 0.99)).toBe(true);
    const mesh = buildPaperMesh(folded, true);
    const shell = bounds(mesh.positions);
    expect(shell.minZ).toBeGreaterThan(-0.0002);
    expect(shell.maxZ).toBeGreaterThan(PAPER_LAYER_GAP_M);
    expect(shadowsAboveLocalTop(folded, mesh.shadowPositions)).toBe(0);
    if (mesh.shadowPositions.length > 0) {
      const shadow = bounds(mesh.shadowPositions);
      expect(Math.max(shadow.x, shadow.y)).toBeLessThan(0.22);
    }
  });

  it('bridges a shared crease so the two layers stay connected', () => {
    const hinged: MeshSnapshot = {
      vertices: [
        [0, 0, 0],
        [0.08, 0, 0],
        [0.04, 0.06, 0],
        [0.04, -0.06, 0],
      ],
      faces: [
        { id: 'a', vertices: [0, 1, 2], layer: 0, materialId: 'paper' },
        { id: 'b', vertices: [0, 3, 1], layer: 1, materialId: 'paper' },
      ],
    };
    const mesh = buildPaperMesh(hinged, true);
    expect(mesh.creaseLines.length).toBeGreaterThanOrEqual(6);
    expect(mesh.positions.length / 3).toBeGreaterThan(48);
  });

  it('uses a matte vertex-colored paper material', () => {
    const paper = new FoldPaper();
    paper.setSnapshot(stacked);
    expect(paper.material.roughness).toBeCloseTo(0.92, 5);
    expect(paper.material.metalness).toBe(0);
    expect(paper.material.vertexColors).toBe(true);
    expect(paper.material.depthTest).toBe(true);
    expect(paper.material.depthWrite).toBe(true);
    expect(paper.material.transparent).toBe(false);
    expect(paper.layerCount).toBe(2);
    const position = paper.group.getObjectByName('paper-faces');
    expect(position).toBeTruthy();
    const shadow = paper.group.getObjectByName('paper-contact-shadows') as unknown as {
      material: { depthTest: boolean; depthWrite: boolean; polygonOffset: boolean };
    };
    expect(shadow).toBeTruthy();
    expect(shadow.material.depthTest).toBe(true);
    expect(shadow.material.depthWrite).toBe(false);
    expect(shadow.material.polygonOffset).toBe(false);
  });

  it('casts a contact shadow on the exposed margin of a visible flap', () => {
    const flap = layered(
      [
        [0, 0, 0],
        [0.12, 0, 0],
        [0.06, 0.1, 0],
        [0.04, 0.03, 0],
        [0.08, 0.03, 0],
        [0.06, 0.055, 0],
      ],
      [
        ['base', [0, 1, 2], 0],
        ['flap', [3, 4, 5], 1],
      ],
    );
    const mesh = buildPaperMesh(flap, true);
    const flapPoly: Vec3[] = [
      [0.04, 0.03, 0],
      [0.08, 0.03, 0],
      [0.06, 0.055, 0],
    ];
    const basePoly: Vec3[] = [
      [0, 0, 0],
      [0.12, 0, 0],
      [0.06, 0.1, 0],
    ];
    expect(mesh.shadowPositions.length).toBeGreaterThan(9);
    expect(shadowsAboveLocalTop(flap, mesh.shadowPositions)).toBe(0);
    expect(shadowVerticesInside(mesh.shadowPositions, flapPoly, 0.001)).toBe(0);
    expect(countNear(mesh.shadowPositions, flapPoly, basePoly, 0.004)).toBeGreaterThan(0);
  });

  it('drops the contact shadow of a fold hidden under a higher sheet', () => {
    const covered = layered(
      [
        [0, 0, 0],
        [0.12, 0, 0],
        [0.06, 0.1, 0],
        [0.035, 0.025, 0],
        [0.085, 0.025, 0],
        [0.06, 0.055, 0],
        [0.02, 0.012, 0],
        [0.1, 0.012, 0],
        [0.06, 0.078, 0],
      ],
      [
        ['base', [0, 1, 2], 0],
        ['hidden', [3, 4, 5], 1],
        ['cover', [6, 7, 8], 2],
      ],
    );
    const mesh = buildPaperMesh(covered, true);
    const hidden: Vec3[] = [
      [0.035, 0.025, 0],
      [0.085, 0.025, 0],
      [0.06, 0.055, 0],
    ];
    const cover: Vec3[] = [
      [0.02, 0.012, 0],
      [0.1, 0.012, 0],
      [0.06, 0.078, 0],
    ];
    expect(shadowVerticesInside(mesh.shadowPositions, hidden, 0.001)).toBe(0);
    expect(shadowVerticesInside(mesh.shadowPositions, cover, 0.002)).toBe(0);
    expect(mesh.shadowPositions.length).toBeGreaterThan(9);
    expect(shadowsAboveLocalTop(covered, mesh.shadowPositions)).toBe(0);
    expect(countNear(mesh.shadowPositions, cover, [
      [0, 0, 0],
      [0.12, 0, 0],
      [0.06, 0.1, 0],
    ], 0.004)).toBeGreaterThan(0);
  });

  it('keeps a contact shadow only on the uncovered section of a flap', () => {
    const partial = layered(
      [
        [0, 0, 0],
        [0.12, 0, 0],
        [0.06, 0.1, 0],
        [0.03, 0.028, 0],
        [0.09, 0.028, 0],
        [0.06, 0.05, 0],
        [0.015, 0.012, 0],
        [0.06, 0.012, 0],
        [0.06, 0.07, 0],
        [0.015, 0.07, 0],
      ],
      [
        ['base', [0, 1, 2], 0],
        ['flap', [3, 4, 5], 1],
        ['cover', [6, 7, 8, 9], 2],
      ],
    );
    const mesh = buildPaperMesh(partial, true);
    const cover: Vec3[] = [
      [0.015, 0.012, 0],
      [0.06, 0.012, 0],
      [0.06, 0.07, 0],
      [0.015, 0.07, 0],
    ];
    expect(shadowVerticesInside(mesh.shadowPositions, cover, 0.002)).toBe(0);
    expect(shadowsAboveLocalTop(partial, mesh.shadowPositions)).toBe(0);
    let exposed = 0;
    for (let index = 0; index < mesh.shadowPositions.length; index += 3) {
      const x = mesh.shadowPositions[index] ?? 0;
      const y = mesh.shadowPositions[index + 1] ?? 0;
      if (x > 0.065 && y > 0.02 && y < 0.06) {
        exposed += 1;
      }
    }
    expect(exposed).toBeGreaterThan(0);
  });

  it('does not paint hidden crease shadows on the finished animals', () => {
    const finished: Array<[string, MeshSnapshot | undefined]> = [
      ['whale', WHALE_RECIPE.snapshots.whale],
      ['fox', FOX_RECIPE.snapshots.fox],
      ['owl', OWL_RECIPE.snapshots.owl],
      ['bat', BAT_RECIPE.snapshots.faced],
    ];
    for (const [name, snapshot] of finished) {
      expect(snapshot, name).toBeTruthy();
      const mesh = buildPaperMesh(snapshot!, true);
      expect(mesh.positions.length, name).toBeGreaterThan(0);
      if (mesh.shadowPositions.length > 0) {
        const paper = bounds(mesh.positions);
        const shadow = bounds(mesh.shadowPositions);
        expect(shadow.maxZ, name).toBeLessThanOrEqual(paper.maxZ + 0.0002);
      }
      if (name !== 'bat') {
        expect(shadowsAboveLocalTop(snapshot!, mesh.shadowPositions), name).toBe(0);
      }
    }
    expect(buildPaperMesh(OWL_RECIPE.snapshots.owl!, true).shadowPositions.length).toBeGreaterThan(9);
  });
});

function layered(
  vertices: Vec3[],
  faces: Array<[string, number[], number]>,
): MeshSnapshot {
  return {
    vertices,
    faces: faces.map(([id, indices, layer]) => ({
      id,
      vertices: indices,
      layer,
      materialId: 'paper',
    })),
  };
}

function facePoints(snapshot: MeshSnapshot, vertices: number[]): Vec3[] {
  return vertices.flatMap((index) => {
    const point = snapshot.vertices[index];
    return point ? [point] : [];
  });
}

function contains(poly: Vec3[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index, index += 1) {
    const current = poly[index];
    const prior = poly[previous];
    if (!current || !prior) {
      continue;
    }
    const crosses = current[1] > y !== prior[1] > y
      && x < ((prior[0] - current[0]) * (y - current[1])) / (prior[1] - current[1] + 1e-12) + current[0];
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdges(poly: Vec3[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index];
    const b = poly[(index + 1) % poly.length];
    if (!a || !b) {
      continue;
    }
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq < 1e-12
      ? 0
      : Math.min(Math.max(((x - a[0]) * abx + (y - a[1]) * aby) / lengthSq, 0), 1);
    best = Math.min(best, Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t)));
  }
  return best;
}

function facesCamera(poly: Vec3[]): boolean {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index];
    const b = poly[(index + 1) % poly.length];
    if (!a || !b) {
      continue;
    }
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(x, y, z);
  return length > 1e-8 && Math.abs(z / length) > 0.85;
}

function shadowsAboveLocalTop(snapshot: MeshSnapshot, shadows: Float32Array): number {
  const faces = snapshot.faces.flatMap((face) => {
    const poly = facePoints(snapshot, face.vertices);
    return poly.length >= 3 && facesCamera(poly) ? [{ poly, layer: face.layer }] : [];
  });
  let raised = 0;
  for (let index = 0; index < shadows.length; index += 3) {
    const x = shadows[index] ?? 0;
    const y = shadows[index + 1] ?? 0;
    const z = shadows[index + 2] ?? 0;
    let topLayer = Number.NEGATIVE_INFINITY;
    for (const face of faces) {
      const onFace = contains(face.poly, x, y) || distanceToEdges(face.poly, x, y) < 0.0015;
      if (onFace && face.layer > topLayer) {
        topLayer = face.layer;
      }
    }
    if (topLayer === Number.NEGATIVE_INFINITY) {
      continue;
    }
    const front = topLayer * PAPER_LAYER_GAP_M + PAPER_THICKNESS_M;
    if (z > front + 0.00035) {
      raised += 1;
    }
  }
  return raised;
}

function shadowVerticesInside(shadows: Float32Array, poly: Vec3[], margin: number): number {
  let count = 0;
  for (let index = 0; index < shadows.length; index += 3) {
    const x = shadows[index] ?? 0;
    const y = shadows[index + 1] ?? 0;
    if (contains(poly, x, y) && distanceToEdges(poly, x, y) > margin) {
      count += 1;
    }
  }
  return count;
}

function countNear(shadows: Float32Array, edge: Vec3[], surface: Vec3[], reach: number): number {
  let count = 0;
  for (let index = 0; index < shadows.length; index += 3) {
    const x = shadows[index] ?? 0;
    const y = shadows[index + 1] ?? 0;
    if (!contains(edge, x, y) && contains(surface, x, y) && distanceToEdges(edge, x, y) < reach) {
      count += 1;
    }
  }
  return count;
}
