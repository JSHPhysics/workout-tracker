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
  /** Distance in metres — used by `'distance'`-type cardio exercises. */
  distance?: number;
  rpe?: number;
  notes?: string;
  side?: 'left' | 'right' | null;
}

export async function logSet(input: LogSetInput): Promise<string> {
  const id = crypto.randomUUID();
  const completedAt = await deriveCompletedAt(input.sessionId);
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
    ...(input.distance !== undefined ? { distance: input.distance } : {}),
    ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
    ...(input.notes !== undefined && input.notes.trim() !== ''
      ? { notes: input.notes.trim() }
      : {}),
    side: input.side ?? null,
    prTypes: [] as PRType[],
    completedAt,
  };
  await db.setLogs.add(log);
  return id;
}

/** Threshold for treating a session as "retrospective" — the user
 * is back-filling a workout from a previous day rather than ticking
 * sets in real time. Mirrors the constants in db/sessions.ts and
 * screens/Session.tsx. */
const RETRO_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/** Compute the right `completedAt` for a new SetLog. For live
 * sessions (started <= 12h ago) this is `now` — same as the original
 * single-line behaviour. For retrospective sessions the chart buckets
 * by `setLog.completedAt`; using `now` for sets that belong to a
 * past workout collapses every retrospective tick into "today",
 * silently breaking the per-exercise chart. Use the session's
 * `startedAt` instead, with a small ascending offset so ordering is
 * preserved across multiple ticks in quick succession. */
async function deriveCompletedAt(sessionId: string): Promise<string> {
  const session = await db.sessions.get(sessionId);
  if (!session) return new Date().toISOString();
  const startedMs = Date.parse(session.startedAt);
  const nowMs = Date.now();
  if (nowMs - startedMs <= RETRO_THRESHOLD_MS) {
    return new Date(nowMs).toISOString();
  }
  const existingCount = await db.setLogs.where({ sessionId }).count();
  // +60s per existing set so the order matches the order the user
  // ticked them in. After ~60 ticks the offset crosses into the
  // session's nominal "next hour" — that's fine; the date is what
  // the chart cares about.
  return new Date(startedMs + (existingCount + 1) * 60 * 1000).toISOString();
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

/** Patch the metric fields (weight, reps, durationSeconds, steps) on
 * an existing set log. Used by the in-row Save action when the user
 * has corrected a value on an already-logged set — e.g. fixing a row
 * that saved as 0 kg by accident.
 *
 * NOTE: this does NOT re-run PR detection. PRs are derived state
 * (CLAUDE.md) — recomputable from set logs whenever — but right now
 * an edit that newly creates / invalidates a PR will leave the
 * cached `prCount` + `PRRecord` rows stale. Acceptable v1 trade-off;
 * a "Recompute PRs for this session" action can fix drift later. */
export async function updateSetMetrics(
  id: string,
  patch: {
    weight?: number;
    reps?: number;
    durationSeconds?: number;
    steps?: number;
    distance?: number;
  },
): Promise<void> {
  // Build the update spec so absent fields stay absent on the row;
  // we don't want to write `weight: undefined` and accidentally
  // create the field on a bodyweight-rep set, etc.
  const spec: Partial<SetLog> = {};
  if (patch.weight !== undefined) spec.weight = patch.weight;
  if (patch.reps !== undefined) spec.reps = patch.reps;
  if (patch.durationSeconds !== undefined) {
    spec.durationSeconds = patch.durationSeconds;
  }
  if (patch.steps !== undefined) spec.steps = patch.steps;
  if (patch.distance !== undefined) spec.distance = patch.distance;
  await db.setLogs.update(id, spec);
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
  distance?: number;
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
    if (latest.distance !== undefined) out.distance = latest.distance;
    return out;
  }, [profileId, exerciseId, excludeSessionId]);
}
