/** Future gallery groups. No tabs until the gallery architecture adds them. */
export const CREATION_CATEGORIES = ['Animals', 'Nature', 'Objects', 'Fantasy'] as const;

export const COPY = {
  product: {
    name: 'Fold & Play',
    tagline: 'Simple folds. Big imagination.',
    description: 'Pinch a creation and fold it with your hands.',
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
    turtle: 'Your little turtle is ready to play!',
    dinosaur: 'Your little dinosaur is ready to play!',
    ladybug: 'Your ladybug is ready to play!',
    penguin: 'Your little penguin is ready to play!',
    again: 'Fold Again',
    explore: 'Explore More',
  },
} as const;

export const PRODUCT_TITLE = COPY.product.name;
export const PRODUCT_TAGLINE = COPY.product.tagline;
export const PRODUCT_SENTENCE = COPY.product.description;

export const HELP_COPY =
  'After Enter AR, pinch a gallery card. Whale, Fox, Bat, Owl, Turtle, Dinosaur, Ladybug, and Penguin launch guided folds. Other creations show Coming Soon. Explore returns to the gallery without losing fold progress. Pinch the highlight to fold. Pinch Move to reposition the sheet. Debug + A assists. Debug + G toggles the gallery.';

export function completionBodyFor(animalId: string): string {
  if (animalId === 'bat') {
    return COPY.completion.bat;
  }
  if (animalId === 'owl') {
    return COPY.completion.owl;
  }
  if (animalId === 'turtle') {
    return COPY.completion.turtle;
  }
  if (animalId === 'dinosaur') {
    return COPY.completion.dinosaur;
  }
  if (animalId === 'ladybug') {
    return COPY.completion.ladybug;
  }
  if (animalId === 'penguin') {
    return COPY.completion.penguin;
  }
  return COPY.completion.body;
}

export function startButtonLabel(returnedFromImmersive = false): string {
  return returnedFromImmersive ? COPY.session.enterMixedReality : COPY.session.start;
}
