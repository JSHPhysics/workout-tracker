import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { RoutineTemplate } from '../types';

export async function listRoutines(): Promise<RoutineTemplate[]> {
  // Seeds first, then custom by createdAt asc.
  const all = await db.routineTemplates.toArray();
  return all.sort((a, b) => {
    if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function useRoutines(): RoutineTemplate[] | undefined {
  return useLiveQuery(() => listRoutines(), []);
}

export function useRoutine(id: string | undefined): RoutineTemplate | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.routineTemplates.get(id)) ?? null;
  }, [id]);
}
