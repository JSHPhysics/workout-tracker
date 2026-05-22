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
  /** ISO 8601 datetime to use as `startedAt`. Defaults to now.
   * Used by the History "Log past workout" flow to backfill a workout
   * the user did but didn't log on the day. */
  startedAt?: string;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    ...(input.templateRef ? { templateRef: input.templateRef } : {}),
    startedAt: input.startedAt ?? new Date().toISOString(),
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
 * award list so callers can fire the celebration UI.
 *
 * Retrospective sessions (started > 12h ago — the History "Log past
 * workout" path) get `completedAt = startedAt + 60min` instead of
 * `now`, so the timeline + duration display in History reflect the
 * date the workout actually happened rather than when the user
 * happened to log it. */
const RETRO_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const RETRO_DEFAULT_DURATION_MS = 60 * 60 * 1000;

export async function finishSession(id: string): Promise<PRAward[]> {
  return db.transaction(
    'rw',
    [db.sessions, db.setLogs, db.prRecords],
    async () => {
      const session = await db.sessions.get(id);
      if (!session) return [];

      const startedAtMs = Date.parse(session.startedAt);
      const nowMs = Date.now();
      const completedAt =
        nowMs - startedAtMs > RETRO_THRESHOLD_MS
          ? new Date(startedAtMs + RETRO_DEFAULT_DURATION_MS).toISOString()
          : new Date(nowMs).toISOString();

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

/** Permanently delete a *completed* session: the session row, every
 * set log scoped to it, and every PRRecord whose sessionId points at
 * it. Single transaction across the three tables so we can't end up
 * with orphan PRs pointing at a missing session.
 *
 * Used by the History detail "Delete workout" action. Caller is
 * responsible for confirmation (no soft-delete; the user has the
 * JSON backup as their safety net).
 *
 * Note: `prRecords` is not indexed by sessionId (the schema only
 * indexes profileId + exerciseId + type). `where({sessionId})` would
 * throw SchemaError and silently abort the whole transaction —
 * historically that's why this helper looked like it was working but
 * left every row in place. Use `.filter()` for the non-indexed lookup
 * instead; full scan is fine at household scale. */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.setLogs, db.prRecords],
    async () => {
      await db.setLogs.where({ sessionId: id }).delete();
      await db.prRecords.filter((r) => r.sessionId === id).delete();
      await db.sessions.delete(id);
    },
  );
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

// --- Warm-up generator -----------------------------------------------------

interface WarmupSpec {
  /** Snapped weight (kg or lb) for this warm-up set. */
  weight: number;
  /** Reps for this warm-up set. */
  reps: number;
}

/** Stash N suggested warm-up sets on the planned exercise and bump
 * `setCount` so they occupy setNumbers 1..N (planned working sets
 * reflow to N+1..M).
 *
 * Importantly we do **not** pre-log SetLog rows: SetRow treats a
 * present SetLog as "this set is completed" — pre-logging would render
 * the warm-ups as already-ticked, and an Undo would lose the suggested
 * weight to the autofill working weight. By keeping the suggestion on
 * the plan instead, the row stays empty/un-ticked with the suggested
 * weight pre-filled in the stepper; tick → real SetLog → undo →
 * stepper falls back to the suggestion again.
 *
 * Caller is expected to gate this so it only runs when no warm-ups
 * exist yet *and* no logs for the slot — both prevent the renumbering
 * pain that comes from inserting at the head of an in-progress set
 * list. */
export async function addWarmupSets(
  sessionId: string,
  blockOrder: number,
  exerciseOrder: number,
  warmups: WarmupSpec[],
  targetWeight?: number,
): Promise<void> {
  if (warmups.length === 0) return;
  await db.transaction('rw', db.sessions, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return;
    const block = session.livePlan[blockOrder];
    const planned = block?.exercises[exerciseOrder];
    if (!planned) return;

    const nextPlan = structuredClone(session.livePlan);
    const slot = nextPlan[blockOrder]!.exercises[exerciseOrder]!;
    slot.warmupSets = warmups.map((w) => ({ weight: w.weight, reps: w.reps }));
    slot.setCount = slot.setCount + warmups.length;
    // Persist the working weight the user warmed up to so the
    // working-set rows pre-fill to it. Only when it's a real positive
    // — caller typically passes the modal's target verbatim.
    if (typeof targetWeight === 'number' && targetWeight > 0) {
      slot.targetWeight = targetWeight;
    }
    await db.sessions.update(sessionId, { livePlan: nextPlan });
  });
}

// --- Retrospective set-log timestamp repair --------------------------------

/** Detect set logs whose `completedAt` is well after the parent
 * session's `completedAt` and rebase them to the session's
 * `startedAt + i*60s`. This recovers data corrupted by the
 * pre-fix `logSet`, which always wrote `completedAt = new Date()`
 * regardless of the parent session's startedAt — so retrospective
 * ticks ended up timestamped to "today" instead of the workout's
 * actual date, collapsing them into one chart bucket.
 *
 * Heuristic: a setLog whose completedAt is more than 1h after its
 * session's completedAt was clearly logged after the session
 * "finished", which only happens for retrospective sessions ticked
 * with buggy code. Live sessions never produce this pattern (the
 * Finish button stamps completedAt = now, after every tick).
 *
 * Idempotent — safe to call on every boot. Returns the number of
 * rows it touched (for telemetry / console logging). */
const REPAIR_LOOKAHEAD_MS = 60 * 60 * 1000;
/** Rewrite every reference to an aliased exercise id over to its
 * canonical id. Runs once on every boot (idempotent — once nothing
 * matches the alias map, subsequent runs are O(rows) and write
 * nothing).
 *
 * Affected tables:
 *   - setLogs.exerciseId (direct field)
 *   - prRecords.exerciseId
 *   - sessions.livePlan (JSON, deep walk through every PlannedExercise)
 *   - routineTemplates (custom only — seed routines get replaced
 *     by the seed-loader on the same boot)
 *   - muscleVolumeOverrides — id collisions handled by keeping the
 *     canonical row; the aliased row is dropped
 *   - exerciseRestPrefs — same collision handling
 *   - exerciseHoldPrefs — same collision handling
 *
 * Returns the number of rows touched (for telemetry / console). */
export async function consolidateAliasedExercises(): Promise<number> {
  // Lazy import so the boot module doesn't pull this in eagerly.
  const { EXERCISE_ALIASES } = await import('../seed/exerciseAliases');
  const aliasIds = new Set(Object.keys(EXERCISE_ALIASES));
  if (aliasIds.size === 0) return 0;

  let touched = 0;

  // 1. setLogs — flat field rewrite.
  const aliasedSetLogs = await db.setLogs
    .filter((l) => aliasIds.has(l.exerciseId))
    .toArray();
  for (const sl of aliasedSetLogs) {
    const canonical = EXERCISE_ALIASES[sl.exerciseId]!;
    await db.setLogs.update(sl.id, { exerciseId: canonical });
    touched += 1;
  }

  // 2. prRecords — flat field rewrite.
  const aliasedPrs = await db.prRecords
    .filter((r) => aliasIds.has(r.exerciseId))
    .toArray();
  for (const pr of aliasedPrs) {
    const canonical = EXERCISE_ALIASES[pr.exerciseId]!;
    await db.prRecords.update(pr.id, { exerciseId: canonical });
    touched += 1;
  }

  // 3. sessions.livePlan — JSON deep walk.
  const allSessions = await db.sessions.toArray();
  for (const s of allSessions) {
    let needsUpdate = false;
    const newPlan: Block[] = s.livePlan.map((block) => ({
      ...block,
      exercises: block.exercises.map((ex) => {
        if (aliasIds.has(ex.exerciseId)) {
          needsUpdate = true;
          return { ...ex, exerciseId: EXERCISE_ALIASES[ex.exerciseId]! };
        }
        return ex;
      }),
    }));
    if (needsUpdate) {
      await db.sessions.update(s.id, { livePlan: newPlan });
      touched += 1;
    }
  }

  // 4. Custom routines (isSeed === false) — same JSON walk as
  // sessions.livePlan. Seed routines are replaced by the seed-
  // loader on the same boot so they don't need migrating.
  const customRoutines = await db.routineTemplates
    .filter((r) => !r.isSeed)
    .toArray();
  for (const r of customRoutines) {
    let needsUpdate = false;
    const newWeeks = r.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((ex) => {
            if (aliasIds.has(ex.exerciseId)) {
              needsUpdate = true;
              return { ...ex, exerciseId: EXERCISE_ALIASES[ex.exerciseId]! };
            }
            return ex;
          }),
        })),
      })),
    }));
    if (needsUpdate) {
      await db.routineTemplates.update(r.id, {
        weeks: newWeeks,
        updatedAt: new Date().toISOString(),
      });
      touched += 1;
    }
  }

  // 5. muscleVolumeOverrides — per-pair table. Collision-safe: if
  // the canonical row already exists, drop the aliased one rather
  // than overwriting the user's canonical-side customisations.
  const aliasedOverrides = await db.muscleVolumeOverrides
    .filter((o) => aliasIds.has(o.exerciseId))
    .toArray();
  for (const o of aliasedOverrides) {
    const canonical = EXERCISE_ALIASES[o.exerciseId]!;
    const newPrimaryKey = `${o.profileId}-${canonical}`;
    const existing = await db.muscleVolumeOverrides.get(newPrimaryKey);
    if (existing) {
      // Canonical wins; drop the orphan.
      await db.muscleVolumeOverrides.delete(o.id);
    } else {
      // Migrate by deleting the aliased row and re-inserting under the
      // canonical id (the synthetic id changes too).
      await db.muscleVolumeOverrides.delete(o.id);
      await db.muscleVolumeOverrides.put({
        id: newPrimaryKey,
        profileId: o.profileId,
        exerciseId: canonical,
        weights: o.weights,
        updatedAt: o.updatedAt,
      });
    }
    touched += 1;
  }

  // 6. exerciseRestPrefs — same shape as muscleVolumeOverrides.
  const aliasedRest = await db.exerciseRestPrefs
    .filter((p) => aliasIds.has(p.exerciseId))
    .toArray();
  for (const p of aliasedRest) {
    const canonical = EXERCISE_ALIASES[p.exerciseId]!;
    const newPrimaryKey = `${p.profileId}-${canonical}`;
    const existing = await db.exerciseRestPrefs.get(newPrimaryKey);
    if (existing) {
      await db.exerciseRestPrefs.delete(p.id);
    } else {
      await db.exerciseRestPrefs.delete(p.id);
      await db.exerciseRestPrefs.put({
        id: newPrimaryKey,
        profileId: p.profileId,
        exerciseId: canonical,
        restSeconds: p.restSeconds,
        updatedAt: p.updatedAt,
      });
    }
    touched += 1;
  }

  // 7. exerciseHoldPrefs — same per-pair collision handling as rest.
  const aliasedHold = await db.exerciseHoldPrefs
    .filter((p) => aliasIds.has(p.exerciseId))
    .toArray();
  for (const p of aliasedHold) {
    const canonical = EXERCISE_ALIASES[p.exerciseId]!;
    const newPrimaryKey = `${p.profileId}-${canonical}`;
    const existing = await db.exerciseHoldPrefs.get(newPrimaryKey);
    if (existing) {
      await db.exerciseHoldPrefs.delete(p.id);
    } else {
      await db.exerciseHoldPrefs.delete(p.id);
      await db.exerciseHoldPrefs.put({
        id: newPrimaryKey,
        profileId: p.profileId,
        exerciseId: canonical,
        holdSeconds: p.holdSeconds,
        updatedAt: p.updatedAt,
      });
    }
    touched += 1;
  }

  return touched;
}

