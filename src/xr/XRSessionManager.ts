import {
  SessionMode,
  VisibilityState,
  World,
  type WorldOptions,
} from '@iwsdk/core';
import { debugEvents } from '../telemetry/DebugEvents.ts';
import { createReferenceSpaceSpec, referenceSpaceLabel } from './ReferenceSpace.ts';
import {
  AR_UNAVAILABLE_MESSAGE,
  canLaunchImmersiveAr,
  detectXRCapabilities,
  readEnabledFeatures,
  sessionHasHandTracking,
  type XRCapabilityReport,
} from './XRCapabilities.ts';

export interface SessionDiagnostics {
  active: boolean;
  visibility: VisibilityState;
  referenceSpace: string;
  requestedMode: typeof SessionMode.ImmersiveAR;
  enabledFeatures: string[];
  handTracking: boolean | 'unknown';
  frameRate: number | null;
}

const SESSION_START_TIMEOUT_MS = 8000;

export const WORLD_OPTIONS: WorldOptions = {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: createReferenceSpaceSpec(),
    features: {
      handTracking: true,
      layers: true,
    },
    offer: 'none',
    launchOnSessionGranted: false,
    restoreCameraOnExit: true,
  },
  features: {
    grabbing: false,
    locomotion: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    camera: false,
    physics: false,
  },
  render: {
    fov: 50,
    near: 0.05,
    far: 40,
    camera: {
      position: [0.22, 1.38, 0.52],
      lookAt: [0.28, 1.2, -0.42],
    },
  },
};

export class XRSessionManager {
  private world: World | null = null;
  private unsubscribers: Array<() => void> = [];
  private sessionEndHandler: ((event: Event) => void) | null = null;
  private capabilities: XRCapabilityReport | null = null;

  constructor(
    private readonly onDiagnostics?: (diagnostics: SessionDiagnostics) => void,
    private readonly onSessionEnded?: () => void,
  ) {}

  getWorld(): World | null {
    return this.world;
  }

  getCapabilities(): XRCapabilityReport | null {
    return this.capabilities;
  }

  isSessionActive(): boolean {
    return Boolean(this.world?.session);
  }

  async probeCapabilities(): Promise<XRCapabilityReport> {
    this.capabilities = await detectXRCapabilities();
    debugEvents.emit('capabilityChecked', {
      immersiveArSupported: this.capabilities.immersiveArSupported,
      webxr: this.capabilities.webxr,
      secureContext: this.capabilities.secureContext,
      userAgent: this.capabilities.userAgent,
    });
    return this.capabilities;
  }

  async createWorld(container: HTMLElement): Promise<World> {
    if (this.world) {
      return this.world;
    }

    const world = await World.create(container, WORLD_OPTIONS);
    this.world = world;
    this.bindWorld(world);
    debugEvents.emit('xrReady', {
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none',
      grabbing: false,
    });
    return world;
  }

  async enterAR(): Promise<XRSession> {
    if (!this.world) {
      throw new Error('World is not initialized');
    }
    if (this.world.session) {
      return this.world.session;
    }

    const report = this.capabilities ?? (await this.probeCapabilities());
    if (!canLaunchImmersiveAr(report)) {
      throw new Error(AR_UNAVAILABLE_MESSAGE);
    }

    const session = await this.requestSession(this.world);
    this.attachSession(session);
    const features = readEnabledFeatures(session);
    const handTracking = sessionHasHandTracking(session);
    debugEvents.emit('sessionStarted', {
      mode: SessionMode.ImmersiveAR,
      enabledFeatures: features,
      handTracking,
      referenceSpace: this.currentReferenceSpace(),
    });
    if (handTracking === false) {
      debugEvents.emit('trackingLost', { reason: 'hand-tracking-not-granted' });
    }
    this.publishDiagnostics();
    return session;
  }

  async exitAR(): Promise<void> {
    const session = this.world?.renderer.xr.getSession() ?? this.world?.session ?? null;
    if (!session) {
      return;
    }
    try {
      await session.end();
    } catch (error) {
      console.error('Failed to exit WebXR session:', error);
      debugEvents.emit('fatalError', {
        where: 'exitAR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    this.detachSession(this.world?.session);
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.world?.destroy();
    this.world = null;
  }

  private bindWorld(world: World): void {
    const unsubscribeVisibility = world.visibilityState.subscribe((state) => {
      if (state === VisibilityState.Hidden) {
        debugEvents.emit('sessionEnded', { reason: 'visibility-hidden' });
      }
      this.publishDiagnostics();
    });
    this.unsubscribers.push(unsubscribeVisibility);

    const onVisibilityChange = (): void => {
      if (document.hidden && world.session) {
        debugEvents.emit('sessionEnded', { reason: 'document-hidden' });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.unsubscribers.push(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });
  }

  private requestSession(world: World): Promise<XRSession> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('XR session did not start. Check HTTPS, Quest Browser permissions, and console errors.'));
      }, SESSION_START_TIMEOUT_MS);

      const poll = window.setInterval(() => {
        if (world.session) {
          cleanup();
          resolve(world.session);
        }
      }, 40);

      const unsubscribe = world.visibilityState.subscribe((state) => {
        if (
          world.session &&
          (state === VisibilityState.Visible || state === VisibilityState.VisibleBlurred)
        ) {
          cleanup();
          resolve(world.session);
        }
      });

      const cleanup = (): void => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        unsubscribe();
      };

      try {
        world.launchXR({
          sessionMode: SessionMode.ImmersiveAR,
          referenceSpace: createReferenceSpaceSpec(),
          features: { handTracking: true, layers: true },
        });
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private attachSession(session: XRSession): void {
    this.detachSession(session);
    this.sessionEndHandler = () => {
      debugEvents.emit('sessionEnded', {
        enabledFeatures: readEnabledFeatures(session),
      });
      this.detachSession(session);
      this.publishDiagnostics();
      this.onSessionEnded?.();
    };
    session.addEventListener('end', this.sessionEndHandler);
  }

  private detachSession(session: XRSession | undefined): void {
    if (session && this.sessionEndHandler) {
      session.removeEventListener('end', this.sessionEndHandler);
    }
    this.sessionEndHandler = null;
  }

  private currentReferenceSpace(): string {
    const space = this.world?.renderer.xr.getReferenceSpace();
    const type = (space as { type?: string } | null)?.type;
    return referenceSpaceLabel(type);
  }

  private publishDiagnostics(): void {
    if (!this.onDiagnostics || !this.world) {
      return;
    }
    const session = this.world.session;
    this.onDiagnostics({
      active: Boolean(session),
      visibility: this.world.visibilityState.value,
      referenceSpace: this.currentReferenceSpace(),
      requestedMode: SessionMode.ImmersiveAR,
      enabledFeatures: readEnabledFeatures(session),
      handTracking: sessionHasHandTracking(session),
      frameRate: session?.frameRate ?? null,
    });
  }
}
