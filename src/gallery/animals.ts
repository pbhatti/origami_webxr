import { FOLD_PAPER_COLOR } from '../origami/FoldPaper.ts';
import { BAT_PAPER_COLOR } from '../origami/recipes/bat.recipe.ts';
import { FOX_PAPER_COLOR } from '../origami/recipes/fox.recipe.ts';
import { OWL_PAPER_COLOR } from '../origami/recipes/owl.recipe.ts';

export type AnimalId =
  | 'rabbit'
  | 'elephant'
  | 'whale'
  | 'swan'
  | 'crane'
  | 'boat'
  | 'bird'
  | 'frog'
  | 'cat'
  | 'dog'
  | 'horse'
  | 'dog-sitting'
  | 'mouse'
  | 'fox'
  | 'bat'
  | 'owl'
  | 'cat-sitting'
  | 'dog-standing';

export type PlayableAnimalId = 'whale' | 'fox' | 'bat' | 'owl';

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
  { id: 'rabbit', name: 'Rabbit', row: 0, column: 0, playable: false, paperColor: '#f4ead6', approximation: true },
  { id: 'elephant', name: 'Elephant', row: 0, column: 1, playable: false, paperColor: '#c5c0b5', approximation: true },
  { id: 'whale', name: 'Whale', row: 0, column: 2, playable: true, paperColor: FOLD_PAPER_COLOR, approximation: false },
  { id: 'fox', name: 'Fox', row: 0, column: 3, playable: true, paperColor: FOX_PAPER_COLOR, approximation: false },
  { id: 'bat', name: 'Bat', row: 1, column: 0, playable: true, paperColor: BAT_PAPER_COLOR, approximation: false },
  { id: 'owl', name: 'Owl', row: 1, column: 1, playable: true, paperColor: OWL_PAPER_COLOR, approximation: false },
  { id: 'crane', name: 'Crane', row: 1, column: 2, playable: false, paperColor: '#c44536', approximation: true },
  { id: 'boat', name: 'Boat', row: 1, column: 3, playable: false, paperColor: '#7d93a8', approximation: true },
  { id: 'bird', name: 'Bird', row: 2, column: 0, playable: false, paperColor: '#e8c547', approximation: true },
  { id: 'frog', name: 'Frog', row: 2, column: 1, playable: false, paperColor: '#6b8f71', approximation: true },
  { id: 'cat', name: 'Cat', row: 2, column: 2, playable: false, paperColor: '#e8a87c', approximation: true },
  { id: 'dog', name: 'Dog', row: 2, column: 3, playable: false, paperColor: '#c4a574', approximation: true },
  { id: 'horse', name: 'Horse', row: 3, column: 0, playable: false, paperColor: '#8b6b4a', approximation: true },
  { id: 'dog-sitting', name: 'Dog (Sitting)', row: 3, column: 1, playable: false, paperColor: '#b08968', approximation: true },
  { id: 'mouse', name: 'Mouse', row: 3, column: 2, playable: false, paperColor: '#d4c4c4', approximation: true },
  { id: 'swan', name: 'Swan', row: 3, column: 3, playable: false, paperColor: '#f7f1e6', approximation: true },
  { id: 'cat-sitting', name: 'Cat (Sitting)', row: 4, column: 0, playable: false, paperColor: '#d9cbb8', approximation: true },
  { id: 'dog-standing', name: 'Dog (Standing)', row: 4, column: 1, playable: false, paperColor: '#c4a574', approximation: true },
];

export const GALLERY_COLUMNS = 4;
export const GALLERY_ROWS = 5;
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
  return id === 'whale' || id === 'fox' || id === 'bat' || id === 'owl';
}