export async function repairRetrospectiveSetTimestamps(): Promise<number> {
  let fixed = 0;
  const allSessions = await db.sessions.toArray();
  for (const session of allSessions) {
    if (!session.completedAt) continue;
    const sessionEndMs = Date.parse(session.completedAt);
    const startedMs = Date.parse(session.startedAt);
    const setLogs = await db.setLogs
      .where({ sessionId: session.id })
      .sortBy('setNumber');
    // Find logs whose completedAt is far enough after session end
    // that they couldn't have been part of the live workout.
    const buggy = setLogs.filter(
      (l) => Date.parse(l.completedAt) > sessionEndMs + REPAIR_LOOKAHEAD_MS,
    );
    if (buggy.length === 0) continue;
    // Rebase every buggy log to startedAt + (its position+1) * 60s.
    // We use position in the FULL setLogs list (not just the buggy
    // subset) so ordering matches the user's intended set sequence.
    for (let i = 0; i < setLogs.length; i++) {
      const log = setLogs[i]!;
      if (!buggy.includes(log)) continue;
      const newCompletedAt = new Date(
        startedMs + (i + 1) * 60 * 1000,
      ).toISOString();
      await db.setLogs.update(log.id, { completedAt: newCompletedAt });
      fixed += 1;
    }
  }
  return fixed;
}

