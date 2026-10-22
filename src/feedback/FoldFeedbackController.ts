import {
  AudioListener,
  Group,
  PositionalAudio,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  type Object3D,
} from 'three';
import { dashedRibbonMesh, setRibbonPoints } from '../ui/creaseRibbon.ts';
import { mid, stepCreaseLine } from '../origami/creaseMath.ts';
import type { FoldStep, Vec3 } from '../origami/types.ts';
import {
  FOLD_FEEDBACK,
  foldFeedbackBus,
  shouldPlayFeedback,
  type FoldFeedbackName,
  type FoldFeedbackPayload,
} from './foldFeedback.ts';
import { listHapticTargets, pulseControllerHaptics } from './hapticActuators.ts';

const ATTRACT_MS = 220;
const CLICK_MS = 70;
const HIGHLIGHT_PULL_MS = 280;
const HIGHLIGHT_LOCK_MS = 220;

export interface FoldFeedbackHost {
  paperRoot: Group;
  sheet: Object3D;
  paperMeshMaterial: MeshStandardMaterial;
  getCamera: () => PerspectiveCamera | null;
  getCurrentStep: () => FoldStep | null;
  getInputSources: () => XRInputSource[];
}

function fillNoise(data: Float32Array, from: number, to: number, amplitude: number): void {
  for (let i = from; i < to; i += 1) {
    data[i] = ((data[i] ?? 0) + (Math.random() * 2 - 1) * amplitude);
  }
}

function fillTone(data: Float32Array, sampleRate: number, freq: number, amplitude: number): void {
  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    const env = Math.sin((i / Math.max(data.length - 1, 1)) * Math.PI);
    data[i] = (data[i] ?? 0) + Math.sin(Math.PI * 2 * freq * t) * amplitude * env;
  }
}

export class FoldFeedbackController {
  readonly group = new Group();
  hapticAvailable = false;
  private readonly highlight: Mesh;
  private readonly host: FoldFeedbackHost;
  private unsubscribe: (() => void) | null = null;
  private listener: AudioListener | null = null;
  private attract: PositionalAudio | null = null;
  private click: PositionalAudio | null = null;
  private sources: XRInputSource[] = [];
  private highlightUntil = 0;
  private settleUntil = 0;
  private settleStarted = 0;
  private glow = 0;
  private lastStartKey = '';
  private lastCompleteKey = '';
  private audioReady = false;

