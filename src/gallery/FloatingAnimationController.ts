import type { Object3D } from 'three';

export interface FloatAnimation {
  baseY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  swayRad: number;
  swayFrequency: number;
}

export interface FloatHandle {
  object: Object3D;
  animation: FloatAnimation;
  hover: boolean;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number, salt: number): number {
  const x = Math.sin(seed * 0.0001 + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function createFloatAnimation(id: string, baseY = 0): FloatAnimation {
  const seed = hashString(id);
  const duration = 2.5 + unit(seed, 1) * 2.5;
  return {
    baseY,
    amplitude: 0.003 + unit(seed, 2) * 0.005,
    frequency: (Math.PI * 2) / duration,
    phase: unit(seed, 3) * Math.PI * 2,
    swayRad: (1 + unit(seed, 4)) * (Math.PI / 180),
    swayFrequency: (Math.PI * 2) / (3 + unit(seed, 5) * 2),
  };
}

export function floatPose(animation: FloatAnimation, elapsedSeconds: number, hover: boolean): { y: number; tilt: number } {
  const amplitude = animation.amplitude * (hover ? 1.35 : 1);
  const t = elapsedSeconds * animation.frequency + animation.phase;
  return {
    y: animation.baseY + Math.sin(t) * amplitude,
    tilt: Math.sin(elapsedSeconds * animation.swayFrequency + animation.phase) * animation.swayRad,
  };
}

export class FloatingAnimationController {
  private readonly handles: FloatHandle[] = [];
  private startedAt = 0;
  private pauseOffset = 0;
  private playing = true;
  private elapsed = 0;

  add(object: Object3D, id: string, baseY = 0): FloatAnimation {
    const animation = createFloatAnimation(id, baseY);
    this.handles.push({ object, animation, hover: false });
    return animation;
  }

  setHover(object: Object3D, hover: boolean): void {
    const handle = this.handles.find((entry) => entry.object === object);
    if (handle) {
      handle.hover = hover;
    }
  }

  get activeCount(): number {
    return this.playing ? this.handles.length : 0;
  }

  get animations(): FloatAnimation[] {
    return this.handles.map((handle) => handle.animation);
  }

  pause(): void {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.pauseOffset = this.now();
  }

  resume(): void {
    if (this.playing) {
      return;
    }
    this.startedAt += this.now() - this.pauseOffset;
    this.playing = true;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  tick(): void {
    if (!this.playing) {
      return;
    }
    if (this.startedAt === 0) {
      this.startedAt = this.now();
    }
    this.elapsed = (this.now() - this.startedAt) / 1000;
    for (const handle of this.handles) {
      const pose = floatPose(handle.animation, this.elapsed, handle.hover);
      handle.object.position.y = pose.y;
      handle.object.rotation.z = pose.tilt;
      const flap = Math.sin(this.elapsed * 5.6 + handle.animation.phase) * 0.2;
      handle.object.traverse((child) => {
        if (child.userData.batWing === 'left') {
          child.rotation.y = flap;
        }
        if (child.userData.batWing === 'right') {
          child.rotation.y = -flap;
        }
      });
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