// --- Completion count -----------------------------------------------------

/** How many completed sessions on this profile share this session's
 * routine + day-within-routine — i.e. "this is your Nth time doing
 * Workout A from StrongLifts 5×5". Used in the share-text headline.
 *
 * Identity is keyed off `templateRef.routineId + dayNumber` (NOT the
 * planName), so the count survives:
 *   • renaming the routine
 *   • mid-workout edits to the live plan (swap exercises, add sets,
 *     skip blocks) — `templateRef` is set at session creation and
 *     never modified after
 *   • forking / customising the template before starting
 *
 * For free sessions (no templateRef), there's no shared identity to
 * group by, so we return null. The share formatter omits the
 * completion-count headline in that case.
 *
 * Includes the passed-in session in the count when it's completed —
 * the count is "this is your Nth", not "you've previously done it
 * N times". An in-progress session is excluded; the share button is
 * gated on completion anyway. */
export async function getCompletionCount(
  profileId: string,
  session: Session,
): Promise<number | null> {
  if (!session.templateRef) return null;
  const { routineId, dayNumber } = session.templateRef;
  const all = await db.sessions.where({ profileId }).toArray();
  let count = 0;
  for (const s of all) {
    if (s.completedAt === null) continue;
    if (!s.templateRef) continue;
    if (s.templateRef.routineId !== routineId) continue;
    if (s.templateRef.dayNumber !== dayNumber) continue;
    count += 1;
  }
  return count;
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
