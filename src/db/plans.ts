// Storage + lifecycle helpers for WorkoutPlan rows. Materialisation
// of scheduled sessions lives in `db/scheduledSessions.ts`; this
// module just deals with the plan record itself.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { generateSchedule } from '../domain/planScheduler';
import type {
  PlanMode,
  RoutineTemplate,
  ScheduledSession,
  WorkoutPlan,
} from '../types';

interface CreatePlanInput {
  profileId: string;
  routine: RoutineTemplate;
  mode: PlanMode;
  frequencyPerWeek: number;
  preferredWeekdays: number[];
  /** YYYY-MM-DD; defaults to today in local TZ. */
  startDate?: string;
  /** Optional override; defaults to the routine name. */
  name?: string;
}

const ROTATION_HORIZON_WEEKS = 12;

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Create a plan and materialise its initial scheduled-session
 * batch (full schedule for finite, 12-week horizon for rotation).
 * Single Dexie transaction across both tables. Returns the new plan
 * id so the UI can route to it. */
export async function createPlan(input: CreatePlanInput): Promise<string> {
  const startDate = input.startDate ?? todayLocal();
  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  const slots = generateSchedule({
    startDate,
    mode: input.mode,
    frequencyPerWeek: input.frequencyPerWeek,
    preferredWeekdays: input.preferredWeekdays,
    routine: input.routine,
    horizonWeeks: ROTATION_HORIZON_WEEKS,
  });

  const plan: WorkoutPlan = {
    id: planId,
    profileId: input.profileId,
    name: input.name?.trim() || input.routine.name,
    routineId: input.routine.id,
    mode: input.mode,
    frequencyPerWeek: input.frequencyPerWeek,
    preferredWeekdays: [...input.preferredWeekdays],
    startDate,
    ...(input.mode === 'finite' && slots.length > 0
      ? { endDate: slots[slots.length - 1]!.plannedDate }
      : {}),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const scheduled: ScheduledSession[] = slots.map((s) => ({
    id: crypto.randomUUID(),
    profileId: input.profileId,
    planId,
    plannedDate: s.plannedDate,
    routineId: input.routine.id,
    weekNumber: s.weekNumber,
    dayNumber: s.dayNumber,
    status: 'pending',
    createdAt: now,
  }));

  await db.transaction(
    'rw',
    [db.workoutPlans, db.scheduledSessions],
    async () => {
      await db.workoutPlans.add(plan);
      if (scheduled.length > 0) {
        await db.scheduledSessions.bulkAdd(scheduled);
      }
    },
  );
  return planId;
}

/** Live list of all of this profile's plans, sorted active-first
 * then by createdAt desc within each status group. */
export function useProfilePlans(
  profileId: string | null | undefined,
): WorkoutPlan[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const rows = await db.workoutPlans.where({ profileId }).toArray();
    const order: Record<WorkoutPlan['status'], number> = {
      active: 0,
      paused: 1,
      completed: 2,
      archived: 3,
    };
    return rows.sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        b.createdAt.localeCompare(a.createdAt),
    );
  }, [profileId]);
}

export function useActivePlans(
  profileId: string | null | undefined,
): WorkoutPlan[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    return db.workoutPlans
      .where('[profileId+status]')
      .equals([profileId, 'active'])
      .toArray();
  }, [profileId]);
}

/** Update plan status. Doesn't touch scheduledSessions — pausing a
 * plan keeps its rows so resuming is just a flip. */
export async function setPlanStatus(
  planId: string,
  status: WorkoutPlan['status'],
): Promise<void> {
  await db.workoutPlans.update(planId, {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/** Wipe the plan AND every scheduledSession scoped to it. Used when
 * the user wants to abandon a plan entirely (vs pause/archive). */
export async function deletePlan(planId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.workoutPlans, db.scheduledSessions],
    async () => {
      await db.scheduledSessions.where({ planId }).delete();
      await db.workoutPlans.delete(planId);
    },
  );
}
