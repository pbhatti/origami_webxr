import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { buildPaperMesh, PAPER_LAYER_GAP_M } from '../../src/origami/paperDepth.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import {
  DINOSAUR_BACK_COLOR,
  DINOSAUR_EDGE_COLOR,
  DINOSAUR_EYE,
  DINOSAUR_HEAD_TIP,
  DINOSAUR_MARK_COLOR,
  DINOSAUR_NAMED,
  DINOSAUR_NECK_WIDTH,
  DINOSAUR_OPEN_MIN_LAYER,
  DINOSAUR_PAPER_COLOR,
  DINOSAUR_RECIPE,
  DINOSAUR_ROLL_SEGMENT_COUNT,
  DINOSAUR_STEPS,
  DINOSAUR_TAIL_TIP,
  dinosaurRollAt,
  dinosaurSpineMarks,
} from '../../src/origami/recipes/dinosaur.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import { TURTLE_RECIPE } from '../../src/origami/recipes/turtle.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
import { deformFoldSnapshot } from '../../src/origami/FoldPaper.ts';
import type { MeshSnapshot, Vec3 } from '../../src/origami/types.ts';
import type { PaperMeshBuffers } from '../../src/origami/paperDepth.ts';

vi.spyOn(console, 'info').mockImplementation(() => {});

const S = 0.1;

function drain(engine: OrigamiEngine): void {
  for (let i = 0; i < 80; i += 1) {
    if (engine.tick(16).finished) {
      return;
    }
  }
}

function commitCurrent(engine: OrigamiEngine): void {
  engine.assistToTarget();
  drain(engine);
}

