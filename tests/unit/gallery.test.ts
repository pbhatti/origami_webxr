import { describe, expect, it } from 'vitest';
import { ANIMALS, GALLERY_COLUMNS, playableAnimals } from '../../src/gallery/animals.ts';
import { COMING_SOON_MESSAGE, routeAnimal } from '../../src/gallery/ExperienceRouter.ts';
import { COPY } from '../../src/ui/welcomeCopy.ts';
import { createFloatAnimation } from '../../src/gallery/FloatingAnimationController.ts';
import { origamiModels } from '../../src/gallery/OrigamiModelRegistry.ts';
import { cardGradientFor } from '../../src/gallery/galleryGlass.ts';
import { FOLD_PAPER_COLOR } from '../../src/origami/FoldPaper.ts';
import { BAT_PAPER_COLOR } from '../../src/origami/recipes/bat.recipe.ts';
import { OWL_PAPER_COLOR } from '../../src/origami/recipes/owl.recipe.ts';
import { FOX_PAPER_COLOR } from '../../src/origami/recipes/fox.recipe.ts';

describe('origami animals gallery', () => {
  it('lists creations with Whale, Fox, and Bat as the playable set', () => {
    expect(ANIMALS).toHaveLength(18);
    expect(GALLERY_COLUMNS).toBe(4);
    expect(ANIMALS.map((animal) => animal.name)).toEqual([
      'Rabbit',
      'Elephant',
      'Whale',
      'Fox',
      'Bat',
      'Owl',
      'Crane',
      'Boat',
      'Bird',
      'Frog',
      'Cat',
      'Dog',
      'Horse',
      'Dog (Sitting)',
      'Mouse',
      'Swan',
      'Cat (Sitting)',
      'Dog (Standing)',
    ]);
    const firstRow = ANIMALS.filter((animal) => animal.row === 0)
      .sort((a, b) => a.column - b.column)
      .map((animal) => animal.name);
    expect(firstRow).toEqual(['Rabbit', 'Elephant', 'Whale', 'Fox']);
    const whale = ANIMALS.find((animal) => animal.id === 'whale');
    const fox = ANIMALS.find((animal) => animal.id === 'fox');
    expect(fox?.row).toBe(whale?.row);
    expect(fox?.column).toBe((whale?.column ?? 0) + 1);
  });

  it('gives every card a complementary glass gradient without recoloring the origami', () => {
    const whale = cardGradientFor('whale');
    const fox = cardGradientFor('fox');
    const bat = cardGradientFor('bat');
    const owl = cardGradientFor('owl');
    expect(whale).toEqual({ from: '#fff6ee', to: '#ffe0c4' });
    expect(fox).toEqual({ from: '#fff3ea', to: '#ffd4b4' });
    expect(bat).toEqual({ from: '#f6f0fa', to: '#e4d4f0' });
    expect(owl).toEqual({ from: '#f4faf3', to: '#d5ecd3' });
    expect(whale.from).not.toBe(fox.from);
    for (const animal of ANIMALS) {
      const gradient = cardGradientFor(animal.id);
      expect(gradient.from).not.toBe(animal.paperColor);
      expect(gradient.to).not.toBe(animal.paperColor);
    }
  });

  it('makes whale, fox, and bat playable from the gallery', () => {
    expect(playableAnimals().map((animal) => animal.id)).toEqual(['whale', 'fox', 'bat', 'owl']);
    expect(ANIMALS.find((animal) => animal.id === 'whale')?.paperColor).toBe(FOLD_PAPER_COLOR);
    expect(ANIMALS.find((animal) => animal.id === 'fox')?.paperColor).toBe(FOX_PAPER_COLOR);
    expect(ANIMALS.find((animal) => animal.id === 'bat')?.paperColor).toBe(BAT_PAPER_COLOR);
    expect(ANIMALS.find((animal) => animal.id === 'owl')?.paperColor).toBe(OWL_PAPER_COLOR);
    expect(ANIMALS.filter((animal) => !animal.playable)).toHaveLength(14);
  });

  it('routes whale and fox to launch or resume and other cards to coming soon', () => {
    expect(routeAnimal('whale', null)).toEqual({ kind: 'launch', id: 'whale' });
    expect(routeAnimal('whale', 'whale')).toEqual({ kind: 'resume', id: 'whale' });
    expect(routeAnimal('fox', null)).toEqual({ kind: 'launch', id: 'fox' });
    expect(routeAnimal('fox', 'fox')).toEqual({ kind: 'resume', id: 'fox' });
    expect(routeAnimal('fox', 'whale')).toEqual({ kind: 'launch', id: 'fox' });
    expect(routeAnimal('bat', null)).toEqual({ kind: 'launch', id: 'bat' });
    expect(routeAnimal('bat', 'bat')).toEqual({ kind: 'resume', id: 'bat' });
    expect(routeAnimal('bat', 'fox')).toEqual({ kind: 'launch', id: 'bat' });
    expect(routeAnimal('owl', null)).toEqual({ kind: 'launch', id: 'owl' });
    expect(routeAnimal('owl', 'fox')).toEqual({ kind: 'launch', id: 'owl' });
    expect(routeAnimal('crane', null)).toEqual({
      kind: 'coming-soon',
      id: 'crane',
      message: COMING_SOON_MESSAGE,
    });
    expect(routeAnimal('unknown', null)).toBeNull();
    expect(COPY.gallery.foldNow).toBe('Fold Now');
    expect(COPY.gallery.comingSoon).toBe('Coming Soon');
    expect(COPY.gallery.heading).toBe('Explore Creations');
  });

  it('builds a folded-paper bat preview with fluttering wings', () => {
    const model = origamiModels.create('bat', BAT_PAPER_COLOR);
    const wings: string[] = [];
    model.traverse((child) => {
      if (child.userData.batWing) {
        wings.push(String(child.userData.batWing));
      }
    });
    expect(wings.sort()).toEqual(['left', 'right']);
    expect(model.children.length).toBeGreaterThan(1);
  });

  it('gives every animal its own float phase, amplitude, and speed', () => {
    const animations = ANIMALS.map((animal) => createFloatAnimation(animal.id));
    const phases = new Set(animations.map((animation) => animation.phase.toFixed(4)));
    const amplitudes = new Set(animations.map((animation) => animation.amplitude.toFixed(4)));
    const frequencies = new Set(animations.map((animation) => animation.frequency.toFixed(4)));
    expect(phases.size).toBe(ANIMALS.length);
    expect(amplitudes.size).toBeGreaterThan(8);
    expect(frequencies.size).toBeGreaterThan(8);
    for (const animation of animations) {
      expect(animation.amplitude).toBeGreaterThanOrEqual(0.003);
      expect(animation.amplitude).toBeLessThanOrEqual(0.008);
      const duration = (Math.PI * 2) / animation.frequency;
      expect(duration).toBeGreaterThanOrEqual(2.5);
      expect(duration).toBeLessThanOrEqual(5.0001);
    }
  });
});
