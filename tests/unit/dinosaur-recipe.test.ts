import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { DinosaurCreature } from '../../src/animation/DinosaurCreature.ts';
import { OrigamiEngine } from '../../src/origami/OrigamiEngine.ts';
import { CREASE_ALIGN_TOL_M, creaseAlignmentErrorM } from '../../src/origami/creaseMath.ts';
import { snapshotBounds } from '../../src/origami/batFinalShape.ts';
import { FOLD_ASSIST } from '../../src/origami/foldAssist.ts';
import { deformByHinge } from '../../src/origami/MeshSplitter.ts';
import { createPaperMaterials, origamiPaperMaterial } from '../../src/origami/OrigamiPaperMaterial.ts';
import { buildPaperMesh, PAPER_LAYER_GAP_M } from '../../src/origami/paperDepth.ts';
import { progressFromRecipe } from '../../src/origami/progressModel.ts';
import { validateRecipe } from '../../src/origami/RecipeValidator.ts';
import { BAT_RECIPE } from '../../src/origami/recipes/bat.recipe.ts';
import {
  DINOSAUR_BACK_COLOR,
  DINOSAUR_EDGE_COLOR,
  DINOSAUR_EYE,
  DINOSAUR_FOOT_TIP,
  DINOSAUR_HEAD_TIP,
  DINOSAUR_MARK_COLOR,
  DINOSAUR_NAMED,
  DINOSAUR_PAPER_COLOR,
  DINOSAUR_RECIPE,
  DINOSAUR_STEPS,
  dinosaurSpineMarks,
} from '../../src/origami/recipes/dinosaur.recipe.ts';
import { FOX_RECIPE } from '../../src/origami/recipes/fox.recipe.ts';
import { OWL_RECIPE } from '../../src/origami/recipes/owl.recipe.ts';
import { TURTLE_RECIPE } from '../../src/origami/recipes/turtle.recipe.ts';
import { WHALE_RECIPE } from '../../src/origami/recipes/whale.recipe.ts';
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

