import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Exercise } from '../types';

export async function listExercises(): Promise<Exercise[]> {
  return db.exercises.orderBy('name').toArray();
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(() => listExercises(), []);
}

/** Map of exerciseId → Exercise. Convenient for routine detail rendering. */
export function useExerciseMap(): Map<string, Exercise> | undefined {
  return useLiveQuery(async () => {
    const all = await listExercises();
    return new Map(all.map((e) => [e.id, e]));
  }, []);
}
