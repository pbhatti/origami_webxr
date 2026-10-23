import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { idleSnapshot, type InteractionSnapshot } from '../input/HandSession.ts';
import type { AppState } from '../state/AppStateMachine.ts';
import type { SessionDiagnostics } from '../xr/XRSessionManager.ts';
import { CREATURE_SCALE, type PlayScaleDebug } from '../animation/CompletedOrigamiManipulator.ts';
import { PAPER_DEPTH } from '../origami/paperDepth.ts';
import { FOLD_FEEDBACK } from '../feedback/foldFeedback.ts';
import { ARROW_GUIDE, CREASE_GUIDE, FOLD_ASSIST } from '../origami/foldAssist.ts';
import { MENU_DRAG_CONFIG, MENU_DRAG_INSPECTOR } from '../gallery/menuDrag.ts';
import { MOVE_HANDLE_INSPECTOR } from './MoveHandle.ts';
import { STEPPER_INSPECTOR } from './UnifiedFoldingPanel.ts';
import { FOLD_GEOMETRY_INSPECTOR } from '../origami/foldGeometryInspector.ts';
import { BAT_SHAPE_INSPECTOR } from '../origami/batFinalShape.ts';
import { BAT_CUT_INSPECTOR } from '../origami/ScissorsCut.ts';
import { FOX_SHAPE_INSPECTOR } from '../origami/foxFinalShape.ts';
import type { DebugEvent } from '../telemetry/DebugEvents.ts';
import { FONT_MONO, FONT_SANS, getUiOpacity, theme, themeMaterial } from '../theme/tokens.ts';

const _world = new Vector3();
const PANEL_WIDTH = 0.28;
const PANEL_HEIGHT = 1.193;
const CANVAS_W = 768;
const CANVAS_H = 3976;

export interface DebugPanelView {
  appState: AppState;
  diagnostics: SessionDiagnostics | null;
  snapshot: InteractionSnapshot;
  fps: number;
  events: DebugEvent[];
  simulatedHands: boolean;
  fold?: {
    angleDeg: number;
    targetDeg: number;
    errorDeg: number;
    phase: string;
    recipeId?: string;
    stepId?: string;
    panelMode?: string;
    panelSize?: string;
    panelPad?: string;
    panelBounds?: string;
    panelBalanced?: string;
    committed?: number;
    total?: number;
    action?: string;
    holdMs?: number;
    foldPct?: number;
    assistOn?: boolean;
    snapArmed?: boolean;
    hapticAvailable?: boolean;
    feedbackOn?: boolean;
    stage?: number;
    subFold?: string;
    creaseId?: string;
    alignmentMm?: number;
    mismatch?: boolean;
    warning?: string;
    grabRegion?: string;
    movingIds?: string;
    hingeAxis?: string;
    geometryState?: string;
    finalPhase?: string;
    batCommits?: string;
    batValid?: string;
    batPivot?: string;
    sideFolds?: string;
    decorState?: string;
    movingFaces?: number;
    stationaryFaces?: number;
    layerMode?: string;
    layerCount?: number;
    frontFaces?: number;
    backFaces?: number;
    groupFaces?: number;
    ownership?: string;
    earFolds?: Array<{
      stepId: string;
      state: string;
      angleDeg: number;
      visible: boolean;
    }>;
    earState?: string;
    cutState?: string;
    cutProgress?: string;
    cutDone?: string;
    rightFaces?: string;
    rightAxis?: string;
    rightPivot?: string;
    rightProgress?: string;
    rightSnap?: string;
    restart?: {
      sessionId: string;
      count: number;
      meshId: string;
      targetId: string;
      zones: string;
      hands: string;
      interaction: string;
      init: string;
      snap: string;
      error: string;
      valid: string;
    };
    gallery?: {
      state: string;
      hoveredCard: string | null;
      selectedCard: string | null;
      modelsLoaded: number;
      floatsActive: number;
      page: number;
      pageCount: number;
      open: boolean;
      whalePreserved?: boolean;
      activeAnimal?: string | null;
      drawCalls?: number;
      triangles?: number;
      dragEnabled?: boolean;
      dragState?: string;
      dragHand?: string | null;
      position?: [number, number, number];
      handleCollider?: boolean;
      boundingBox?: boolean;
      dragMode?: string;
      rayDistance?: number;
    };
    playScale?: PlayScaleDebug;
  };
}

