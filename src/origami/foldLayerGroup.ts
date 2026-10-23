import type { FoldLayerMode, HingeDefinition, MeshSnapshot } from './types.ts';

export interface FoldLayerGroup {
  id: string;
  mode: FoldLayerMode;
  seedFaceIds: string[];
  faceIds: string[];
  layers: number[];
  frontFaceIds: string[];
  backFaceIds: string[];
  ownership: Array<{ faceId: string; originalId: string; layer: number }>;
}

export function originalFaceId(id: string): string {
  return id.split(':')[0] ?? id;
}

export function hingeLayerMode(hinge: HingeDefinition): FoldLayerMode {
  return hinge.layerMode === 'packet' ? 'packet' : 'single';
}

export function resolveFoldLayerGroup(
  snapshot: MeshSnapshot,
  movingFaceIds: Iterable<string>,
  hinge: HingeDefinition,
): FoldLayerGroup {
  const moving = new Set(movingFaceIds);
  const faces = snapshot.faces.filter((face) => moving.has(face.id));
  const layers = [...new Set(faces.map((face) => face.layer))].sort((a, b) => a - b);
  const backLayer = layers[0];
  const frontLayer = layers.at(-1);
  const ownership = faces.map((face) => ({
    faceId: face.id,
    originalId: originalFaceId(face.id),
    layer: face.layer,
  }));
  return {
    id: hinge.id,
    mode: hingeLayerMode(hinge),
    seedFaceIds: [...hinge.movingFaces],
    faceIds: faces.map((face) => face.id),
    layers,
    frontFaceIds: faces.filter((face) => face.layer === frontLayer).map((face) => face.id),
    backFaceIds: faces.filter((face) => face.layer === backLayer).map((face) => face.id),
    ownership,
  };
}

export function layerOwnershipLabel(group: FoldLayerGroup): string {
  if (group.ownership.length === 0) {
    return '—';
  }
  const byOriginal = new Map<string, number>();
  for (const entry of group.ownership) {
    const current = byOriginal.get(entry.originalId);
    if (current == null || entry.layer > current) {
      byOriginal.set(entry.originalId, entry.layer);
    }
  }
  return [...byOriginal.entries()]
    .map(([id, layer]) => `${id}:L${layer}`)
    .slice(0, 4)
    .join(' ');
}

