import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useProfilePlans, deletePlan, setPlanStatus } from '../db/plans';
import { BumpScheduledModal } from './BumpScheduledModal';
import type { RoutineTemplate, ScheduledSession, WorkoutPlan } from '../types';

interface Props {
  profileId: string;
  routineById: Map<string, RoutineTemplate>;
}

const HUMAN_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function fmtHumanDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
  return HUMAN_DATE.format(new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0));
}

/** Lookup of "next pending session per active plan" so each card
 * can show what's coming next without each card subscribing
 * separately. Returns a map keyed by planId. */
function useNextPendingByPlan(
  profileId: string | null | undefined,
): Map<string, ScheduledSession> | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return new Map();
    const rows = await db.scheduledSessions
      .where('[profileId+status]')
      .equals([profileId, 'pending'])
      .toArray();
    rows.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const out = new Map<string, ScheduledSession>();
    for (const r of rows) {
      if (!r.planId) continue;
      if (!out.has(r.planId)) out.set(r.planId, r);
    }
    return out;
  }, [profileId]);
}

/** "My plans" section for /routines. Lists active plans with their
 * next pending session, and offers pause/resume/delete + bump on the
 * upcoming session. Shown only when the profile has any plans. */
export function PlansSection({ profileId, routineById }: Props) {
  const plans = useProfilePlans(profileId);
  const nextByPlan = useNextPendingByPlan(profileId);
  const [bumpTarget, setBumpTarget] = useState<ScheduledSession | null>(null);

  const visible = useMemo(
    () =>
      (plans ?? []).filter(
        (p) => p.status === 'active' || p.status === 'paused',
      ),
    [plans],
  );

  if (plans === undefined) return null;
  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-medium">My plans</h2>
      </header>
      <ul className="flex flex-col gap-2">
        {visible.map((plan) => {
          const next = nextByPlan?.get(plan.id) ?? null;
          return (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                routineById={routineById}
                next={next}
                onBump={(s) => setBumpTarget(s)}
              />
            </li>
          );
        })}
      </ul>
      {bumpTarget && (
        <BumpScheduledModal
          session={bumpTarget}
          label={nextSessionLabel(bumpTarget, routineById)}
          onClose={() => setBumpTarget(null)}
        />
      )}
    </section>
  );
}

function nextSessionLabel(
  s: ScheduledSession,
  routineById: Map<string, RoutineTemplate>,
): string {
  const routine = routineById.get(s.routineId);
  if (!routine) return `Workout · W${s.weekNumber} D${s.dayNumber}`;
  const week = routine.weeks.find((w) => w.weekNumber === s.weekNumber);
  const day = week?.days.find((d) => d.dayNumber === s.dayNumber);
  return day?.workoutLabel
    ? `${routine.name} · Workout ${day.workoutLabel}`
    : `${routine.name} · Day ${s.dayNumber}`;
}

function PlanCard({
  plan,
  routineById,
  next,
  onBump,
}: {
  plan: WorkoutPlan;
  routineById: Map<string, RoutineTemplate>;
  next: ScheduledSession | null;
  onBump: (s: ScheduledSession) => void;
}) {
  const isActive = plan.status === 'active';
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
            {plan.mode === 'finite' ? 'Finite plan' : 'Rotation plan'}
            {!isActive && ' · Paused'}
          </span>
          <h3 className="font-display text-base font-medium leading-snug">
            {plan.name}
          </h3>
          <p className="text-[0.65rem] text-fg-muted">
            {plan.frequencyPerWeek}× per week · started{' '}
            {fmtHumanDate(plan.startDate)}
            {plan.endDate ? ` · ends ${fmtHumanDate(plan.endDate)}` : ''}
          </p>
        </div>
      </header>

      {next ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-soft px-3 py-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
              Up next
            </span>
            <span className="text-xs text-fg">
              {nextSessionLabel(next, routineById)} ·{' '}
              <span className="text-fg-muted">
                {fmtHumanDate(next.plannedDate)}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onBump(next)}
            aria-label="Bump next session"
            title="Bump"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-elevated hover:text-accent"
          >
            <span aria-hidden className="text-sm leading-none">
              ↦
            </span>
          </button>
        </div>
      ) : (
        <p className="rounded-xl bg-surface-soft/60 px-3 py-2 text-xs text-fg-muted">
          {plan.mode === 'finite'
            ? 'Plan complete — every session has been done or skipped.'
            : 'No pending sessions. The next batch will generate when you complete one.'}
        </p>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => {
            void setPlanStatus(plan.id, isActive ? 'paused' : 'active');
          }}
          className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent/40 hover:text-accent"
        >
          {isActive ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Delete the plan "${plan.name}"? This removes every still-pending session it had scheduled. Completed sessions stay in your history.`,
              )
            ) {
              void deletePlan(plan.id);
            }
          }}
          className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent/40 hover:text-accent"
        >
          Delete
        </button>
      </div>
    </article>
  );
}
