import {
  AR_UNAVAILABLE_MESSAGE,
  HAND_TRACKING_UNAVAILABLE_MESSAGE,
  canLaunchImmersiveAr,
  type XRCapabilityReport,
} from '../xr/XRCapabilities.ts';

/** Future gallery groups. No tabs until the gallery architecture adds them. */
export const CREATION_CATEGORIES = ['Animals', 'Nature', 'Objects', 'Fantasy'] as const;

export const COPY = {
  product: {
    name: 'Fold & Play',
    tagline: 'Simple folds. Big imagination.',
    description: 'Pick a creation, fold it with your hands, and watch it come to life.',
  },
  gallery: {
    heading: 'Explore Creations',
    foldNow: 'Fold Now',
    comingSoon: 'Coming Soon',
    comingSoonToast: 'Folding experience coming soon',
    more: 'More creations',
    back: 'Back',
    continue: 'Continue',
    gestureHint: 'Use your hands to pinch, fold & play.',
  },
  session: {
    start: 'Start Folding',
    progress: 'Folding steps',
    restart: 'Fold Again',
    menu: 'Explore',
    exploreMore: 'Explore More',
    recenter: 'Recenter',
    recenterPaper: 'Recenter Paper',
    recenterMenu: 'Recenter',
    confirmRestart: 'Start over',
    cancel: 'Cancel',
    help: 'Help',
    debug: 'Debug',
    exit: 'Exit',
    exitAr: 'Exit AR',
    leaveHeading: 'Leave Fold & Play?',
    leaveBody: 'Your current folding progress will be lost.',
    yesLeave: 'Yes, Leave',
    noStay: 'No, Stay',
    exitExperience: 'Yes, Leave',
    keepPlaying: 'No, Stay',
    enterMixedReality: 'Enter Mixed Reality',
    exitFallbackHeading: 'Still in immersive view?',
    exitFallbackBody: 'This page is still open. Enter Mixed Reality starts a new session.',
  },
  completion: {
    heading: "It's alive!",
    body: 'Your creation is ready to play!',
    bat: 'Your little bat is ready to fly!',
    owl: 'Your little owl is ready to play!',
    again: 'Fold Again',
    explore: 'Explore More',
  },
} as const;

export const PRODUCT_TITLE = COPY.product.name;
export const PRODUCT_TAGLINE = COPY.product.tagline;
export const PRODUCT_SENTENCE = COPY.product.description;

export const HELP_COPY =
  'After Enter AR, pinch a gallery card. Whale, Fox, Bat, and Owl launch guided folds. Other creations show Coming Soon. Explore returns to the gallery without losing fold progress. Pinch the highlight to fold. Pinch Move to reposition the sheet. Debug + A assists. Debug + G toggles the gallery.';

export function completionBodyFor(animalId: string): string {
  if (animalId === 'bat') {
    return COPY.completion.bat;
  }
  if (animalId === 'owl') {
    return COPY.completion.owl;
  }
  return COPY.completion.body;
}

export function startButtonLabel(returnedFromImmersive = false): string {
  return returnedFromImmersive ? COPY.session.enterMixedReality : COPY.session.start;
}

export function capabilityHeadline(report: XRCapabilityReport | null): string {
  if (!report) {
    return 'Checking XR capabilities…';
  }
  if (canLaunchImmersiveAr(report)) {
    return 'Quest Browser can request immersive AR.';
  }
  return AR_UNAVAILABLE_MESSAGE;
}

export function capabilityBody(report: XRCapabilityReport | null): string {
  if (!report) {
    return 'Probing navigator.xr.isSessionSupported("immersive-ar") and secure-context requirements.';
  }
  if (!report.secureContext) {
    return 'Open this app over HTTPS or localhost. Quest Browser will not grant WebXR on plain HTTP.';
  }
  if (!report.webxr) {
    return 'This browser does not expose WebXR. Use Quest Browser on a headset, or start a desktop session for placement.';
  }
  if (!report.immersiveArSupported) {
    return `${AR_UNAVAILABLE_MESSAGE}. Start Folding still places a world-stable sheet for desktop debugging.`;
  }
  return 'Start Folding opens the creations gallery about a meter in front of you. Recenter never auto-follows your head.';
}

export function handTrackingHint(handTracking: boolean | 'unknown', sessionActive: boolean): string {
  if (!sessionActive) {
    return 'Start Folding, then pinch a creation card. Whale, Fox, Bat, and Owl are playable; other cards are Coming Soon. On desktop, click and drag.';
  }
  if (handTracking === true) {
    return 'Hand tracking granted. Pinch the highlight and fold along the dotted line. Your folding journey fills as each fold locks in.';
  }
  if (handTracking === false) {
    return HAND_TRACKING_UNAVAILABLE_MESSAGE;
  }
  return 'Runtime did not expose enabledFeatures; hand tracking grant is unknown until joints appear.';
}
