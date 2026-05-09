// Storage + bump logic for ScheduledSession rows. Today reads from
// here, the plan creator (db/plans.ts) writes initial materialisation
// here, and bumps mutate plannedDate (optionally cascading to all
// later pending rows that share the planId).

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import {
  addDays,
  formatLocalDate,
  generateSchedule,
  parseLocalDate,
} from '../domain/planScheduler';
import type { ScheduledSession } from '../types';

function todayLocal(): string {
  return formatLocalDate(new Date());
}

/** Pending scheduled sessions for today's local date, for this
 * profile. Multiple are possible (e.g. two parallel plans). */
export function useTodayScheduled(
  profileId: string | null | undefined,
): ScheduledSession[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const today = todayLocal();
    const rows = await db.scheduledSessions
      .where('[profileId+plannedDate]')
      .equals([profileId, today])
      .toArray();
    // Pending only — completed / skipped don't surface again.
    return rows.filter((r) => r.status === 'pending');
  }, [profileId]);
}

/** Pending scheduled sessions whose plannedDate is strictly before
 * today. The Today screen surfaces these as "missed" with the bump-
 * or-skip prompt. */
export function useMissedScheduled(
  profileId: string | null | undefined,
): ScheduledSession[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const today = todayLocal();
    const rows = await db.scheduledSessions
      .where('[profileId+status]')
      .equals([profileId, 'pending'])
      .toArray();
    return rows
      .filter((r) => r.plannedDate < today)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  }, [profileId]);
}

/** Live row by id — used by detail / bump UI. */
export function useScheduledSession(
  id: string | undefined,
): ScheduledSession | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.scheduledSessions.get(id)) ?? null;
  }, [id]);
}

/** Mark a scheduled row as completed and link the live Session that
 * was started for it. Idempotent — re-running on an already-linked
 * row replaces sessionId with the latest.
 *
 * For rotation plans, this also rolls the schedule horizon forward:
 * if there are fewer than `ROTATION_REFILL_THRESHOLD` pending rows
 * left in the plan after completion, generate the next batch out to
 * 12 weeks past the latest existing date. Avoids the rotation
 * "running out" silently. Finite plans don't refill — when their
 * last row completes the plan is done. */
const ROTATION_REFILL_THRESHOLD = 6;
const ROTATION_REFILL_HORIZON_WEEKS = 12;
export async function markScheduledCompleted(
  scheduledId: string,
  sessionId: string,
): Promise<void> {
  await db.transaction(
    'rw',
    [db.scheduledSessions, db.workoutPlans, db.routineTemplates],
    async () => {
      const row = await db.scheduledSessions.get(scheduledId);
      if (!row) return;
      await db.scheduledSessions.update(scheduledId, {
        status: 'completed',
        sessionId,
      });

      // Roll-forward only applies to rotation plans.
      if (!row.planId) return;
      const plan = await db.workoutPlans.get(row.planId);
      if (!plan || plan.mode !== 'rotation' || plan.status !== 'active') return;

      const remaining = await db.scheduledSessions
        .where({ planId: plan.id })
        .filter((r) => r.status === 'pending')
        .count();
      if (remaining >= ROTATION_REFILL_THRESHOLD) return;

      const routine = await db.routineTemplates.get(plan.routineId);
      if (!routine) return;

      // Find the latest plannedDate in the existing schedule so we
      // know where to seed the next batch. We start one day after
      // that date so we don't double-up.
      const allRows = await db.scheduledSessions
        .where({ planId: plan.id })
        .toArray();
      let latest = plan.startDate;
      for (const r of allRows) {
        if (r.plannedDate > latest) latest = r.plannedDate;
      }
      const nextStart = formatLocalDate(addDays(parseLocalDate(latest), 1));

      const slots = generateSchedule({
        startDate: nextStart,
        mode: 'rotation',
        frequencyPerWeek: plan.frequencyPerWeek,
        preferredWeekdays: plan.preferredWeekdays,
        routine,
        horizonWeeks: ROTATION_REFILL_HORIZON_WEEKS,
      });

      const now = new Date().toISOString();
      const newRows: ScheduledSession[] = slots.map((s) => ({
        id: crypto.randomUUID(),
        profileId: plan.profileId,
        planId: plan.id,
        plannedDate: s.plannedDate,
        routineId: plan.routineId,
        weekNumber: s.weekNumber,
        dayNumber: s.dayNumber,
        status: 'pending',
        createdAt: now,
      }));
      if (newRows.length > 0) {
        await db.scheduledSessions.bulkAdd(newRows);
      }
    },
  );
}

