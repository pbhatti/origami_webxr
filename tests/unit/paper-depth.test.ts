import { describe, expect, it } from 'vitest';
import { FoldPaper } from '../../src/origami/FoldPaper.ts';
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
    expect(upperFront - lowerFront).toBeGreaterThan(PAPER_THICKNESS_M);
    expect(mesh.colors[0]).toBeLessThan(0.9);
    expect(mesh.colors[24 * 3] ?? 0).toBeGreaterThan(0.95);
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
    expect(paper.material.roughness).toBeGreaterThan(0.9);
    expect(paper.material.metalness).toBe(0);
    expect(paper.material.vertexColors).toBe(true);
    expect(paper.layerCount).toBe(2);
    const position = paper.group.getObjectByName('paper-faces');
    expect(position).toBeTruthy();
  });
});