function pointInside(snapshot: MeshSnapshot, x: number, y: number): boolean {
  return snapshot.faces.some((face) => {
    const poly = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [point] : [];
    });
    return poly.length >= 3 && contains(poly, x, y);
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

function svg(name: string, snapshot: MeshSnapshot): void {
  const lines: string[] = [];
  lines.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -120 240 240">');
  snapshot.faces.forEach((face, index) => {
    const pts = face.vertices
      .map((vertex) => snapshot.vertices[vertex])
      .filter((point): point is Vec3 => point != null)
      .map((point) => `${(point[0] * 1000).toFixed(1)},${(-point[1] * 1000).toFixed(1)}`)
      .join(' ');
    const color = `hsl(${(face.layer * 28) % 360} 70% ${42 + (index % 3) * 8}%)`;
    lines.push(`<polygon points="${pts}" fill="${color}" fill-opacity="0.35" stroke="#222" stroke-width="0.6"/>`);
  });
  lines.push('</svg>');
  writeFileSync(`/tmp/dino-${name}.svg`, lines.join('\n'));
}

describe('origami dinosaur recipe', () => {
  it('dumps step outlines and matches the nine-step silhouette', () => {
    const snaps: Array<[string, MeshSnapshot | undefined]> = [
      ['1-triangle', DINOSAUR_RECIPE.snapshots.triangle],
      ['2-triangle-crease', DINOSAUR_RECIPE.snapshots.triangle],
      ['3-section', DINOSAUR_RECIPE.snapshots.section],
      ['4-narrow', DINOSAUR_RECIPE.snapshots.narrow],
      ['5-opened', DINOSAUR_RECIPE.snapshots.opened],
      ['6-neck', DINOSAUR_RECIPE.snapshots.neck],
      ['7-head', DINOSAUR_RECIPE.snapshots.headed],
      ['8-tail', DINOSAUR_RECIPE.snapshots.tailed],
    ];
    for (const [name, snapshot] of snaps) {
      expect(snapshot, name).toBeTruthy();
      svg(name, snapshot!);
      const bounds = snapshotBounds(snapshot!);
      console.log(name, bounds, 'layers', [...new Set(snapshot!.faces.map((face) => face.layer))].sort((a, b) => a - b), 'TR', snapshot!.named?.TR, 'EDGE', snapshot!.named?.EDGE, 'BL', snapshot!.named?.BL);
    }
    console.log('head tip', DINOSAUR_HEAD_TIP, 'tail', DINOSAUR_TAIL_TIP, 'eye', DINOSAUR_EYE, 'neck width', DINOSAUR_NECK_WIDTH, 'open layers', DINOSAUR_OPEN_MIN_LAYER, 'segments', DINOSAUR_ROLL_SEGMENT_COUNT);
    const triangle = DINOSAUR_RECIPE.snapshots.triangle!;
    const tri = snapshotBounds(triangle);
    expect(tri.minX).toBeCloseTo(-S, 2);
    expect(tri.maxX).toBeCloseTo(S, 2);
    expect(tri.minY).toBeCloseTo(-S, 2);
    expect(tri.maxY).toBeCloseTo(S, 2);
    expect(pointInside(triangle, S * 0.6, -S * 0.4)).toBe(true);
    expect(pointInside(triangle, -S * 0.55, S * 0.45)).toBe(false);
    expect(triangle.faces.some((face) => face.layer >= 1)).toBe(true);

    const section = DINOSAUR_RECIPE.snapshots.section!;
    const sectionBounds = snapshotBounds(section);
    expect(sectionBounds.maxX).toBeLessThan(S * 0.55);
    expect(sectionBounds.maxX).toBeGreaterThan(S * 0.45);
    expect(section.faces.some((face) => face.layer >= 2)).toBe(true);

    const narrow = DINOSAUR_RECIPE.snapshots.narrow!;
    const narrowBounds = snapshotBounds(narrow);
    expect(narrowBounds.maxX).toBeLessThan(S * 0.32);
    expect(narrowBounds.minX).toBeCloseTo(-S, 2);
    expect(narrow.faces.some((face) => face.layer >= 3)).toBe(true);

    const opened = DINOSAUR_RECIPE.snapshots.opened!;
    const openBounds = snapshotBounds(opened);
    expect(openBounds.maxX).toBeGreaterThan(S * 0.9);
    expect(openBounds.minX).toBeCloseTo(-S, 2);
    expect(pointInside(opened, -S * 0.55, S * 0.45)).toBe(false);

    const neck = DINOSAUR_RECIPE.snapshots.neck!;
    const neckBounds = snapshotBounds(neck);
    expect(neckBounds.maxX).toBeLessThan(DINOSAUR_NECK_WIDTH + 0.012);
    expect(neckBounds.maxX).toBeGreaterThan(DINOSAUR_NECK_WIDTH * 0.7);
    expect(neckBounds.minX).toBeCloseTo(-S, 2);
    expect(neckBounds.maxY).toBeGreaterThan(S * 0.85);
    expect(pointInside(neck, -S * 0.4, -S * 0.7)).toBe(true);

    expect(DINOSAUR_HEAD_TIP[0]).toBeGreaterThan(DINOSAUR_NECK_WIDTH);
    expect(DINOSAUR_TAIL_TIP[0]).toBeGreaterThan(-S + 0.008);
    expect(DINOSAUR_TAIL_TIP[1]).toBeGreaterThan(-S + 0.004);
  });

  it('rolls from fully open to a narrow neck without dropping paper', () => {
    const open = dinosaurRollAt(0);
    const mid = dinosaurRollAt(0.5);
    const shut = dinosaurRollAt(1);
    expect(snapshotBounds(open).maxX).toBeGreaterThan(S * 0.9);
    expect(snapshotBounds(shut).maxX).toBeLessThan(DINOSAUR_NECK_WIDTH + 0.012);
    expect(mid.faces.length).toBeGreaterThanOrEqual(open.faces.length);
    expect(shut.faces.length).toBeGreaterThanOrEqual(open.faces.length);
    const step = DINOSAUR_RECIPE.steps.find((entry) => entry.id === 'dino-roll');
    expect(step).toBeTruthy();
    const animated = deformFoldSnapshot(step!, open, shut, 90);
    expect(animated.faces.length).toBeGreaterThan(0);
    expect(snapshotBounds(animated).maxX).toBeLessThan(S);
    expect(snapshotBounds(animated).minX).toBeLessThan(-S * 0.8);
  });

  it('is a valid nine-step recipe and leaves the other animals alone', () => {
    expect(DINOSAUR_PAPER_COLOR).toBe('#FFC547');
    const paper = origamiPaperMaterial(DINOSAUR_PAPER_COLOR);
    expect(paper.backColor).toBe(DINOSAUR_BACK_COLOR.toLowerCase());
    expect(paper.edgeColor).toBe(DINOSAUR_EDGE_COLOR.toLowerCase());
    expect(DINOSAUR_MARK_COLOR).toBe('#D96722');
    expect(validateRecipe(DINOSAUR_RECIPE)).toEqual([]);
    expect(DINOSAUR_STEPS).toHaveLength(9);
    expect(progressFromRecipe(DINOSAUR_RECIPE).totalSteps).toBe(9);
    expect(DINOSAUR_RECIPE.steps.map((entry) => entry.title)).toEqual([
      'Fold into a triangle',
      'Create the center crease',
      'Create the center crease',
      'Fold the first section',
      'Fold the section again',
      'Open the fold',
      'Roll up the neck',
      'Shape the head',
      'Shape the tail',
      'Bring it to life',
    ]);
    expect(DINOSAUR_RECIPE.steps.filter((entry) => entry.progressStage === 6)[0]?.meshStrategy).toBe('roll');
    expect(DINOSAUR_ROLL_SEGMENT_COUNT).toBeGreaterThanOrEqual(3);
    expect(WHALE_RECIPE.steps[0]?.id).toBe('diag-fold');
    expect(FOX_RECIPE.steps[0]?.id).toBe('fox-half');
    expect(BAT_RECIPE.steps[0]?.id).toBe('bat-triangle');
    expect(OWL_RECIPE.steps[0]?.id).toBe('owl-vertical-fold');
    expect(TURTLE_RECIPE.steps[0]?.id).toBe('turtle-diag-a-fold');
    for (const entry of DINOSAUR_RECIPE.steps) {
      expect(creaseAlignmentErrorM(entry)).toBeLessThanOrEqual(CREASE_ALIGN_TOL_M);
    }
    expect(dinosaurSpineMarks().length).toBeGreaterThanOrEqual(4);
  });

  it('advances all nine stages, then clears roll progress on restart', () => {
    const engine = new OrigamiEngine(DINOSAUR_RECIPE, DINOSAUR_NAMED);
    expect(engine.rollProgress).toBe(0);
    expect(engine.currentStep?.id).toBe('dino-triangle');
    const stages: number[] = [];
    while (engine.currentStep && stages.length < 16) {
      stages.push(engine.currentStep.progressStage ?? 0);
      if (engine.currentStep.id === 'dino-roll') {
        expect(engine.rollProgress).toBe(0);
      }
      commitCurrent(engine);
    }
    expect(engine.isComplete()).toBe(true);
    expect(engine.rollProgress).toBe(1);
    expect(stages).toEqual([1, 2, 2, 3, 4, 5, 6, 7, 8, 9]);
    engine.reset(DINOSAUR_RECIPE, DINOSAUR_NAMED);
    expect(engine.rollProgress).toBe(0);
    expect(engine.currentStep?.id).toBe('dino-triangle');
    expect(engine.isStepCommitted('dino-roll')).toBe(false);
    expect(engine.fromSnapshot?.named?.TL?.[0]).toBeLessThan(-0.09);
    expect(engine.fromSnapshot?.named?.TR?.[1]).toBeGreaterThan(0.09);
  });

  it('hides neck borders that sit under a higher sheet and keeps the outer edge', () => {
    const neck = DINOSAUR_RECIPE.snapshots.neck!;
    const mesh = buildPaperMesh(neck, false);
    expect(bordersUnderHigherFace(neck, mesh)).toBe(0);
    expect(edgeVerticesNear(mesh, [DINOSAUR_NECK_WIDTH, 0, 0], 0.012) + edgeVerticesNear(mesh, [0, 0.04, 0], 0.012)).toBeGreaterThan(0);
    const top = neck.faces.reduce((max, face) => Math.max(max, face.layer), 0);
    expect(top).toBeGreaterThan(2);
    expect(top).toBeLessThan(16);
  });
});

function edgeVertices(mesh: PaperMeshBuffers): Vec3[] {
  const group = mesh.groups.find((entry) => entry.materialIndex === 2);
  if (!group) {
    return [];
  }
  const points: Vec3[] = [];
  for (let vertex = 0; vertex < group.count; vertex += 1) {
    const offset = (group.start + vertex) * 3;
    points.push([mesh.positions[offset] ?? 0, mesh.positions[offset + 1] ?? 0, mesh.positions[offset + 2] ?? 0]);
  }
  return points;
}

function edgeVerticesNear(mesh: PaperMeshBuffers, point: Vec3, radius: number): number {
  return edgeVertices(mesh).filter((vertex) => Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) <= radius).length;
}

function bordersUnderHigherFace(snapshot: MeshSnapshot, mesh: PaperMeshBuffers): number {
  const faces = snapshot.faces.flatMap((face) => {
    const poly = face.vertices.flatMap((index) => {
      const point = snapshot.vertices[index];
      return point ? [point] : [];
    });
    return poly.length >= 3 ? [{ layer: face.layer, poly }] : [];
  });
  let buried = 0;
  for (const point of edgeVertices(mesh)) {
    for (const face of faces) {
      const sheetZ = face.layer * PAPER_LAYER_GAP_M;
      if (point[2] > sheetZ - 0.00015) {
        continue;
      }
      if (contains(face.poly, point[0], point[1]) && distanceToEdges(face.poly, point[0], point[1]) > 0.003) {
        buried += 1;
        break;
      }
    }
  }
  return buried;
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
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * abx + (y - a[1]) * aby) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t)));
  }
  return best;
}
