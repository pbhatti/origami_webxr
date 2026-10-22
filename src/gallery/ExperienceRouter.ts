import { COPY } from '../ui/welcomeCopy.ts';
import { animalById, type AnimalId } from './animals.ts';

export type ExperienceRoute =
  | { kind: 'launch'; id: AnimalId }
  | { kind: 'resume'; id: AnimalId }
  | { kind: 'coming-soon'; id: AnimalId; message: string };

export const COMING_SOON_MESSAGE = COPY.gallery.comingSoonToast;

export function routeAnimal(id: string, activeAnimalId: AnimalId | null): ExperienceRoute | null {
  const animal = animalById(id);
  if (!animal) {
    return null;
  }
  if (!animal.playable) {
    return { kind: 'coming-soon', id: animal.id, message: COMING_SOON_MESSAGE };
  }
  if (activeAnimalId === animal.id) {
    return { kind: 'resume', id: animal.id };
  }
  return { kind: 'launch', id: animal.id };
}