  constructor(host: FoldFeedbackHost) {
    this.host = host;
    this.group.name = 'fold-fly-snap-feedback';
    this.highlight = dashedRibbonMesh(
      [
        [0, -0.04, 0],
        [0, 0.04, 0],
      ],
      '#f2d7a4',
      0,
      0.0055,
      0.007,
      0.003,
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 9;
    this.group.add(this.highlight);
    host.paperRoot.add(this.group);
    this.unsubscribe = foldFeedbackBus.on((name, payload) => this.handle(name, payload));
  }

  setInputSources(sources: XRInputSource[]): void {
    this.sources = sources;
    this.hapticAvailable = listHapticTargets(sources).length > 0;
  }

  reset(): void {
    this.lastStartKey = '';
    this.lastCompleteKey = '';
    this.cancelVisuals();
  }

  playTest(step = this.host.getCurrentStep()): void {
    const crease = step ? stepCreaseLine(step) : ([[-0.05, 0, 0], [0.05, 0, 0]] as [Vec3, Vec3]);
    const payload: FoldFeedbackPayload = {
      recipeId: 'debug',
      stepId: step?.id ?? 'test',
      crease,
      assist: false,
    };
    this.lastStartKey = '';
    this.lastCompleteKey = '';
    this.onSnapStart(payload);
    window.setTimeout(() => {
      this.lastCompleteKey = '';
      this.onSnapComplete(payload);
    }, 180);
  }

  tick(dtMs: number, nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()): void {
    this.syncListener();
    this.updateHighlight(nowMs);
    this.updateSettle(nowMs);
    if (this.glow > 0) {
      this.glow = Math.max(0, this.glow - dtMs / 420);
      this.host.paperMeshMaterial.emissiveIntensity = this.glow;
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    this.attract?.disconnect();
    this.click?.disconnect();
    this.group.removeFromParent();
  }

  private handle(name: FoldFeedbackName, payload: FoldFeedbackPayload): void {
    if (name === 'fold:snap-cancelled') {
      this.cancelVisuals();
      return;
    }
    if (!shouldPlayFeedback(name, payload)) {
      return;
    }
    if (name === 'fold:snap-start') {
      this.onSnapStart(payload);
      return;
    }
    this.onSnapComplete(payload);
  }

  private onSnapStart(payload: FoldFeedbackPayload): void {
    const key = `${payload.recipeId}:${payload.stepId}`;
    if (this.lastStartKey === key) {
      return;
    }
    this.lastStartKey = key;
    this.placeHighlight(payload.crease);
    this.highlightUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + HIGHLIGHT_PULL_MS;
    this.glow = 0.22;
    this.host.paperMeshMaterial.emissive.set('#f4d7a2');
    this.host.paperMeshMaterial.emissiveIntensity = this.glow;
    this.play('attract', payload.crease, 0.18);
  }

  private onSnapComplete(payload: FoldFeedbackPayload): void {
    const key = `${payload.recipeId}:${payload.stepId}`;
    if (this.lastCompleteKey === key) {
      return;
    }
    this.lastCompleteKey = key;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.placeHighlight(payload.crease);
    this.highlightUntil = now + HIGHLIGHT_LOCK_MS;
    if (FOLD_FEEDBACK.settle) {
      this.settleStarted = now;
      this.settleUntil = now + FOLD_FEEDBACK.settleMs;
    }
    this.glow = 0.12;
    this.play('click', payload.crease, 0.28);
    if (FOLD_FEEDBACK.haptics) {
      const sources = this.sources.length > 0 ? this.sources : this.host.getInputSources();
      pulseControllerHaptics(sources, FOLD_FEEDBACK.hapticIntensity, FOLD_FEEDBACK.hapticDurationMs);
    }
  }

  private cancelVisuals(): void {
    this.highlightUntil = 0;
    this.settleUntil = 0;
    this.glow = 0;
    this.highlight.visible = false;
    this.host.sheet.scale.set(1, 1, 1);
    this.host.paperMeshMaterial.emissiveIntensity = 0;
  }

  private placeHighlight(crease: [Vec3, Vec3]): void {
    setRibbonPoints(this.highlight, crease, 0.0055, 0.007, 0.003);
    const center = mid(crease[0], crease[1]);
    if (this.attract) {
      this.attract.position.set(center[0], center[1], center[2] + 0.004);
    }
    if (this.click) {
      this.click.position.set(center[0], center[1], center[2] + 0.004);
    }
  }

  private updateHighlight(nowMs: number): void {
    const remaining = this.highlightUntil - nowMs;
    const show = FOLD_FEEDBACK.highlight && remaining > 0;
    this.highlight.visible = show;
    if (!show) {
      return;
    }
    const material = this.highlight.material as MeshBasicMaterial;
    material.opacity = Math.min(0.95, remaining / 180);
  }

  private updateSettle(nowMs: number): void {
    if (!FOLD_FEEDBACK.settle || nowMs >= this.settleUntil || this.settleUntil === 0) {
      this.host.sheet.scale.set(1, 1, 1);
      return;
    }
    const t = (nowMs - this.settleStarted) / Math.max(FOLD_FEEDBACK.settleMs, 1);
    const bounce = Math.sin(Math.min(t, 1) * Math.PI) * 0.012;
    this.host.sheet.scale.set(1 + bounce, 1 - bounce * 0.35, 1);
  }

  private play(kind: 'attract' | 'click', crease: [Vec3, Vec3], gain: number): void {
    this.ensureAudio();
    const sound = kind === 'attract' ? this.attract : this.click;
    if (!sound) {
      return;
    }
    const center = mid(crease[0], crease[1]);
    sound.position.set(center[0], center[1], center[2] + 0.004);
    sound.setVolume(FOLD_FEEDBACK.volume * gain);
    if (sound.isPlaying) {
      sound.stop();
    }
    sound.play();
  }

  private ensureAudio(): void {
    if (this.audioReady) {
      return;
    }
    const camera = this.host.getCamera();
    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!camera || !AudioContextCtor) {
      return;
    }
    this.listener = this.listener ?? new AudioListener();
    if (this.listener.parent !== camera) {
      camera.add(this.listener);
    }
    const ctx = this.listener.context;
    void ctx.resume?.();
    this.attract = new PositionalAudio(this.listener);
    this.click = new PositionalAudio(this.listener);
    this.attract.setRefDistance(0.18);
    this.click.setRefDistance(0.16);
    this.attract.setRolloffFactor(1.4);
    this.click.setRolloffFactor(1.6);
    this.attract.setBuffer(this.makeBuffer(ctx, 'attract'));
    this.click.setBuffer(this.makeBuffer(ctx, 'click'));
    this.group.add(this.attract, this.click);
    this.audioReady = true;
  }

  private syncListener(): void {
    const camera = this.host.getCamera();
    if (!camera || !this.listener) {
      return;
    }
    if (this.listener.parent !== camera) {
      camera.add(this.listener);
    }
  }

  private makeBuffer(ctx: AudioContext, kind: 'attract' | 'click'): AudioBuffer {
    const duration = kind === 'attract' ? ATTRACT_MS / 1000 : CLICK_MS / 1000;
    const samples = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'attract') {
      fillTone(data, ctx.sampleRate, 210, 0.11);
      fillTone(data, ctx.sampleRate, 320, 0.06);
      fillNoise(data, 0, samples, 0.035);
    } else {
      fillNoise(data, 0, Math.floor(samples * 0.35), 0.16);
      fillTone(data, ctx.sampleRate, 980, 0.08);
      fillTone(data, ctx.sampleRate, 1540, 0.04);
    }
    return buffer;
  }
}