/** Mark a scheduled row as skipped — user explicitly chose to drop
 * it rather than bump. Doesn't link to a Session. */
export async function markScheduledSkipped(
  scheduledId: string,
): Promise<void> {
  await db.scheduledSessions.update(scheduledId, { status: 'skipped' });
}

/** Bump a scheduled row's plannedDate by `deltaDays` (positive =
 * forward, negative = backward). When `cascade` is true, every
 * still-pending row sharing the same planId AND with plannedDate
 * >= the original date shifts by the same delta — so "I'm one day
 * behind, push everything back one day" is one tap.
 *
 * Cascade only includes pending rows; already-completed / skipped
 * rows stay where they are.
 *
 * Returns the number of rows touched (for telemetry / UI feedback).
 *
 * Single transaction so partial moves can't strand the schedule. */
export async function bumpScheduled(
  scheduledId: string,
  deltaDays: number,
  cascade: boolean,
): Promise<number> {
  if (deltaDays === 0) return 0;
  return db.transaction('rw', [db.scheduledSessions, db.workoutPlans], async () => {
    const target = await db.scheduledSessions.get(scheduledId);
    if (!target) return 0;
    const originalDate = target.plannedDate;
    const newDate = formatLocalDate(
      addDays(parseLocalDate(originalDate), deltaDays),
    );

    if (!cascade || !target.planId) {
      await db.scheduledSessions.update(scheduledId, { plannedDate: newDate });
      return 1;
    }

    // Cascade: shift every pending row in the same plan with
    // plannedDate >= the original by the same delta.
    const rows = await db.scheduledSessions
      .where({ planId: target.planId })
      .toArray();
    let touched = 0;
    let maxNewDate = newDate;
    for (const r of rows) {
      if (r.status !== 'pending') continue;
      if (r.plannedDate < originalDate) continue;
      const shifted = formatLocalDate(
        addDays(parseLocalDate(r.plannedDate), deltaDays),
      );
      await db.scheduledSessions.update(r.id, { plannedDate: shifted });
      if (shifted > maxNewDate) maxNewDate = shifted;
      touched += 1;
    }

    // Finite-but-elastic: extend the plan's endDate so the badge
    // matches the actual last session date (per the user's spec).
    const plan = await db.workoutPlans.get(target.planId);
    if (plan && plan.mode === 'finite' && plan.endDate) {
      const newEnd =
        plan.endDate > maxNewDate ? plan.endDate : maxNewDate;
      if (newEnd !== plan.endDate) {
        await db.workoutPlans.update(plan.id, {
          endDate: newEnd,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return touched;
  });
}

/** Cascade-skip helper for the missed-workout prompt: marks every
 * passed-in row as skipped in one transaction. Returns count. */
export async function markScheduledSkippedBulk(
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  await db.transaction('rw', db.scheduledSessions, async () => {
    for (const id of ids) {
      await db.scheduledSessions.update(id, { status: 'skipped' });
    }
  });
  return ids.length;
}

/** Cascade-bump helper for the missed-workout prompt: rebases every
 * passed-in row's plannedDate to today, and shifts every pending
 * row in the same plan(s) that comes after by the same delta.
 *
 * Implementation: for each missed row, compute its delta-to-today,
 * then bump-with-cascade. Plans are processed independently so two
 * missed sessions from different plans both end up landing today
 * even if their original dates differed. */
export async function rescheduleMissedToToday(
  missed: readonly ScheduledSession[],
): Promise<void> {
  if (missed.length === 0) return;
  const today = todayLocal();
  // Collect deltas keyed by planId so cascade only fires once per
  // plan even if multiple of its rows are in the missed batch.
  const planFirstMiss = new Map<string, ScheduledSession>();
  const orphans: ScheduledSession[] = [];
  for (const m of missed) {
    if (!m.planId) {
      orphans.push(m);
      continue;
    }
    const existing = planFirstMiss.get(m.planId);
    if (!existing || m.plannedDate < existing.plannedDate) {
      planFirstMiss.set(m.planId, m);
    }
  }

  for (const m of planFirstMiss.values()) {
    const delta = daysBetween(m.plannedDate, today);
    await bumpScheduled(m.id, delta, true);
  }
  // Plan-less one-offs: just update each in place to today.
  for (const m of orphans) {
    await db.scheduledSessions.update(m.id, { plannedDate: today });
  }
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const ms =
    parseLocalDate(toYmd).getTime() - parseLocalDate(fromYmd).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
