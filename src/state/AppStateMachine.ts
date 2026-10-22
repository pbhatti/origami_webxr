export const APP_STATES = [
  'BOOT',
  'CAPABILITY_CHECK',
  'READY',
  'WELCOME',
  'GALLERY_OPEN',
  'GALLERY_COLLAPSING',
  'WHALE_LOADING',
  'GALLERY_OVERLAY',
  'PAPER_READY',
  'INSTRUCTION',
  'GRAB_ARMED',
  'FOLDING',
  'SNAP_PENDING',
  'SNAP_ANIMATING',
  'FOLD_LOCKED',
  'RETURN_ANIMATING',
  'COMPLETION',
  'CREATURE_ALIVE',
  'REPLAY',
  'FATAL_ERROR',
] as const;

export type AppState = (typeof APP_STATES)[number];

export const TRANSIENT_STATES = [
  'HAND_TRACKING_DEGRADED',
  'XR_SESSION_PAUSED',
  'XR_SESSION_ENDED',
] as const;

export type TransientState = (typeof TRANSIENT_STATES)[number];

const ALLOWED_TRANSITIONS: Record<AppState, readonly AppState[]> = {
  BOOT: ['CAPABILITY_CHECK', 'FATAL_ERROR'],
  CAPABILITY_CHECK: ['READY', 'FATAL_ERROR'],
  READY: ['WELCOME', 'FATAL_ERROR'],
  WELCOME: ['GALLERY_OPEN', 'PAPER_READY', 'FATAL_ERROR'],
  GALLERY_OPEN: ['GALLERY_COLLAPSING', 'WELCOME', 'FATAL_ERROR'],
  GALLERY_COLLAPSING: ['WHALE_LOADING', 'GALLERY_OPEN', 'FATAL_ERROR'],
  WHALE_LOADING: ['PAPER_READY', 'GALLERY_OPEN', 'FATAL_ERROR'],
  GALLERY_OVERLAY: [
    'INSTRUCTION',
    'PAPER_READY',
    'CREATURE_ALIVE',
    'COMPLETION',
    'GALLERY_COLLAPSING',
    'WELCOME',
    'FATAL_ERROR',
  ],
  PAPER_READY: ['INSTRUCTION', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  INSTRUCTION: ['GRAB_ARMED', 'COMPLETION', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  GRAB_ARMED: ['FOLDING', 'INSTRUCTION', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  FOLDING: ['SNAP_PENDING', 'INSTRUCTION', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  SNAP_PENDING: ['SNAP_ANIMATING', 'RETURN_ANIMATING', 'WELCOME', 'FATAL_ERROR'],
  SNAP_ANIMATING: ['FOLD_LOCKED', 'WELCOME', 'FATAL_ERROR'],
  FOLD_LOCKED: ['INSTRUCTION', 'COMPLETION', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  RETURN_ANIMATING: ['INSTRUCTION', 'WELCOME', 'FATAL_ERROR'],
  COMPLETION: ['CREATURE_ALIVE', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  CREATURE_ALIVE: ['REPLAY', 'WELCOME', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  REPLAY: ['WELCOME', 'PAPER_READY', 'INSTRUCTION', 'GALLERY_OVERLAY', 'FATAL_ERROR'],
  FATAL_ERROR: ['BOOT'],
};

export class IllegalStateTransitionError extends Error {
  constructor(
    readonly from: AppState,
    readonly to: AppState,
  ) {
    super(`Illegal state transition: ${from} -> ${to}`);
    this.name = 'IllegalStateTransitionError';
  }
}

export class AppStateMachine {
  private current: AppState;
  private transient: TransientState | null = null;
  private readonly listeners = new Set<(state: AppState, previous: AppState) => void>();

  constructor(initial: AppState = 'BOOT') {
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  get transientState(): TransientState | null {
    return this.transient;
  }

  canTransition(to: AppState): boolean {
    return ALLOWED_TRANSITIONS[this.current].includes(to);
  }

  transition(to: AppState): AppState {
    if (to === this.current) {
      return this.current;
    }
    if (!this.canTransition(to)) {
      throw new IllegalStateTransitionError(this.current, to);
    }
    return this.commit(to);
  }

  /** Restart-only jump. The fold graph cannot reach INSTRUCTION from every locked state. */
  force(to: AppState): AppState {
    if (to === this.current) {
      return this.current;
    }
    return this.commit(to);
  }

  private commit(to: AppState): AppState {
    const previous = this.current;
    this.current = to;
    this.transient = null;
    for (const listener of this.listeners) {
      listener(to, previous);
    }
    return this.current;
  }

  setTransient(state: TransientState | null): void {
    this.transient = state;
  }

  subscribe(listener: (state: AppState, previous: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