describe('origami dinosaur recipe', () => {
  it('keeps steps 1–4 and shapes the head directly from the Step 4 neck strip', () => {
    const snaps: Array<[string, MeshSnapshot | undefined]> = [
      ['triangle', DINOSAUR_RECIPE.snapshots.triangle],
      ['section', DINOSAUR_RECIPE.snapshots.section],
      ['narrow', DINOSAUR_RECIPE.snapshots.narrow],
      ['headed', DINOSAUR_RECIPE.snapshots.headed],
      ['footed', DINOSAUR_RECIPE.snapshots.footed],
    ];
    for (const [name, snapshot] of snaps) {
      expect(snapshot, name).toBeTruthy();
    }
    expect(DINOSAUR_RECIPE.snapshots).not.toHaveProperty('opened');

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
    expect(narrowBounds.maxX).toBeCloseTo(S * 0.25, 3);
    expect(narrowBounds.minX).toBeCloseTo(-S, 2);
    expect(narrowBounds.maxY).toBeCloseTo(S, 2);
    expect(narrow.faces.some((face) => face.layer >= 3)).toBe(true);

    const headed = DINOSAUR_RECIPE.snapshots.headed!;
    const headBounds = snapshotBounds(headed);
    expect(headBounds.maxX).toBeGreaterThan(S * 0.25 + 0.015);
    expect(headBounds.minX).toBeCloseTo(-S, 2);
    expect(headBounds.minY).toBeCloseTo(-S, 2);
    expect(headBounds.maxY).toBeLessThan(S - 0.01);
    expect(headBounds.maxY).toBeGreaterThan(S * 0.6);
    expect(DINOSAUR_HEAD_TIP[0]).toBeGreaterThan(S * 0.25 + 0.015);
    expect(DINOSAUR_HEAD_TIP[1]).toBeLessThan(S - 0.01);
    expect(DINOSAUR_HEAD_TIP[1]).toBeGreaterThan(0.04);
    expect(pointInside(headed, -S * 0.4, -S * 0.7)).toBe(true);
    expect(pointInside(headed, S * 0.12, -S * 0.4)).toBe(true);
    expect(headed.vertices.some((vertex) => Math.abs(vertex[0] - S * 0.25) < 0.004 && Math.abs(vertex[1] + S) < 0.004)).toBe(true);

    expect(DINOSAUR_FOOT_TIP[0]).toBeGreaterThan(-S + 0.008);
    expect(DINOSAUR_FOOT_TIP[1]).toBeGreaterThan(-S + 0.004);
    expect(DINOSAUR_RECIPE.snapshots.footed?.named?.TR?.[0]).toBeCloseTo(DINOSAUR_HEAD_TIP[0], 3);
    expect(DINOSAUR_RECIPE.snapshots.footed?.named?.TR?.[1]).toBeCloseTo(DINOSAUR_HEAD_TIP[1], 3);
    expect(DINOSAUR_EYE[0]).toBeGreaterThan(S * 0.25);
    expect(DINOSAUR_EYE[0]).toBeLessThan(DINOSAUR_HEAD_TIP[0]);
    expect(DINOSAUR_EYE[1]).toBeGreaterThan(0.04);
  });

  it('hinges the head directly on the Step 4 neck strip so the tip points right', () => {
    const narrow = DINOSAUR_RECIPE.snapshots.narrow!;
    const head = DINOSAUR_RECIPE.steps.find((entry) => entry.id === 'dino-head');
    expect(head?.fromSnapshotId).toBe('narrow');
    expect(head?.toSnapshotId).toBe('headed');
    expect(head?.progressStage).toBe(5);
    expect(head?.meshStrategy).toBe('hinge');
    expect(head?.rollSegments).toBeUndefined();
    expect(head?.rollDirection).toBeUndefined();
    expect(head?.targetAngleDeg).toBe(180);
    expect(FOLD_ASSIST.activationThreshold).toBe(0.5);
    const tip = narrow.named?.TR;
    expect(tip?.[0]).toBeCloseTo(0, 3);
    expect(tip?.[1]).toBeCloseTo(S, 3);
    const ends = [head!.hinge.p0, head!.hinge.p1];
    expect(ends.some((point) => Math.abs(point[0]) < 0.003 && point[1] < tip![1] - 0.03 && point[1] > 0.04)).toBe(true);
    expect(ends.some((point) => Math.abs(point[0] - S * 0.25) < 0.003 && Math.abs(point[1] - S * 0.75) < 0.003)).toBe(true);
    const arrowStart = head!.arrowPathLocal[0];
    const arrowEnd = head!.arrowPathLocal.at(-1);
    expect(arrowEnd![0]).toBeGreaterThan(arrowStart![0]);
    expect(arrowEnd![1]).toBeLessThan(arrowStart![1]);

    const still = deformByHinge(narrow, head!.hinge, 0, tip);
    const originals = [...still.movingVertexIds].flatMap((index) => {
      const vertex = still.snapshot.vertices[index];
      return vertex ? [vertex] : [];
    });
    expect(originals).toHaveLength(1);
    expect(originals[0]?.[0]).toBeCloseTo(tip![0], 3);
    expect(originals[0]?.[1]).toBeCloseTo(tip![1], 3);
    const folded = deformByHinge(narrow, head!.hinge, -180, tip);
    const landed = [...folded.movingVertexIds].flatMap((index) => {
      const vertex = folded.snapshot.vertices[index];
      return vertex ? [vertex] : [];
    });
    expect(landed[0]?.[0]).toBeGreaterThan(S * 0.25 + 0.015);
    expect(landed[0]?.[1]).toBeLessThan(tip![1] - 0.03);
    expect(folded.snapshot.vertices.some((vertex) => Math.hypot(vertex[0] + S, vertex[1] + S) < 0.004)).toBe(true);
    expect(folded.snapshot.vertices.some((vertex) => Math.hypot(vertex[0] - S * 0.25, vertex[1] + S) < 0.004)).toBe(true);
  });

  it('folds only the bottom corner into the foot', () => {
    const headed = DINOSAUR_RECIPE.snapshots.headed!;
    const foot = DINOSAUR_RECIPE.steps.find((entry) => entry.id === 'dino-foot');
    expect(foot?.fromSnapshotId).toBe('headed');
    expect(foot?.progressStage).toBe(6);
    expect(foot?.title).toBe('Shape the foot');
    expect(foot?.instruction).toBe("Fold the bottom corner to create the dinosaur's foot.");
    const corner = headed.named?.BL ?? [-S, -S, 0];
    const still = deformByHinge(headed, foot!.hinge, 0, corner);
    const originals = [...still.movingVertexIds].flatMap((index) => {
      const vertex = still.snapshot.vertices[index];
      return vertex ? [vertex] : [];
    });
    expect(originals.length).toBeGreaterThan(0);
    for (const vertex of originals) {
      expect(vertex[0]).toBeLessThan(-0.05);
      expect(vertex[1]).toBeLessThan(-0.05);
      expect(Math.hypot(vertex[0] - DINOSAUR_HEAD_TIP[0], vertex[1] - DINOSAUR_HEAD_TIP[1])).toBeGreaterThan(0.05);
    }
    const ends = [foot!.hinge.p0, foot!.hinge.p1];
    expect(ends.some((point) => Math.abs(point[1] + S) < 0.004 && point[0] < -0.05)).toBe(true);
    for (const point of ends) {
      expect(point[0]).toBeLessThan(-0.05);
      expect(point[1]).toBeLessThan(-0.05);
      expect(Math.hypot(point[0] + S, point[1] + S)).toBeLessThan(0.04);
    }
  });

  it('is a valid seven-step recipe and leaves the other animals alone', () => {
    expect(DINOSAUR_PAPER_COLOR).toBe('#FFC547');
    const paper = origamiPaperMaterial(DINOSAUR_PAPER_COLOR);
    expect(paper.backColor).toBe(DINOSAUR_BACK_COLOR.toLowerCase());
    expect(paper.edgeColor).toBe(DINOSAUR_EDGE_COLOR.toLowerCase());
    expect(DINOSAUR_MARK_COLOR).toBe('#D96722');
    expect(validateRecipe(DINOSAUR_RECIPE)).toEqual([]);
    expect(DINOSAUR_STEPS).toEqual([
      'triangle',
      'center-crease',
      'first-section',
      'section-again',
      'head',
      'foot',
      'dinosaur-decoration',
    ]);
    expect(progressFromRecipe(DINOSAUR_RECIPE).totalSteps).toBe(7);
    expect(DINOSAUR_RECIPE.steps).toHaveLength(8);
    expect(DINOSAUR_RECIPE.steps.map((entry) => entry.title)).toEqual([
      'Fold in half',
      'Create a crease and unfold',
      'Create a crease and unfold',
      'Fold the first side inward',
      'Fold the second side inward',
      "Shape the dinosaur's head",
      'Shape the foot',
      'Bring your dinosaur to life',
    ]);
    expect(DINOSAUR_RECIPE.steps.find((entry) => entry.id === 'dino-head')?.instruction).toBe(
      "Fold the top tip outward to create the dinosaur's head.",
    );
    expect(DINOSAUR_RECIPE.steps.find((entry) => entry.id === 'dino-decorate')?.instruction).toBe(
      'Pinch to bring your dinosaur to life!',
    );
    expect(DINOSAUR_RECIPE.steps.filter((entry) => entry.progressStage === 7).map((entry) => entry.id)).toEqual([
      'dino-decorate',
    ]);
    expect(DINOSAUR_RECIPE.steps.some((entry) => entry.rollDirection != null || entry.id.includes('roll') || entry.id.includes('open-fold'))).toBe(false);
    expect(JSON.stringify(DINOSAUR_RECIPE)).not.toContain('rollProgress');
    expect(DINOSAUR_RECIPE.snapshots).not.toHaveProperty('neck');
    expect(DINOSAUR_RECIPE.snapshots).not.toHaveProperty('opened');
    expect(DINOSAUR_RECIPE.steps.find((entry) => entry.progressStage === 2 && entry.actionType === 'unfold')).toBeTruthy();
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

  it('advances all seven stages, then restarts cleanly with no roll state', () => {
    const engine = new OrigamiEngine(DINOSAUR_RECIPE, DINOSAUR_NAMED);
    expect(engine).not.toHaveProperty('rollProgress');
    expect(engine.currentStep?.id).toBe('dino-triangle');
    const stages: number[] = [];
    const ids: string[] = [];
    while (engine.currentStep && stages.length < 16) {
      stages.push(engine.currentStep.progressStage ?? 0);
      ids.push(engine.currentStep.id);
      if (engine.currentStep.progressStage === 2) {
        expect(engine.progress().committedCount).toBe(1);
      }
      commitCurrent(engine);
    }
    expect(engine.isComplete()).toBe(true);
    expect(stages).toEqual([1, 2, 2, 3, 4, 5, 6, 7]);
    expect(ids).toEqual([
      'dino-triangle',
      'dino-center-fold',
      'dino-center-open',
      'dino-section',
      'dino-section-again',
      'dino-head',
      'dino-foot',
      'dino-decorate',
    ]);
    expect(engine.progress().totalSteps).toBe(7);
    engine.reset(DINOSAUR_RECIPE, DINOSAUR_NAMED);
    expect(engine).not.toHaveProperty('rollProgress');
    expect(engine.currentStep?.id).toBe('dino-triangle');
    expect(engine.isComplete()).toBe(false);
    expect(engine.isStepCommitted('dino-head')).toBe(false);
    expect(engine.isStepCommitted('dino-foot')).toBe(false);
    expect(engine.isStepCommitted('dino-decorate')).toBe(false);
    expect(engine.progress()).toMatchObject({ committedCount: 0, totalSteps: 7, activeIndex: 0 });
    expect(engine.fromSnapshot?.named?.TL?.[0]).toBeLessThan(-0.09);
    expect(engine.fromSnapshot?.named?.TR?.[1]).toBeGreaterThan(0.09);
  });

  it('keeps the outer head and neck edges and hides borders under a higher sheet', () => {
    const headed = DINOSAUR_RECIPE.snapshots.headed!;
    const finished = DINOSAUR_RECIPE.snapshots.dinosaur!;
    for (const snapshot of [headed, finished]) {
      const mesh = buildPaperMesh(snapshot, false);
      expect(bordersUnderHigherFace(snapshot, mesh)).toBe(0);
      expect(edgeVerticesNear(mesh, DINOSAUR_HEAD_TIP, 0.012)).toBeGreaterThan(0);
    }
    const top = finished.faces.reduce((max, face) => Math.max(max, face.layer), 0);
    expect(top).toBeGreaterThan(1);
    expect(top).toBeLessThan(16);
    const materials = createPaperMaterials(origamiPaperMaterial(DINOSAUR_PAPER_COLOR));
    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) {
      expect(material.depthTest).toBe(true);
    }
    expect(pointInside(finished, DINOSAUR_EYE[0], DINOSAUR_EYE[1])).toBe(true);
    const creature = new DinosaurCreature();
    creature.start(new Vector3(0, 0, 0));
    const eye = creature.group.getObjectByName('dinosaur-eye');
    const spine = creature.group.getObjectByName('dinosaur-spine');
    expect(eye?.position.x).toBeCloseTo(DINOSAUR_EYE[0], 4);
    expect(eye?.position.y).toBeCloseTo(DINOSAUR_EYE[1], 4);
    expect(spine?.children.length).toBeGreaterThanOrEqual(4);
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
