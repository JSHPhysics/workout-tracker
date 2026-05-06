import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { PRType, SetLog, SetType } from '../types';

interface LogSetInput {
  sessionId: string;
  exerciseId: string;
  blockOrder: number;
  exerciseOrder: number;
  setNumber: number;
  setType?: SetType;
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  side?: 'left' | 'right' | null;
}

export async function logSet(input: LogSetInput): Promise<string> {
  const id = crypto.randomUUID();
  const log: SetLog = {
    id,
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    blockOrder: input.blockOrder,
    exerciseOrder: input.exerciseOrder,
    setNumber: input.setNumber,
    setType: input.setType ?? 'working',
    ...(input.weight !== undefined ? { weight: input.weight } : {}),
    ...(input.reps !== undefined ? { reps: input.reps } : {}),
    ...(input.durationSeconds !== undefined
      ? { durationSeconds: input.durationSeconds }
      : {}),
    side: input.side ?? null,
    prTypes: [] as PRType[],
    completedAt: new Date().toISOString(),
  };
  await db.setLogs.add(log);
  return id;
}

export async function deleteSet(id: string): Promise<void> {
  await db.setLogs.delete(id);
}

/** All set logs for a session, ordered by completion time. */
export function useSessionSetLogs(
  sessionId: string | undefined,
): SetLog[] | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return [];
    return db.setLogs.where({ sessionId }).sortBy('completedAt');
  }, [sessionId]);
}
