import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import {
  baselinesFromHistory,
  detectPRs,
  type PRAward,
  type PriorBaselines,
} from '../domain/pr-detection';
import type {
  Block,
  PRRecord,
  PRType,
  PlannedExercise,
  Session,
  SessionTemplateRef,
  SetLog,
} from '../types';

interface CreateSessionInput {
  profileId: string;
  templateRef?: SessionTemplateRef;
  planName: string;
  /** Initial plan. Snapshot from a routine day for templated sessions;
   * `[]` for free sessions. */
  livePlan: Block[];
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    ...(input.templateRef ? { templateRef: input.templateRef } : {}),
    startedAt: new Date().toISOString(),
    completedAt: null,
    planName: input.planName,
    prCount: 0,
    livePlan: structuredClone(input.livePlan),
  };
  await db.sessions.add(session);
  return id;
}

/** Persist the pre-workout mood + energy ratings on the session.
 * `null` for either field clears that rating. Same Dexie escape
 * hatch (`Partial<Session>`) as `updateRpe`/`updateNotes` —
 * documented in DECISIONS milestone 7. */
export async function setPreWellbeing(
  sessionId: string,
  mood: number | null,
  energy: number | null,
): Promise<void> {
  await db.sessions.update(sessionId, {
    moodBefore: mood ?? undefined,
    energyBefore: energy ?? undefined,
  } as Partial<Session>);
}

/** Persist the post-workout mood + energy ratings on the session.
 * Same semantics as `setPreWellbeing`. */
export async function setPostWellbeing(
  sessionId: string,
  mood: number | null,
  energy: number | null,
): Promise<void> {
  await db.sessions.update(sessionId, {
    moodAfter: mood ?? undefined,
    energyAfter: energy ?? undefined,
  } as Partial<Session>);
}

/** Finish a session: stamp completedAt, detect any PRs across the
 * session's set logs, persist `PRRecord` rows, annotate each `SetLog`
 * with its `prTypes`, and cache `prCount` on the session. Returns the
 * award list so callers can fire the celebration UI. */
export async function finishSession(id: string): Promise<PRAward[]> {
  const completedAt = new Date().toISOString();
  return db.transaction(
    'rw',
    [db.sessions, db.setLogs, db.prRecords],
    async () => {
      const session = await db.sessions.get(id);
      if (!session) return [];

      // Sort by the planned-position triple so PR detection sees sets in
      // the order they were performed within each exercise. Dexie's
      // `toArray()` returns rows in primary-key (UUID) order, which would
      // otherwise let a heavier later set "consume" the weight PR before
      // a lighter earlier one had a chance to register.
      const setLogs = (await db.setLogs.where({ sessionId: id }).toArray()).sort(
        (a, b) =>
          a.blockOrder - b.blockOrder ||
          a.exerciseOrder - b.exerciseOrder ||
          a.setNumber - b.setNumber,
      );

      // Pull prior baselines per exercise referenced this session.
      // History is "everything for this profile that isn't this session".
      // We scope to this profile via a session-id allowlist — without
      // it the cross-exercise lookup would include other profiles'
      // setLogs and silently swallow legitimate first-session PRs
      // for any user who shares the device.
      const profileSessionIds = new Set(
        (await db.sessions.where({ profileId: session.profileId }).toArray())
          .map((s) => s.id)
          .filter((sid) => sid !== id),
      );
      const exerciseIds = Array.from(new Set(setLogs.map((s) => s.exerciseId)));
      const priorByExercise = new Map<string, PriorBaselines>();
      for (const exerciseId of exerciseIds) {
        const allHistory = await db.setLogs
          .where({ exerciseId })
          .filter((s) => s.sessionId !== id && profileSessionIds.has(s.sessionId))
          .toArray();
        const sessionVolumes = computeSessionVolumes(
          allHistory,
          session.profileId,
        );
        priorByExercise.set(
          exerciseId,
          baselinesFromHistory(allHistory, sessionVolumes),
        );
      }

      const awards = detectPRs({ setLogs, priorByExercise });

      // Group awards per setLog so each row gets a single update.
      const typesBySetLog = new Map<string, PRType[]>();
      for (const a of awards) {
        const arr = typesBySetLog.get(a.setLogId) ?? [];
        arr.push(a.type);
        typesBySetLog.set(a.setLogId, arr);
      }

      const now = completedAt;
      const prRecords: PRRecord[] = awards.map((a) => ({
        id: crypto.randomUUID(),
        profileId: session.profileId,
        exerciseId: a.exerciseId,
        type: a.type,
        value: a.value,
        achievedAt: now,
        sessionId: id,
        setLogId: a.setLogId,
      }));

      if (prRecords.length > 0) await db.prRecords.bulkAdd(prRecords);

      for (const [setLogId, prTypes] of typesBySetLog) {
        await db.setLogs.update(setLogId, { prTypes });
      }

      await db.sessions.update(id, {
        completedAt,
        prCount: awards.length,
      });

      return awards;
    },
  );
}