function line(label: string, value: string): string {
  return `${label.padEnd(14)} ${value}`;
}

function playDistance(view: DebugPanelView): string {
  const flag = CREATURE_SCALE.showHandDistance ? 'show' : 'hide';
  const meters = view.fold?.playScale?.handDistanceM;
  const value = meters == null ? '—' : `${meters.toFixed(3)}m`;
  return `${flag}  ${value}`;
}

function playMultiplier(view: DebugPanelView): string {
  const flag = CREATURE_SCALE.showScaleMultiplier ? 'show' : 'hide';
  const scale = view.fold?.playScale?.scale;
  const value = scale == null ? '—' : `${scale.toFixed(2)}×`;
  return `${flag}  ${value}`;
}

function metersText(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(3)}m`;
}

function handPose(view: PlayScaleDebug | undefined, side: 'left' | 'right'): string {
  if (!view) {
    return '—';
  }
  const tracking = side === 'left' ? view.leftTracking : view.rightTracking;
  const pinching = side === 'left' ? view.leftPinch : view.rightPinch;
  return `${tracking}  ${pinching ? 'pinch' : 'open'}`;
}

function menuPos(position: [number, number, number] | undefined): string {
  if (!position) {
    return '—';
  }
  return position.map((value) => value.toFixed(2)).join(' ');
}

function earEntry(
  folds: Array<{ stepId: string; state: string; angleDeg: number; visible?: boolean }> | undefined,
  match: string,
) {
  return folds?.find((entry) => entry.stepId.includes(match));
}

function earLine(
  folds: Array<{ stepId: string; state: string; angleDeg: number; visible?: boolean }> | undefined,
  match: string,
): string {
  const fold = earEntry(folds, match);
  if (!fold) {
    return '—';
  }
  return `${fold.state} ${fold.visible === false ? 'hide' : 'show'}`;
}

function earAngle(
  folds: Array<{ stepId: string; state: string; angleDeg: number; visible?: boolean }> | undefined,
  match: string,
): string {
  const fold = earEntry(folds, match);
  return fold ? `${fold.angleDeg.toFixed(0)}°` : '—';
}

function earState(
  folds: Array<{ stepId: string; state: string; angleDeg: number; visible?: boolean }> | undefined,
  match: string,
): string {
  const fold = earEntry(folds, match);
  if (!fold) {
    return '—';
  }
  return `${fold.state}${fold.visible === false ? ' locked' : ''}`;
}

function roundPanel(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number): void {
  ctx.clearRect(0, 0, width, height);
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(width, 0, width, height, r);
  ctx.arcTo(width, height, 0, height, r);
  ctx.arcTo(0, height, 0, 0, r);
  ctx.arcTo(0, 0, width, 0, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(247, 243, 239, 0.96)';
  ctx.fill();
  ctx.strokeStyle = theme.colors.border;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function draw(view: DebugPanelView): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  roundPanel(ctx, CANVAS_W, CANVAS_H, 36);
  ctx.fillStyle = theme.colors.textPrimary;
  ctx.font = `500 34px ${FONT_SANS}`;
  ctx.fillText('Fold & Play debug', 28, 52);

  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillStyle = theme.colors.textSecondary;
  const left = view.snapshot.left;
  const right = view.snapshot.right;
  const rows = [
    line('state', view.appState),
    line('2h scale', CREATURE_SCALE.enabled ? 'on' : 'off'),
    line('pinch pts', CREATURE_SCALE.showPinchPoints ? 'show' : 'hide'),
    line('hand dist', playDistance(view)),
    line('scale x', playMultiplier(view)),
    line('scale min', CREATURE_SCALE.minScale.toFixed(2)),
    line('scale max', CREATURE_SCALE.maxScale.toFixed(2)),
    line('play state', view.fold?.playScale?.state ?? '—'),
    '3D Manipulation',
    line('3d L', handPose(view.fold?.playScale, 'left')),
    line('3d R', handPose(view.fold?.playScale, 'right')),
    line('3d pos', menuPos(view.fold?.playScale?.position)),
    line('3d rot', menuPos(view.fold?.playScale?.rotationDeg)),
    line('3d scale', view.fold?.playScale ? `${view.fold.playScale.scale.toFixed(2)}×` : '—'),
    line('span0', metersText(view.fold?.playScale?.initialHandDistanceM)),
    line('span', metersText(view.fold?.playScale?.handDistanceM)),
    line('3d root', view.fold?.playScale?.root ?? '—'),
    line('paper n', view.fold?.playScale ? String(view.fold.playScale.layerCount) : '—'),
    line('contact', `${PAPER_DEPTH.shadows ? 'on' : 'off'}  $`),
    line('bounds', `${PAPER_DEPTH.showLayerBounds ? 'show' : 'hide'}  !`),
    line('creases', `${PAPER_DEPTH.showCreaseAxes ? 'show' : 'hide'}  @`),
    line('pivot', `${PAPER_DEPTH.showPivot ? 'show' : 'hide'}  #`),
    line('2h xform', `${PAPER_DEPTH.twoHand ? 'on' : 'off'}  %`),
    line('lost', view.fold?.playScale?.trackingLost ? 'yes' : 'no'),
    line('fps', view.fps.toFixed(0)),
    line('ref', view.diagnostics?.referenceSpace ?? 'none'),
    line('hands feat', String(view.diagnostics?.handTracking ?? 'n/a')),
    line('L track', `${left.sample.tracked} ${left.sample.source ?? '—'} ${left.pinch}`),
    line('L pinch mm', left.sample.pinchDistanceM == null ? '—' : (left.sample.pinchDistanceM * 1000).toFixed(1)),
    line('L region', left.region),
    line('R track', `${right.sample.tracked} ${right.sample.source ?? '—'} ${right.pinch}`),
    line('R pinch mm', right.sample.pinchDistanceM == null ? '—' : (right.sample.pinchDistanceM * 1000).toFixed(1)),
    line('R region', right.region),
    line('owner', `fold=${view.snapshot.foldOwner ?? '—'} hold=${view.snapshot.holdOwner ?? '—'} move=${view.snapshot.moveOwner ?? '—'}`),
    line('recipe', view.fold?.recipeId ?? '—'),
    line('stage', view.fold?.stage != null ? String(view.fold.stage) : '—'),
    line('subfold', view.fold?.subFold ?? '—'),
    line('mode', view.snapshot.paperMoving ? 'Move' : view.fold?.phase === 'folding' ? 'Fold' : 'Idle'),
    line('crease', view.fold?.creaseId ?? '—'),
    line('axis mm', view.fold?.alignmentMm != null ? view.fold.alignmentMm.toFixed(2) : '—'),
    line('axis ok', view.fold?.mismatch ? 'MISMATCH' : 'aligned'),
    line('hinge', 'cyan axis'),
    line('guide', 'yellow crease'),
    line('moving', view.fold?.movingFaces != null ? `${view.fold.movingFaces} green` : '—'),
    line('still', view.fold?.stationaryFaces != null ? `${view.fold.stationaryFaces} grey` : '—'),
    line('l mode', view.fold?.layerMode ?? '—'),
    line('layers', view.fold?.layerCount != null ? String(view.fold.layerCount) : '—'),
    line('front', view.fold?.frontFaces != null ? `${view.fold.frontFaces} green` : '—'),
    line('back', view.fold?.backFaces != null ? `${view.fold.backFaces} blue` : '—'),
    line('group', view.fold?.groupFaces != null ? `${view.fold.groupFaces} faces` : '—'),
    line('own', view.fold?.ownership ?? '—'),
    line('insp', 'Z front  X back  Q group'),
    line('L crease', `${FOLD_GEOMETRY_INSPECTOR.leftEarCrease ? 'show' : 'hide'}  E  ${earLine(view.fold?.earFolds, 'ear-left')}`),
    line('R crease', `${FOLD_GEOMETRY_INSPECTOR.rightEarCrease ? 'show' : 'hide'}  R  ${earLine(view.fold?.earFolds, 'ear-right')}`),
    line('L region', FOLD_GEOMETRY_INSPECTOR.leftFoldRegion ? 'show  W' : 'hide  W'),
    line('R region', FOLD_GEOMETRY_INSPECTOR.rightFoldRegion ? 'show  S' : 'hide  S'),
    line('hinge axes', FOLD_GEOMETRY_INSPECTOR.hingeAxis ? 'show  K' : 'hide  K'),
    line('fox geo', `${FOX_SHAPE_INSPECTOR.enabled ? 'on' : 'off'}  shift+F`),
    line('fox ids', `${FOX_SHAPE_INSPECTOR.faceIds ? 'show' : 'hide'}  /`),
    line('fox L/R', `${FOX_SHAPE_INSPECTOR.highlightLowerLeft ? 'L' : '-'}${FOX_SHAPE_INSPECTOR.highlightLowerRight ? 'R' : '-'}`),
    line('fox groups', `${FOX_SHAPE_INSPECTOR.stationaryGroups ? 'still' : '-'} ${FOX_SHAPE_INSPECTOR.movingEarGroups ? 'ear' : '-'}`),
    line('fox nrm', `${FOX_SHAPE_INSPECTOR.triangleNormals ? 'show' : 'hide'}  ?`),
    line('fox cull', FOX_SHAPE_INSPECTOR.disableBackfaceCulling ? 'off  \\' : 'on  \\'),
    line('fox wire', `${FOX_SHAPE_INSPECTOR.wireframe ? 'on' : 'off'}  '`),
    line('fox expect', FOX_SHAPE_INSPECTOR.expectedSilhouette ? 'silhouette on' : 'silhouette off'),
    line('bat step', view.fold?.recipeId === 'origami-bat' ? `${view.fold.stage ?? '—'}/7  ${view.fold.stepId ?? '—'}` : '—'),
    line('bat ids', view.fold?.recipeId === 'origami-bat' ? view.fold.movingIds ?? '—' : '—'),
    line('bat hinge', view.fold?.recipeId === 'origami-bat' ? view.fold.hingeAxis ?? '—' : '—'),
    line('bat angle', view.fold?.recipeId === 'origami-bat' ? `${view.fold.angleDeg?.toFixed(0)}/${view.fold.targetDeg?.toFixed(0)}` : '—'),
    line('bat snap', view.fold?.recipeId === 'origami-bat' ? `${view.fold.phase} ${((view.fold.foldPct ?? 0) * 100).toFixed(0)}%` : '—'),
    line('bat geo', view.fold?.recipeId === 'origami-bat' ? view.fold.geometryState ?? '—' : '—'),
    line('bat phase', view.fold?.recipeId === 'origami-bat' ? view.fold.finalPhase ?? '—' : '—'),
    line('bat pivot', view.fold?.recipeId === 'origami-bat' ? view.fold.batPivot ?? '—' : '—'),
    line('bat commits', view.fold?.recipeId === 'origami-bat' ? view.fold.batCommits ?? '—' : '—'),
    line('bat valid', view.fold?.recipeId === 'origami-bat' ? view.fold.batValid ?? '—' : '—'),
    line('bat jump', 'alt+1..7'),
    line('owl step', view.fold?.recipeId === 'origami-owl' ? `${view.fold.stage ?? '—'}/5  ${view.fold.stepId ?? '—'}` : '—'),
    line('owl crease', view.fold?.recipeId === 'origami-owl' ? view.fold.creaseId ?? '—' : '—'),
    line('owl ids', view.fold?.recipeId === 'origami-owl' ? view.fold.movingIds ?? '—' : '—'),
    line('owl angle', view.fold?.recipeId === 'origami-owl' ? `${view.fold.angleDeg?.toFixed(0)}/${view.fold.targetDeg?.toFixed(0)}` : '—'),
    line('owl snap', view.fold?.recipeId === 'origami-owl' ? `${((view.fold.foldPct ?? 0) * 100).toFixed(0)}%` : '—'),
    line('owl layers', view.fold?.recipeId === 'origami-owl' ? String(view.fold.layerCount ?? '—') : '—'),
    line('owl sides', view.fold?.recipeId === 'origami-owl' ? view.fold.sideFolds ?? '—' : '—'),
    line('owl decor', view.fold?.recipeId === 'origami-owl' ? view.fold.decorState ?? '—' : '—'),
    line('owl jump', 'alt+1..5'),
    line('bat insp', `${BAT_SHAPE_INSPECTOR.enabled ? 'on' : 'off'}  shift+B`),
    line('cut path', `${BAT_CUT_INSPECTOR.path ? 'show' : 'hide'}  shift+C`),
    line('cut col', BAT_CUT_INSPECTOR.collider ? 'show' : 'hide'),
    line('cut geo', BAT_CUT_INSPECTOR.geometry ? 'show' : 'hide'),
    line('cut layer', BAT_CUT_INSPECTOR.layers ? 'show' : 'hide'),
    line('cut state', view.fold?.cutState ?? '—'),
    line('cut prog', view.fold?.cutProgress ?? '—'),
    line('cut done', view.fold?.cutDone ?? '—'),
    line('cut jump', 'shift+7 notch'),
    line('L ear °', earAngle(view.fold?.earFolds, 'ear-left')),
    line('R ear °', earAngle(view.fold?.earFolds, 'ear-right')),
    line('L ear', earState(view.fold?.earFolds, 'ear-left')),
    line('R ear', earState(view.fold?.earFolds, 'ear-right')),
    line('ears', view.fold?.earState ?? '—'),
    line('R ray', view.snapshot.hitRegionId ?? 'miss'),
    line('R faces', view.fold?.rightFaces ?? '—'),
    line('R axis', view.fold?.rightAxis ?? '—'),
    line('R pivot', view.fold?.rightPivot ?? '—'),
    line('R prog', view.fold?.rightProgress ?? '—'),
    line('R snap', view.fold?.rightSnap ?? '—'),
    line('gallery', view.fold?.gallery?.state ?? '—'),
    line('g open', view.fold?.gallery?.open ? 'yes' : 'no'),
    line('g hover', view.fold?.gallery?.hoveredCard ?? '—'),
    line('g select', view.fold?.gallery?.selectedCard ?? '—'),
    line('g models', view.fold?.gallery?.modelsLoaded != null ? String(view.fold.gallery.modelsLoaded) : '—'),
    line('g floats', view.fold?.gallery?.floatsActive != null ? String(view.fold.gallery.floatsActive) : '—'),
    line('g page', view.fold?.gallery ? `${view.fold.gallery.page}/${view.fold.gallery.pageCount}` : '—'),
    line('g keep', view.fold?.gallery?.activeAnimal ?? (view.fold?.gallery?.whalePreserved ? 'session' : 'none')),
    line('draws', view.fold?.gallery?.drawCalls != null ? String(view.fold.gallery.drawCalls) : '—'),
    line('tris', view.fold?.gallery?.triangles != null ? String(view.fold.gallery.triangles) : '—'),
    line('menu drag', `${MENU_DRAG_CONFIG.enabled ? 'on' : 'off'}  O`),
    line('m handle', `${MENU_DRAG_INSPECTOR.handleCollider ? 'show' : 'hide'}  F`),
    line('m bounds', `${MENU_DRAG_INSPECTOR.boundingBox ? 'show' : 'hide'}  ;`),
    line('m ray', `${MENU_DRAG_INSPECTOR.handRay ? 'show' : 'hide'}  :`),
    line('m hit', `${MENU_DRAG_INSPECTOR.rayHit ? 'show' : 'hide'}  shift+O`),
    line('m mode', view.fold?.gallery?.dragMode ?? view.snapshot.menuDragMode),
    line('m hand', view.fold?.gallery?.dragHand ?? view.snapshot.menuOwner ?? '—'),
    line('m dist', view.fold?.gallery?.rayDistance ? view.fold.gallery.rayDistance.toFixed(2) : '—'),
    line('m pos', menuPos(view.fold?.gallery?.position)),
    line('m state', view.fold?.gallery?.dragState ?? (view.snapshot.menuDragging ? 'dragging' : 'idle')),
    line('m keys', 'L recenter  shift+L reset'),
    line('g keys', 'G menu  shift+P float  shift+K hit'),
    line('assist', `${FOLD_ASSIST.enabled ? 'on' : 'off'} ${view.fold?.snapArmed ? 'armed' : ''}`),
    line('act %', `${(FOLD_ASSIST.activationThreshold * 100).toFixed(0)}  keys 1/2`),
    line('snap %', `${(FOLD_ASSIST.autoSnapThreshold * 100).toFixed(0)}  keys 3/4`),
    line('snap ms', `${FOLD_ASSIST.snapDurationMs.toFixed(0)}  keys 5/6`),
    line('fold %', view.fold?.foldPct != null ? `${(view.fold.foldPct * 100).toFixed(0)}` : '—'),
    line('crease', `${CREASE_GUIDE.visible ? 'on' : 'off'} ${(CREASE_GUIDE.widthM * 1000).toFixed(1)}mm C 7/8`),
    line('dash mm', `${(CREASE_GUIDE.dashM * 1000).toFixed(0)}/${(CREASE_GUIDE.gapM * 1000).toFixed(0)}  9/0 -/=`),
    line('arrow', `${ARROW_GUIDE.visible ? 'on' : 'off'} ${ARROW_GUIDE.animate ? 'anim' : 'still'} V/B`),
    line('arr spd', `${ARROW_GUIDE.cycleSec.toFixed(2)}s  [/]`),
    line('arr dist', `${(ARROW_GUIDE.travel * 100).toFixed(0)}%  ,/.`),
    line('fold keys', 'M assist  A complete'),
    line('feedback', `${FOLD_FEEDBACK.enabled ? 'on' : 'off'}  H  test T`),
    line('fb vol', `${FOLD_FEEDBACK.volume.toFixed(2)}  U/I`),
    line('fb glow', `${FOLD_FEEDBACK.highlight ? 'on' : 'off'}  Y`),
    line('fb settle', `${FOLD_FEEDBACK.settle ? 'on' : 'off'}  N`),
    line('haptics', `${FOLD_FEEDBACK.haptics ? 'on' : 'off'}  J`),
    line('actuator', view.fold?.hapticAvailable ? 'controller yes' : 'none (hands/audio)'),
    line('fb skip', FOLD_FEEDBACK.debugAssist ? 'debug assist on' : 'skip A-key'),
    line('grab', view.fold?.grabRegion ?? '—'),
    line('warn', view.fold?.warning ?? '—'),
    line('step', `${view.fold?.stepId ?? '—'} ${view.fold?.committed ?? 0}/${view.fold?.total ?? 0}`),
    line('step link', `${STEPPER_INSPECTOR.connectorBounds ? 'bounds' : 'hide'}  <`),
    line('step fill', `${STEPPER_INSPECTOR.connectorState ? 'state' : 'hide'}  >`),
    line('move col', `${MOVE_HANDLE_INSPECTOR.collider ? 'show' : 'hide'}  shift+M`),
    line('move box', `${MOVE_HANDLE_INSPECTOR.meshBounds ? 'show' : 'hide'}  shift+B`),
    line('move lay', `${MOVE_HANDLE_INSPECTOR.interactionLayer ? 'show' : 'hide'}  shift+Y`),
    line('panel', view.fold?.panelMode ?? '—'),
    line('panel m', view.fold?.panelSize ?? '—'),
    line('panel pad', view.fold?.panelPad ?? '—'),
    line('panel box', view.fold?.panelBounds ?? '—'),
    line('pad ok', view.fold?.panelBalanced ?? '—'),
    line('action', view.fold?.action ?? '—'),
    line('hold ms', view.fold?.holdMs != null ? view.fold.holdMs.toFixed(0) : '—'),
    line('angle', view.fold ? `${view.fold.angleDeg.toFixed(0)}→${view.fold.targetDeg}` : '—'),
    line('err deg', view.fold ? view.fold.errorDeg.toFixed(1) : '—'),
    line('fold phase', view.fold?.phase ?? '—'),
    line('session', `${view.fold?.restart?.sessionId ?? '—'}  #${view.fold?.restart?.count ?? 0}`),
    line('mesh', view.fold?.restart?.meshId ?? '—'),
    line('target', view.fold?.restart?.targetId ?? '—'),
    line('zones', view.fold?.restart?.zones ?? '—'),
    line('xr hands', view.fold?.restart?.hands ?? '—'),
    line('interact', view.fold?.restart?.interaction ?? '—'),
    line('fold init', view.fold?.restart?.init ?? '—'),
    line('mag snap', view.fold?.restart?.snap ?? '—'),
    line('rst err', view.fold?.restart?.error ?? '—'),
    line('validate', `${view.fold?.restart?.valid ?? '—'}  shift+V`),
    line('pinches', `L${view.snapshot.pinchCounts.left} R${view.snapshot.pinchCounts.right}`),
    line('ui opacity', `${(getUiOpacity() * 100).toFixed(0)}%  ( / )`),
    line('sim hands', view.simulatedHands ? 'on' : 'off'),
    line('events', view.events.at(-1)?.name ?? '—'),
  ];
  rows.forEach((row, index) => {
    ctx.fillText(row, 28, 88 + index * 24);
  });
  return canvas;
}

