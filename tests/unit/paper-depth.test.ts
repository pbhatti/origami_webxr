import { describe, expect, it } from 'vitest';
import { FoldPaper, deformFoldSnapshot } from '../../src/origami/FoldPaper.ts';
import { HALF_FOLD_RECIPE } from '../../src/origami/recipes/fixture-half-fold.ts';
import {
  PAPER_LAYER_GAP_M,
  PAPER_THICKNESS_M,
  buildPaperMesh,
} from '../../src/origami/paperDepth.ts';
import type { MeshSnapshot } from '../../src/origami/types.ts';

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
    expect(mesh.shadowPositions.length).toBeGreaterThan(9);
    expect(mesh.shadowPositions.length / 3).toBe(mesh.shadowColors.length / 4);
    const shadow = bounds(mesh.shadowPositions);
    expect(shadow.x).toBeLessThan(0.12);
    expect(shadow.y).toBeLessThan(0.1);
    expect(shadow.z).toBeLessThan(0.01);
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
    expect(mesh.shadowPositions.length).toBeGreaterThan(9);
    const shadow = bounds(mesh.shadowPositions);
    expect(Math.max(shadow.x, shadow.y)).toBeLessThan(0.22);
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
    expect(paper.layerCount).toBe(2);
    const position = paper.group.getObjectByName('paper-faces');
    expect(position).toBeTruthy();
    expect(paper.group.getObjectByName('paper-contact-shadows')).toBeTruthy();
  });
});
