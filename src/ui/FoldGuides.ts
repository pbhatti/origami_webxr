import {
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { stepCreaseLine } from '../origami/creaseMath.ts';
import { ARROW_GUIDE, CREASE_GUIDE } from '../origami/foldAssist.ts';
import { FOLD_GEOMETRY_INSPECTOR } from '../origami/foldGeometryInspector.ts';
import { PAPER_SIZE_M } from '../origami/placement.ts';
import { stepActionType, type FoldStep, type MeshSnapshot, type RecipeCrease, type Vec3 } from '../origami/types.ts';
import { dashedRibbonMesh, pointOnPolyline } from './creaseRibbon.ts';

export interface FoldGuideTickState {
  folding: boolean;
  snapping: boolean;
  complete: boolean;
  activeStepId?: string | null;
}

interface GuideLane {
  stepId: string;
  crease: Mesh;
  arrow: Mesh;
  head: Mesh;
  path: Vec3[];
  phase: number;
  fade: number;
  completed: boolean;
  press: boolean;
}

function ribbonOpacity(mesh: Mesh, opacity: number): void {
  const material = mesh.material as MeshBasicMaterial;
  material.opacity = opacity;
}

function creaseKey(a: Vec3, b: Vec3): string {
  return `${a.join(',')}|${b.join(',')}`;
}

export class FoldGuides {
  readonly group = new Group();
  private readonly lanesRoot = new Group();
  private readonly arrowHeads = new Group();
  private readonly history = new Group();
  private readonly extras = new Group();
  private ghost: Mesh;
  private lanes: GuideLane[] = [];
  private steps: FoldStep[] = [];
  private toSnapshot: MeshSnapshot | null = null;
  private appearance = '';
  private activeStepId: string | null = null;

  constructor() {
    this.group.name = 'fold-fly-guides';
    this.history.name = 'locked-creases';
    this.extras.name = 'coupled-creases';
    this.lanesRoot.name = 'fold-lanes';
    this.ghost = this.makeGhost(null);
    this.group.add(this.lanesRoot, this.arrowHeads, this.ghost, this.history, this.extras);
  }

  setStep(
    step: FoldStep | null,
    toSnapshot?: MeshSnapshot | null,
    siblings?: FoldStep[],
    completedIds?: Iterable<string>,
  ): void {
    this.toSnapshot = toSnapshot ?? null;
    this.activeStepId = step?.id ?? null;
    const previous = new Map(this.lanes.map((lane) => [lane.stepId, lane]));
    const completed = new Set(completedIds ?? []);
    this.steps = siblings && siblings.length > 0 ? siblings : step ? [step] : [];
    this.rebuildLanes(previous, completed);
    this.group.visible = this.steps.length > 0;
    this.rebuildExtras(this.steps);
    this.group.remove(this.ghost);
    this.ghost.geometry.dispose();
    this.ghost = this.makeGhost(this.toSnapshot);
    this.group.add(this.ghost);
  }

  setLockedCreases(creases: RecipeCrease[]): void {
    this.clearGroup(this.history);
    for (const crease of creases) {
      this.history.add(this.makeCreaseRibbon([crease.p0, crease.p1], 0.42));
    }
  }

  tick(dtSec: number, state: FoldGuideTickState | boolean): void {
    if (!this.group.visible) {
      return;
    }
    const tickState: FoldGuideTickState =
      typeof state === 'boolean' ? { folding: state, snapping: false, complete: false } : state;
    const nextAppearance = this.appearanceKey();
    if (nextAppearance !== this.appearance) {
      const previous = new Map(this.lanes.map((lane) => [lane.stepId, lane]));
      this.rebuildLanes(previous);
    }

    for (const [index, lane] of this.lanes.entries()) {
      const isActive = lane.stepId === (tickState.activeStepId ?? this.activeStepId);
      const folding = Boolean(tickState.folding && isActive);
      const snapping = Boolean(tickState.snapping && isActive);
      if (lane.completed || tickState.complete) {
        lane.fade = Math.max(0, lane.fade - dtSec * 2.4);
      } else {
        lane.fade = 1;
      }
      const idle = !folding && !snapping && !lane.completed && !tickState.complete;
      if (idle && ARROW_GUIDE.animate) {
        lane.phase += dtSec;
      }
      const showCrease = this.creaseVisible(lane.stepId) && CREASE_GUIDE.visible && !lane.press && lane.fade > 0.02;
      ribbonOpacity(lane.crease, (folding ? 0.55 : 0.95) * lane.fade);
      lane.crease.visible = showCrease;
      const arrowOpacity = (snapping ? 0.2 : folding ? 0.28 : 0.9) * lane.fade;
      const showArrow =
        ARROW_GUIDE.visible && arrowOpacity > 0.02 && lane.path.length > 1 && !lane.press && !lane.completed;
      lane.arrow.visible = showArrow;
      lane.head.visible = showArrow;
      ribbonOpacity(lane.arrow, arrowOpacity);
      (lane.head.material as MeshBasicMaterial).opacity = arrowOpacity;
      this.placeArrowHead(lane, folding, snapping, index);
    }
    this.extras.visible = CREASE_GUIDE.visible;
    this.history.visible = CREASE_GUIDE.visible;
    this.ghost.visible = !tickState.folding && !tickState.snapping && !tickState.complete;
  }

  hide(): void {
    this.group.visible = false;
  }

  show(): void {
    this.group.visible = this.lanes.length > 0;
  }

  private creaseVisible(stepId: string): boolean {
    if (stepId.includes('ear-left')) {
      return FOLD_GEOMETRY_INSPECTOR.leftEarCrease;
    }
    if (stepId.includes('ear-right')) {
      return FOLD_GEOMETRY_INSPECTOR.rightEarCrease;
    }
    return true;
  }

  private rebuildLanes(previous: Map<string, GuideLane>, completedIds?: Set<string>): void {
    this.appearance = this.appearanceKey();
    this.clearLanes();
    this.steps.forEach((step, index) => {
      const [c0, c1] = stepCreaseLine(step);
      const crease = this.makeCreaseRibbon([c0, c1], 0.95);
      const path = (step.arrowPathLocal ?? []).map((point) => [...point] as Vec3);
      const arrow = this.makeArrowRibbon(path.length > 1 ? path : [[0, 0, 0.002], [0, 0.02, 0.002]]);
      const head = this.makeArrowHead();
      const prior = previous.get(step.id);
      const completed = completedIds ? completedIds.has(step.id) : Boolean(prior?.completed);
      this.lanesRoot.add(crease, arrow);
      this.arrowHeads.add(head);
      this.lanes.push({
        stepId: step.id,
        crease,
        arrow,
        head,
        path,
        phase: completedIds && !completed ? index * 0.55 : (prior?.phase ?? index * 0.55),
        fade: completed ? (prior?.fade ?? 1) : 1,
        completed,
        press: stepActionType(step) === 'crease-press',
      });
    });
  }

  private rebuildExtras(steps: FoldStep[]): void {
    this.clearGroup(this.extras);
    const laneKeys = new Set(
      steps.map((step) => {
        const [a, b] = stepCreaseLine(step);
        return creaseKey(a, b);
      }),
    );
    const seen = new Set<string>(laneKeys);
    for (const step of steps) {
      const extras = [
        ...(step.extraCreaseLines ?? []),
        ...(step.coupledHinges ?? []).map((hinge) => [hinge.p0, hinge.p1] as [Vec3, Vec3]),
      ];
      for (const [a, b] of extras) {
        const key = creaseKey(a, b);
        const swapped = creaseKey(b, a);
        if (seen.has(key) || seen.has(swapped)) {
          continue;
        }
        seen.add(key);
        this.extras.add(this.makeCreaseRibbon([a, b], 0.62));
      }
    }
  }

  private placeArrowHead(lane: GuideLane, folding: boolean, snapping: boolean, index: number): void {
    if (lane.path.length < 2) {
      return;
    }
    const travel = Math.min(Math.max(ARROW_GUIDE.travel, 0.08), 0.12);
    let along = 1;
    if (!folding && !snapping && !lane.completed && ARROW_GUIDE.animate) {
      const cycle = Math.max(ARROW_GUIDE.cycleSec, 0.4);
      const u = ((lane.phase + index * 0.35) % cycle) / cycle;
      const ping = u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2;
      const eased = ping * ping * (3 - 2 * ping);
      along = 1 - travel + eased * travel;
    } else if (!snapping && !lane.completed) {
      along = 1 - travel * 0.25;
    }
    const sample = pointOnPolyline(lane.path, along);
    lane.head.position.copy(sample.position);
    lane.head.position.z += CREASE_GUIDE.liftM + 0.0004;
    if (sample.tangent.lengthSq() > 1e-8) {
      lane.head.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), sample.tangent.normalize());
    }
  }

  private makeCreaseRibbon(points: Vec3[], opacity: number): Mesh {
    return dashedRibbonMesh(points, CREASE_GUIDE.color, opacity, CREASE_GUIDE.widthM, CREASE_GUIDE.dashM, CREASE_GUIDE.gapM);
  }

  private makeArrowRibbon(points: Vec3[]): Mesh {
    return dashedRibbonMesh(points, ARROW_GUIDE.color, 0.9, ARROW_GUIDE.widthM, 0.012, 0.008);
  }

  private makeArrowHead(): Mesh {
    const head = new Mesh(
      new ConeGeometry(0.009, 0.02, 8),
      new MeshBasicMaterial({ color: ARROW_GUIDE.color, transparent: true, opacity: 0.92, depthWrite: false }),
    );
    head.renderOrder = 8;
    return head;
  }

  private appearanceKey(): string {
    return [
      CREASE_GUIDE.visible,
      CREASE_GUIDE.color,
      CREASE_GUIDE.widthM,
      CREASE_GUIDE.dashM,
      CREASE_GUIDE.gapM,
      ARROW_GUIDE.visible,
      ARROW_GUIDE.animate,
      ARROW_GUIDE.color,
      ARROW_GUIDE.widthM,
      ARROW_GUIDE.cycleSec,
      ARROW_GUIDE.travel,
    ].join('|');
  }

  private clearLanes(): void {
    this.lanes.forEach((lane) => {
      this.disposeMesh(lane.crease);
      this.disposeMesh(lane.arrow);
      this.disposeMesh(lane.head);
    });
    this.lanes = [];
  }

  private disposeMesh(mesh: Mesh): void {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }

  private clearGroup(group: Group): void {
    [...group.children].forEach((child) => {
      group.remove(child);
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as MeshBasicMaterial).dispose();
      }
    });
  }

  private makeGhost(snapshot: MeshSnapshot | null): Mesh {
    const shape = new Shape();
    const pts = snapshot?.outline ?? snapshot?.vertices.slice(0, 4) ?? [
      [-PAPER_SIZE_M / 4, -PAPER_SIZE_M / 2],
      [PAPER_SIZE_M / 4, -PAPER_SIZE_M / 2],
      [PAPER_SIZE_M / 4, PAPER_SIZE_M / 2],
      [-PAPER_SIZE_M / 4, PAPER_SIZE_M / 2],
    ];
    const first = pts[0];
    if (first) {
      shape.moveTo(first[0], first[1]);
      pts.slice(1).forEach((p) => shape.lineTo(p[0], p[1]));
      shape.closePath();
    }
    return new Mesh(
      new ShapeGeometry(shape),
      new MeshBasicMaterial({
        color: '#ffe7c2',
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
  }
}