export class DebugPanel {
  readonly group = new Group();
  readonly grabBar: Mesh;
  readonly testPad: Mesh;
  private readonly body: Mesh;
  private texture: CanvasTexture;
  private lastPaint = 0;
  private dragged = false;
  private readonly dragLast = new Vector3();

  constructor() {
    this.group.name = 'fold-fly-debug-panel';
    this.texture = this.makeTexture(draw({
      appState: 'BOOT',
      diagnostics: null,
      snapshot: idleSnapshot(),
      fps: 0,
      events: [],
      simulatedHands: false,
    }));
    this.body = new Mesh(
      new PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT),
      themeMaterial(this.texture),
    );
    this.body.position.y = -0.02;
    this.grabBar = new Mesh(
      new PlaneGeometry(PANEL_WIDTH * 0.46, 0.018),
      new MeshBasicMaterial({ color: theme.colors.dark }),
    );
    this.grabBar.position.y = PANEL_HEIGHT / 2 + 0.002;
    this.grabBar.userData.foldFlyPanelGrab = true;
    this.testPad = new Mesh(
      new PlaneGeometry(PANEL_WIDTH * 0.86, 0.034),
      new MeshBasicMaterial({ color: theme.colors.accent }),
    );
    this.testPad.position.y = -PANEL_HEIGHT / 2 + 0.01;
    this.testPad.userData.foldFlyFeedbackTest = true;
    this.group.add(this.grabBar, this.body, this.testPad);
    this.group.visible = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  isUserDragged(): boolean {
    return this.dragged;
  }

