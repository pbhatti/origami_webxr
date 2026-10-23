import { describe, expect, it } from 'vitest';
import { deformByHinge } from '../../src/origami/MeshSplitter.ts';
import { hingeLayerMode, resolveFoldLayerGroup } from '../../src/origami/foldLayerGroup.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import type { HingeDefinition, MeshSnapshot } from '../../src/origami/types.ts';

const stacked: MeshSnapshot = {
  vertices: [
    [-0.04, 0.08, 0],
    [0.04, 0.08, 0],
    [0, 0.02, 0],
    [-0.04, 0.08, 0],
    [0.04, 0.08, 0],
    [0, 0.02, 0],
  ],
  faces: [
    { id: 'front', vertices: [0, 1, 2], layer: 1, materialId: 'front' },
    { id: 'back', vertices: [3, 4, 5], layer: 0, materialId: 'front' },
  ],
};

const crease: HingeDefinition = {
  id: 'packet-test',
  p0: [-0.05, 0.05, 0],
  p1: [0.05, 0.05, 0],
  fixedFaces: [],
  movingFaces: ['front'],
};

describe('fold layer group', () => {
  it('keeps stacked back-layer faces still in single-layer mode', () => {
    expect(hingeLayerMode(crease)).toBe('single');
    const result = deformByHinge(stacked, crease, -90, [0, 0.08, 0]);
    const originals = [...result.movingFaceIds].map((id) => id.split(':')[0]);
    expect(originals.some((id) => id === 'front')).toBe(true);
    expect(originals.some((id) => id === 'back')).toBe(false);
  });

  it('includes every stacked layer on the moving half-plane in packet mode', () => {
    const packet = { ...crease, layerMode: 'packet' as const };
    const result = deformByHinge(stacked, packet, -90, [0, 0.08, 0]);
    const group = resolveFoldLayerGroup(result.snapshot, result.movingFaceIds, packet);
    expect(group.mode).toBe('packet');
    expect(group.layers).toEqual([0, 1]);
    const originals = new Set(group.ownership.map((entry) => entry.originalId));
    expect(originals.has('front')).toBe(true);
    expect(originals.has('back')).toBe(true);
    expect(result.movingVertexIds.size).toBeGreaterThan(0);
    for (const index of result.movingVertexIds) {
      const rest = result.snapshot.vertices[index];
      expect(rest).toBeTruthy();
    }
  });

  it('does not mark whale folds as packet groups', () => {
    for (const step of WHALE_RECIPE.steps) {
      expect(hingeLayerMode(step.hinge), step.id).toBe('single');
    }
  });
});
