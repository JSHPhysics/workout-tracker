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
  steps?: number;
  rpe?: number;
  notes?: string;
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
    ...(input.steps !== undefined ? { steps: input.steps } : {}),
    ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
    ...(input.notes !== undefined && input.notes.trim() !== ''
      ? { notes: input.notes.trim() }
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

export async function updateSetType(id: string, setType: SetType): Promise<void> {
  await db.setLogs.update(id, { setType });
}

/** Set or clear RPE on an existing set log. Pass null to clear.
 *
 * Dexie deletes a field when the update spec carries `undefined`, but
 * its TypeScript signatures forbid that under `exactOptionalPropertyTypes`.
 * The cast is the documented escape hatch — see DECISIONS.md milestone 7. */
export async function updateRpe(id: string, rpe: number | null): Promise<void> {
  await db.setLogs.update(id, { rpe: rpe ?? undefined } as Partial<SetLog>);
}

/** Set or clear free-text notes on an existing set log. Empty string
 * is treated as "clear". */
export async function updateNotes(id: string, notes: string): Promise<void> {
  const trimmed = notes.trim();
  await db.setLogs.update(id, {
    notes: trimmed === '' ? undefined : trimmed,
  } as Partial<SetLog>);
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

/** A subset of SetLog fields used as autofill defaults on the next
 * set / next session. */
export interface PriorSetMetric {
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  steps?: number;
}

/** Most-recent working/AMRAP/drop/failure set for a profile + exercise,
 * excluding the current session. Used to autofill the first set of an
 * exercise in a fresh session ("you did 40 kg last time → start at 40").
 *
 * Warmups are intentionally skipped: a 20 kg warmup set you logged
 * yesterday isn't what you want to start today's working set at.
 *
 * Returns:
 *   • `undefined` while loading
 *   • `null` when there is no qualifying prior set
 *   • the metric subset otherwise */
export function useMostRecentSetMetric(
  profileId: string | null | undefined,
  exerciseId: string | null | undefined,
  excludeSessionId: string,
): PriorSetMetric | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !exerciseId) return null;
    // setLogs aren't profile-scoped directly — the join goes via
    // `sessions.profileId`. Same shape as `finishSession`'s baseline
    // lookup (see DECISIONS milestone 7 / period-tracking entry).
    const profileSessions = await db.sessions
      .where({ profileId })
      .toArray();
    const profileSessionIds = new Set(profileSessions.map((s) => s.id));
    const candidates = (
      await db.setLogs.where({ exerciseId }).toArray()
    ).filter(
      (l) =>
        l.sessionId !== excludeSessionId &&
        profileSessionIds.has(l.sessionId) &&
        l.setType !== 'warmup',
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const latest = candidates[0]!;
    const out: PriorSetMetric = {};
    if (latest.weight !== undefined) out.weight = latest.weight;
    if (latest.reps !== undefined) out.reps = latest.reps;
    if (latest.durationSeconds !== undefined)
      out.durationSeconds = latest.durationSeconds;
    if (latest.steps !== undefined) out.steps = latest.steps;
    return out;
  }, [profileId, exerciseId, excludeSessionId]);
}