/** Roll up per-session, per-exercise volume from a flat history array.
 * Only working/amrap sets with both weight and reps contribute.
 *
 * NB: `profileId` is currently unused — kept on the signature so
 * cross-profile filtering can land later without churn at the call site. */
function computeSessionVolumes(
  history: readonly SetLog[],
  _profileId: string,
): number[] {
  const bySession = new Map<string, number>();
  for (const s of history) {
    if (s.setType !== 'working' && s.setType !== 'amrap') continue;
    if (typeof s.weight !== 'number' || typeof s.reps !== 'number') continue;
    if (s.weight <= 0 || s.reps <= 0) continue;
    const v = bySession.get(s.sessionId) ?? 0;
    bySession.set(s.sessionId, v + s.weight * s.reps);
  }
  return Array.from(bySession.values());
}

export async function discardSession(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.setLogs], async () => {
    await db.setLogs.where({ sessionId: id }).delete();
    await db.sessions.delete(id);
  });
}

// --- Live-plan mutators ----------------------------------------------------
//
// Each one reads the session, applies a pure mutation to a clone of
// livePlan, and writes it back. Cheap because livePlan is bounded
// (handful of blocks per day) and Dexie writes a single row.

async function withLivePlan(
  sessionId: string,
  mutator: (plan: Block[]) => Block[],
): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    const next = mutator(structuredClone(s.livePlan));
    await db.sessions.update(sessionId, { livePlan: next });
  });
}

export function appendBlock(
  sessionId: string,
  block: Block,
): Promise<void> {
  return withLivePlan(sessionId, (plan) => [...plan, block]);
}

export function setBlockSkipped(
  sessionId: string,
  blockOrder: number,
  skipped: boolean,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => (i === blockOrder ? { ...b, skipped } : b)),
  );
}

export function swapExercise(
  sessionId: string,
  blockOrder: number,
  exerciseOrder: number,
  next: PlannedExercise,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => {
      if (i !== blockOrder) return b;
      return {
        ...b,
        exercises: b.exercises.map((e, j) => (j === exerciseOrder ? next : e)),
      };
    }),
  );
}

export function changeSetCount(
  sessionId: string,
  blockOrder: number,
  exerciseOrder: number,
  delta: 1 | -1,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => {
      if (i !== blockOrder) return b;
      return {
        ...b,
        exercises: b.exercises.map((e, j) =>
          j === exerciseOrder
            ? { ...e, setCount: Math.max(1, e.setCount + delta) }
            : e,
        ),
      };
    }),
  );
}

// --- Queries ---------------------------------------------------------------

export function useSession(id: string | undefined): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.sessions.get(id)) ?? null;
  }, [id]);
}

export function useProfileSessions(
  profileId: string | null | undefined,
): Session[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const all = await db.sessions.where({ profileId }).toArray();
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [profileId]);
}

export function useActiveSession(
  profileId: string | null | undefined,
): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    const open = await db.sessions
      .where({ profileId })
      .filter((s) => s.completedAt === null)
      .toArray();
    if (open.length === 0) return null;
    open.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return open[0] ?? null;
  }, [profileId]);
}
