import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { DayTemplate, RoutineTemplate, WeekTemplate } from '../types';

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

// --- Mutations -------------------------------------------------------------

interface CreateRoutineInput {
  profileId: string;
  name: string;
  description?: string;
  weeks?: WeekTemplate[];
}

/** Create a new custom routine. Defaults to a single workout-A day in
 * week 1 so the editor opens with something to iterate on. */
export async function createRoutine(
  input: CreateRoutineInput,
): Promise<string> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const routine: RoutineTemplate = {
    id,
    name: input.name.trim() || 'New routine',
    description: input.description?.trim() ?? '',
    weeks:
      input.weeks && input.weeks.length > 0 ? input.weeks : [defaultWeek(1)],
    isSeed: false,
    profileId: input.profileId,
    createdAt: now,
    updatedAt: now,
  };
  await db.routineTemplates.add(routine);
  return id;
}

export async function updateRoutine(
  id: string,
  patch: Partial<Omit<RoutineTemplate, 'id' | 'isSeed' | 'profileId' | 'createdAt'>>,
): Promise<void> {
  const next = { ...patch, updatedAt: new Date().toISOString() };
  await db.routineTemplates.update(id, next);
}

export async function deleteRoutine(id: string): Promise<void> {
  const r = await db.routineTemplates.get(id);
  if (!r) return;
  if (r.isSeed) {
    throw new Error('Built-in routines cannot be deleted');
  }
  await db.routineTemplates.delete(id);
}

/** Fork a routine into a custom copy owned by `profileId`. The fork
 * is a deep clone of `weeks` so subsequent edits don't mutate the
 * source. */
export async function forkRoutine(
  sourceId: string,
  profileId: string,
): Promise<string> {
  const src = await db.routineTemplates.get(sourceId);
  if (!src) throw new Error('Source routine not found');
  return createRoutine({
    profileId,
    name: `${src.name} (copy)`,
    description: src.description,
    weeks: structuredClone(src.weeks),
  });
}

// --- Helpers ---------------------------------------------------------------

export function defaultWeek(weekNumber: number): WeekTemplate {
  return {
    weekNumber,
    days: [defaultWorkoutDay(1, 'A'), defaultRestDay(2)],
  };
}

export function defaultWorkoutDay(
  dayNumber: number,
  workoutLabel: string,
): DayTemplate {
  return {
    dayNumber,
    kind: 'workout',
    workoutLabel,
    blocks: [],
  };
}

export function defaultRestDay(dayNumber: number): DayTemplate {
  return { dayNumber, kind: 'rest', blocks: [] };
}

/** Renumber weeks 1..N after a delete or reorder. Pure helper. */
export function renumberWeeks(weeks: WeekTemplate[]): WeekTemplate[] {
  return weeks.map((w, i) => ({ ...w, weekNumber: i + 1 }));
}

/** Renumber days 1..N within a week. Pure helper. */
export function renumberDays(week: WeekTemplate): WeekTemplate {
  return {
    ...week,
    days: week.days.map((d, i) => ({ ...d, dayNumber: i + 1 })),
  };
}
