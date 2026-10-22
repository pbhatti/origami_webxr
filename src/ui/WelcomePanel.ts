import type { AppState, TransientState } from '../state/AppStateMachine.ts';
import type { SessionDiagnostics } from '../xr/XRSessionManager.ts';
import type { XRCapabilityReport } from '../xr/XRCapabilities.ts';
import {
  COPY,
  HELP_COPY,
  PRODUCT_SENTENCE,
  PRODUCT_TAGLINE,
  PRODUCT_TITLE,
  capabilityBody,
  capabilityHeadline,
  handTrackingHint,
  startButtonLabel,
} from './welcomeCopy.ts';

export interface WelcomePanelHandlers {
  onStartSession: () => void;
  onExitAR: () => void;
  onConfirmExit: () => void;
  onKeepPlaying: () => void;
  onRecenter: () => void;
  onRestart: () => void;
  onReplay?: () => void;
  onChooseAnother?: () => void;
  onHelp: () => void;
  onDebug: () => void;
}

export class WelcomePanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sentence: HTMLElement;
  private readonly headline: HTMLElement;
  private readonly body: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly chips: HTMLElement;
  private readonly log: HTMLElement;
  private readonly status: HTMLElement;
  private readonly sessionBar: HTMLElement;
  private readonly help: HTMLElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly exitDialog: HTMLElement;
  private readonly exitFallback: HTMLElement;

  constructor(root: HTMLElement, handlers: WelcomePanelHandlers) {
    this.root = root;
    this.title = root.querySelector('[data-title]') as HTMLElement;
    this.sentence = root.querySelector('[data-sentence]') as HTMLElement;
    const stamp = root.querySelector('[data-stamp]');
    if (stamp) {
      stamp.textContent = PRODUCT_TAGLINE;
    }
    const completeHeading = root.querySelector('[data-complete-heading]');
    const completeBody = root.querySelector('[data-complete-body]');
    if (completeHeading) {
      completeHeading.textContent = COPY.completion.heading;
    }
    if (completeBody) {
      completeBody.textContent = COPY.completion.body;
    }
    const gestureText = root.querySelector('[data-gesture-text]');
    if (gestureText) {
      gestureText.textContent = COPY.gallery.gestureHint;
    }
    this.headline = root.querySelector('[data-headline]') as HTMLElement;
    this.body = root.querySelector('[data-body]') as HTMLElement;
    this.hint = root.querySelector('[data-hint]') as HTMLElement;
    this.startButton = root.querySelector('[data-start]') as HTMLButtonElement;
    this.chips = root.querySelector('[data-chips]') as HTMLElement;
    this.log = root.querySelector('[data-log]') as HTMLElement;
    this.status = root.querySelector('[data-status]') as HTMLElement;
    this.sessionBar = document.querySelector('[data-session-bar]') as HTMLElement;
    this.help = document.querySelector('[data-help]') as HTMLElement;
    this.exitButton = this.sessionBar.querySelector('[data-exit]') as HTMLButtonElement;
    this.exitDialog = document.querySelector('[data-exit-confirm]') as HTMLElement;
    this.exitFallback = root.querySelector('[data-exit-fallback]') as HTMLElement;

    this.title.textContent = PRODUCT_TITLE;
    this.sentence.textContent = PRODUCT_SENTENCE;
    this.help.textContent = HELP_COPY;

    this.startButton.addEventListener('click', () => handlers.onStartSession());
    this.exitButton.addEventListener('click', () => handlers.onExitAR());
    this.exitDialog.querySelector('[data-exit-yes]')?.addEventListener('click', () => handlers.onConfirmExit());
    this.exitDialog.querySelector('[data-exit-no]')?.addEventListener('click', () => handlers.onKeepPlaying());
    const leaveHeading = this.exitDialog.querySelector('[data-exit-heading]');
    const leaveBody = this.exitDialog.querySelector('[data-exit-body]');
    if (leaveHeading) {
      leaveHeading.textContent = COPY.session.leaveHeading;
    }
    if (leaveBody) {
      leaveBody.textContent = COPY.session.leaveBody;
    }
    const fallbackHeading = this.exitFallback.querySelector('[data-fallback-heading]');
    const fallbackBody = this.exitFallback.querySelector('[data-fallback-body]');
    if (fallbackHeading) {
      fallbackHeading.textContent = COPY.session.exitFallbackHeading;
    }
    if (fallbackBody) {
      fallbackBody.textContent = COPY.session.exitFallbackBody;
    }
    const confirmYes = this.exitDialog.querySelector('[data-exit-yes]');
    const confirmNo = this.exitDialog.querySelector('[data-exit-no]');
    if (confirmYes) {
      confirmYes.textContent = COPY.session.yesLeave;
    }
    if (confirmNo) {
      confirmNo.textContent = COPY.session.noStay;
    }
    this.setButton('[data-recenter]', COPY.session.recenterPaper);
    this.setButton('[data-restart]', COPY.session.restart);
    this.setButton('[data-replay]', COPY.completion.again);
    this.setButton('[data-choose]', COPY.completion.explore);
    this.setButton('[data-help-btn]', COPY.session.help);
    this.setButton('[data-debug-btn]', COPY.session.debug);
    this.setButton('[data-exit]', COPY.session.exitAr);
    this.sessionBar.querySelector('[data-recenter]')?.addEventListener('click', () => handlers.onRecenter());
    this.sessionBar.querySelector('[data-restart]')?.addEventListener('click', () => handlers.onRestart());
    this.sessionBar.querySelector('[data-help-btn]')?.addEventListener('click', () => handlers.onHelp());
    this.sessionBar.querySelector('[data-debug-btn]')?.addEventListener('click', () => handlers.onDebug());
    this.sessionBar.querySelector('[data-replay]')?.addEventListener('click', () => handlers.onReplay?.());
    this.sessionBar.querySelector('[data-choose]')?.addEventListener('click', () => handlers.onChooseAnother?.());
  }

  render(input: {
    appState: AppState;
    transient: TransientState | null;
    report: XRCapabilityReport | null;
    diagnostics: SessionDiagnostics | null;
    busy: boolean;
    lastError: string | null;
    debug: boolean;
    help: boolean;
    exitPrompt: boolean;
    returnedFromImmersive: boolean;
    launcherFallback: boolean;
    events: Array<{ name: string; timestamp: number }>;
  }): void {
    const sessionActive = Boolean(input.diagnostics?.active);
    const inPlay = ![
      'BOOT',
      'CAPABILITY_CHECK',
      'READY',
      'WELCOME',
      'FATAL_ERROR',
    ].includes(input.appState);
    this.headline.textContent = capabilityHeadline(input.report);
    this.body.textContent = capabilityBody(input.report);
    this.hint.textContent = handTrackingHint(
      input.diagnostics?.handTracking ?? 'unknown',
      sessionActive,
    );
    const showEnterMixedReality = input.returnedFromImmersive && input.appState === 'WELCOME';
    this.startButton.textContent = startButtonLabel(showEnterMixedReality);
    this.exitDialog.hidden = !input.exitPrompt;
    this.exitFallback.hidden = !(input.launcherFallback && input.appState === 'WELCOME');
    this.startButton.hidden = false;
    this.startButton.disabled = input.busy;
    this.root.dataset.state = input.appState;
    this.root.dataset.session = sessionActive ? 'active' : 'idle';
    this.root.dataset.compact = inPlay ? 'true' : 'false';

    this.sessionBar.hidden = !inPlay;
    const folded = input.appState === 'CREATURE_ALIVE' || input.appState === 'REPLAY' || input.appState === 'COMPLETION';
    const replay = this.sessionBar.querySelector('[data-replay]') as HTMLButtonElement | null;
    const choose = this.sessionBar.querySelector('[data-choose]') as HTMLButtonElement | null;
    if (replay) {
      replay.hidden = !folded;
    }
    if (choose) {
      choose.hidden = !folded;
    }
    this.exitButton.hidden = !inPlay;
    this.exitButton.disabled = input.busy;
    this.help.hidden = !input.help;

    this.chips.replaceChildren(
      ...this.chipNodes(input.report, input.diagnostics, input.appState),
    );

    this.status.textContent = input.lastError
      ? input.lastError
      : `${input.appState}${input.transient ? ` · ${input.transient}` : ''}`;
    this.status.dataset.tone = input.lastError ? 'error' : 'ok';

    this.log.hidden = !input.debug;
    if (input.debug) {
      this.log.textContent = input.events
        .slice()
        .reverse()
        .map((event) => `${new Date(event.timestamp).toISOString()}  ${event.name}`)
        .join('\n');
    }
  }

  private chipNodes(
    report: XRCapabilityReport | null,
    diagnostics: SessionDiagnostics | null,
    appState: AppState,
  ): HTMLElement[] {
    return [
      this.chip('Secure context', report?.secureContext ?? false),
      this.chip('WebXR', report?.webxr ?? false),
      this.chip('immersive-ar', report?.immersiveArSupported ?? false),
      this.chip(
        'hand-tracking',
        diagnostics?.handTracking === true
          ? true
          : diagnostics?.handTracking === false
            ? false
            : 'pending',
      ),
      this.chip(
        'Paper',
        appState === 'CREATURE_ALIVE' || appState === 'REPLAY' || appState === 'COMPLETION'
          ? 'fish'
          : appState === 'FOLDING' || appState === 'SNAP_ANIMATING' || appState === 'RETURN_ANIMATING'
            ? 'folding'
            : appState === 'GRAB_ARMED'
              ? 'hover'
              : appState === 'GALLERY_OPEN' || appState === 'GALLERY_OVERLAY'
                ? 'gallery'
                : appState === 'INSTRUCTION' || appState === 'PAPER_READY' || appState === 'FOLD_LOCKED'
                ? 'frozen'
                : 'preview',
      ),
      this.chip('State', appState),
    ];
  }

  private setButton(selector: string, label: string): void {
    const button = this.sessionBar.querySelector(selector);
    if (button) {
      button.textContent = label;
    }
  }

  private chip(label: string, value: boolean | string): HTMLElement {
    const el = document.createElement('span');
    el.className = 'chip';
    if (value === true || value === 'frozen' || value === 'fish') {
      el.dataset.tone = 'good';
    } else if (value === false) {
      el.dataset.tone = 'bad';
    } else {
      el.dataset.tone = 'wait';
    }
    el.textContent = `${label}: ${String(value)}`;
    return el;
  }
}
