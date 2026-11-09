import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';
import { BAT_PAPER_COLOR } from '../origami/recipes/bat.recipe.ts';
import { FOX_PAPER_COLOR } from '../origami/recipes/fox.recipe.ts';
import { OWL_PAPER_COLOR } from '../origami/recipes/owl.recipe.ts';
import { DINOSAUR_PAPER_COLOR } from '../origami/recipes/dinosaur.recipe.ts';
import { LADYBUG_PAPER_COLOR } from '../origami/recipes/ladybug.recipe.ts';
import { PENGUIN_PAPER_COLOR } from '../origami/recipes/penguin.recipe.ts';
import { TURTLE_PAPER_COLOR } from '../origami/recipes/turtle.recipe.ts';

export type AnimalId =
  | 'whale'
  | 'fox'
  | 'bat'
  | 'owl'
  | 'turtle'
  | 'dinosaur'
  | 'ladybug'
  | 'penguin';

export type PlayableAnimalId = 'whale' | 'fox' | 'bat' | 'owl' | 'turtle' | 'dinosaur' | 'ladybug' | 'penguin';

export interface AnimalDefinition {
  id: AnimalId;
  name: string;
  row: number;
  column: number;
  playable: boolean;
  paperColor: string;
  approximation: boolean;
}

export const ANIMALS: AnimalDefinition[] = [
  { id: 'whale', name: 'Whale', row: 0, column: 0, playable: true, paperColor: FOLD_PAPER_COLOR, approximation: false },
  { id: 'fox', name: 'Fox', row: 0, column: 1, playable: true, paperColor: FOX_PAPER_COLOR, approximation: false },
  { id: 'bat', name: 'Bat', row: 0, column: 2, playable: true, paperColor: BAT_PAPER_COLOR, approximation: false },
  { id: 'owl', name: 'Owl', row: 0, column: 3, playable: true, paperColor: OWL_PAPER_COLOR, approximation: false },
  { id: 'turtle', name: 'Turtle', row: 1, column: 0, playable: true, paperColor: TURTLE_PAPER_COLOR, approximation: false },
  { id: 'dinosaur', name: 'Dinosaur', row: 1, column: 1, playable: true, paperColor: DINOSAUR_PAPER_COLOR, approximation: false },
  { id: 'ladybug', name: 'Ladybug', row: 1, column: 2, playable: true, paperColor: LADYBUG_PAPER_COLOR, approximation: false },
  { id: 'penguin', name: 'Penguin', row: 1, column: 3, playable: true, paperColor: PENGUIN_PAPER_COLOR, approximation: false },
];

export const GALLERY_COLUMNS = 4;
export const GALLERY_ROWS = 2;
export const GALLERY_VISIBLE_ROWS = 2;

export function animalById(id: string): AnimalDefinition | undefined {
  return ANIMALS.find((animal) => animal.id === id);
}

export function playableAnimals(): AnimalDefinition[] {
  return ANIMALS.filter((animal) => animal.playable);
}

export function galleryRowCount(): number {
  return ANIMALS.reduce((max, animal) => Math.max(max, animal.row), -1) + 1;
}

export function isPlayableAnimalId(id: string): id is PlayableAnimalId {
  return id === 'whale' || id === 'fox' || id === 'bat' || id === 'owl' || id === 'turtle' || id === 'dinosaur' || id === 'ladybug' || id === 'penguin';
}
