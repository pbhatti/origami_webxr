export const MAX_DEBUG_EVENTS = 30;

export type DebugEventName =
  | 'xrReady'
  | 'sessionStarted'
  | 'sessionEnded'
  | 'paperSpawned'
  | 'paperRecentered'
  | 'paperMoveGrabbed'
  | 'paperMoveReleased'
  | 'sessionReset'
  | 'handsUpdated'
  | 'pinchStarted'
  | 'foldGrabbed'
  | 'foldAngleChanged'
  | 'pinchReleased'
  | 'foldValidated'
  | 'foldRejected'
  | 'foldCommitted'
  | 'foldSnapStart'
  | 'foldSnapComplete'
  | 'foldSnapCancelled'
  | 'trackingLost'
  | 'trackingRecovered'
  | 'recipeError'
  | 'creatureStarted'
  | 'creatureScaleStarted'
  | 'creatureScaleEnded'
  | 'capabilityChecked'
  | 'fatalError'
  | 'stateChanged'
  | 'galleryOpened'
  | 'galleryClosed'
  | 'galleryRecentered'
  | 'gallerySelected'
  | 'galleryDragGrabbed'
  | 'scissorsGrabbed'
  | 'galleryDragReleased';

export interface DebugEvent {
  name: DebugEventName;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export class DebugEvents {
  private readonly events: DebugEvent[] = [];

  emit(name: DebugEventName, payload?: Record<string, unknown>): DebugEvent {
    const event: DebugEvent = {
      name,
      timestamp: Date.now(),
      payload,
    };
    this.events.push(event);
    if (this.events.length > MAX_DEBUG_EVENTS) {
      this.events.shift();
    }
    const suffix = payload ? ` ${JSON.stringify(payload)}` : '';
    console.info(`[FoldFly] ${name}${suffix}`);
    return event;
  }

  latest(limit = MAX_DEBUG_EVENTS): DebugEvent[] {
    return this.events.slice(-limit);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export const debugEvents = new DebugEvents();