  placeDefault(worldPoint: Vector3): void {
    if (this.dragged) {
      return;
    }
    this.group.position.copy(worldPoint);
  }

  containsGrabBar(worldPoint: Vector3, radiusM = 0.04): boolean {
    this.grabBar.getWorldPosition(_world);
    return _world.distanceTo(worldPoint) <= radiusM;
  }

  containsTestPad(worldPoint: Vector3, radiusM = 0.045): boolean {
    this.testPad.getWorldPosition(_world);
    return _world.distanceTo(worldPoint) <= radiusM;
  }

  beginDrag(worldPoint: Vector3): void {
    this.dragged = true;
    this.dragLast.copy(worldPoint);
  }

  dragTo(worldPoint: Vector3): void {
    if (!this.dragged) {
      this.beginDrag(worldPoint);
    }
    this.group.position.x += worldPoint.x - this.dragLast.x;
    this.group.position.y += worldPoint.y - this.dragLast.y;
    this.group.position.z += worldPoint.z - this.dragLast.z;
    this.dragLast.copy(worldPoint);
  }

  endDrag(): void {
    this.dragLast.set(0, 0, 0);
  }

  resetPlacement(): void {
    this.dragged = false;
  }

  paint(view: DebugPanelView, nowMs: number): void {
    if (!this.group.visible || nowMs - this.lastPaint < 180) {
      return;
    }
    this.lastPaint = nowMs;
    this.texture.dispose();
    this.texture = this.makeTexture(draw(view));
    const material = this.body.material as MeshBasicMaterial;
    material.map = this.texture;
    material.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.group.removeFromParent();
  }

  private makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    return texture;
  }
}
