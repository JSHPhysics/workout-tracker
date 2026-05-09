import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useActiveSession, createSession } from '../db/sessions';
import { useRoutines } from '../db/routines';
import { useFavouriteRoutineIds } from '../db/favouriteRoutines';
import {
  markScheduledCompleted,
  markScheduledSkippedBulk,
  rescheduleMissedToToday,
  useMissedScheduled,
  useTodayScheduled,
} from '../db/scheduledSessions';
import { useProfile } from '../db/profiles';
import { useCyclePhaseToday } from '../db/period';
import { CycleChip } from '../components/CycleChip';
import { ElapsedTime } from '../components/ElapsedTime';
import { PeriodLogModal } from '../components/PeriodLogModal';
import type { RoutineTemplate, ScheduledSession } from '../types';

const FREE_SESSION_LABEL = (() => {
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return () => `Free session · ${fmt.format(new Date())}`;
})();

export function Today() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const activeSession = useActiveSession(profileId);
  const routines = useRoutines();
  const favourites = useFavouriteRoutineIds(profileId);
  const todayScheduled = useTodayScheduled(profileId);
  const missedScheduled = useMissedScheduled(profileId);
  const profile = useProfile(profileId);
  const cycleToday = useCyclePhaseToday(profileId);

  // Index routines by id for quick lookup when rendering scheduled
  // rows. Cheap — there are only ever a handful of routines.
  const routineById = useMemo(() => {
    const m = new Map<string, RoutineTemplate>();
    for (const r of routines ?? []) m.set(r.id, r);
    return m;
  }, [routines]);

  // Favourites sort first (alphabetical within each group). Stable
  // ordering — favourites toggle reactively without the list jumping.
  const sortedRoutines = useMemo(() => {
    if (!routines) return undefined;
    const favSet = favourites ?? new Set<string>();
    return [...routines].sort((a, b) => {
      const aFav = favSet.has(a.id) ? 0 : 1;
      const bFav = favSet.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [routines, favourites]);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const periodTrackingOn = profile?.periodTrackingEnabled ?? false;

  const startFree = async () => {
    if (!profileId || starting) return;
    setStarting(true);
    try {
      const id = await createSession({
        profileId,
        planName: FREE_SESSION_LABEL(),
        livePlan: [],
      });
      navigate(`/session/${id}`);
    } finally {
      setStarting(false);
    }
  };

  /** Start the actual workout for a scheduled-session row. Creates a
   * Session against the routine's day template, links the schedule
   * row to the new Session id, and routes to /session/:id. */
  const startScheduled = async (s: ScheduledSession) => {
    if (!profileId || starting) return;
    const routine = routineById.get(s.routineId);
    if (!routine) return;
    const week = routine.weeks.find((w) => w.weekNumber === s.weekNumber);
    const day = week?.days.find((d) => d.dayNumber === s.dayNumber);
    if (!day || day.kind !== 'workout') return;
    setStarting(true);
    try {
      const sessionId = await createSession({
        profileId,
        templateRef: {
          routineId: routine.id,
          weekNumber: week!.weekNumber,
          dayNumber: day.dayNumber,
        },
        planName: `${routine.name} · W${week!.weekNumber} D${day.dayNumber}${day.workoutLabel ? ` · Workout ${day.workoutLabel}` : ''}`,
        livePlan: day.blocks,
      });
      await markScheduledCompleted(s.id, sessionId);
      navigate(`/session/${sessionId}`);
    } finally {
      setStarting(false);
    }
  };

  const dismissMissed = async (rows: readonly ScheduledSession[]) => {
    await markScheduledSkippedBulk(rows.map((r) => r.id));
  };

  const bumpMissedToToday = async (rows: readonly ScheduledSession[]) => {
    await rescheduleMissedToToday(rows);
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          On the floor
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          Today
        </h1>
        <p className="text-sm text-fg-muted">
          Pick up an open session, or start a fresh workout from a routine.
        </p>
        {periodTrackingOn && (
          <div className="-mt-0.5 flex flex-wrap gap-2">
            {cycleToday ? (
              <CycleChip
                phase={cycleToday.phase}
                dayOfCycle={cycleToday.dayOfCycle}
                {...(cycleToday.overdue ? { overdue: true } : {})}
                asButton
                onClick={() => setPeriodModalOpen(true)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPeriodModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted transition hover:border-accent hover:text-accent"
              >
                + Log period
              </button>
            )}
          </div>
        )}
      </header>

      {activeSession && (
        <Link
          to={`/session/${activeSession.id}`}
          className="group block rounded-2xl border border-accent/40 bg-accent-soft p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
            Resume
          </span>
          <h2 className="mt-1 font-display text-xl font-medium leading-snug tracking-tight">
            {activeSession.planName}
          </h2>
          <p className="mt-2 text-xs text-fg-muted">
            Started{' '}
            <ElapsedTime
              startedAt={activeSession.startedAt}
              className="text-fg-muted"
            />{' '}
            ago
          </p>
        </Link>
      )}

      {missedScheduled && missedScheduled.length > 0 && (
        <MissedWorkoutsCard
          rows={missedScheduled}
          routineById={routineById}
          onSkip={() => void dismissMissed(missedScheduled)}
          onBumpAll={() => void bumpMissedToToday(missedScheduled)}
        />
      )}

      {todayScheduled && todayScheduled.length > 0 && (
        <TodayPlanSection
          rows={todayScheduled}
          routineById={routineById}
          onStart={startScheduled}
          starting={starting}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {activeSession ? 'Or start fresh' : 'Pick a routine'}
        </span>
        {sortedRoutines === undefined ? (
          <div
            aria-hidden
            className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRoutines.map((r) => {
              const fav = favourites?.has(r.id) ?? false;
              return (
                <li key={r.id}>
                  <Link
                    to={`/routines/${r.id}`}
                    className="group flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-soft"
                  >
                    <span className="flex items-center gap-2">
                      {fav && (
                        <span
                          aria-label="Favourite"
                          title="Favourite"
                          className="text-sm leading-none text-accent"
                        >
                          ★
                        </span>
                      )}
                      <span className="font-medium text-fg">{r.name}</span>
                    </span>
                    <span
                      aria-hidden
                      className="text-fg-faint transition group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Or wing it
        </span>
        <button
          type="button"
          onClick={startFree}
          disabled={starting || !profileId}
          className="group flex items-center justify-between rounded-xl border border-dashed border-line-strong bg-surface-soft/40 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft disabled:opacity-50"
        >
          <span className="flex flex-col">
            <span className="font-medium text-fg">
              {starting ? 'Starting…' : 'Free session'}
            </span>
            <span className="text-xs text-fg-muted">
              No template — add exercises as you go.
            </span>
          </span>
          <span
            aria-hidden
            className="text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </button>
        <Link
          to="/routines/new"
          className="group flex items-center justify-between rounded-xl border border-dashed border-line-strong bg-surface-soft/40 px-4 py-3 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft"
        >
          <span className="flex flex-col">
            <span className="font-medium text-fg">Build a template</span>
            <span className="text-xs text-fg-muted">
              Compose your own routine — exercises, set/rep ranges, save.
            </span>
          </span>
          <span
            aria-hidden
            className="text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </Link>
        <Link
          to="/timers"
          className="group flex items-center justify-between rounded-xl border border-line bg-surface-soft/40 px-4 py-3 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft"
        >
          <span className="flex flex-col">
            <span className="font-medium text-fg">Timers</span>
            <span className="text-xs text-fg-muted">
              Stopwatch · countdown · EMOM / Tabata.
            </span>
          </span>
          <span
            aria-hidden
            className="text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </Link>
      </div>

      {periodModalOpen && profileId && (
        <PeriodLogModal
          profileId={profileId}
          onClose={() => setPeriodModalOpen(false)}
        />
      )}
    </section>
  );
}

// --- Plan-driven Today sections --------------------------------------------

function planSessionLabel(
  s: ScheduledSession,
  routineById: Map<string, RoutineTemplate>,
): string {
  const routine = routineById.get(s.routineId);
  if (!routine) return `Workout · W${s.weekNumber} D${s.dayNumber}`;
  const week = routine.weeks.find((w) => w.weekNumber === s.weekNumber);
  const day = week?.days.find((d) => d.dayNumber === s.dayNumber);
  const dayPart = day?.workoutLabel
    ? `Workout ${day.workoutLabel}`
    : `Day ${s.dayNumber}`;
  return `${routine.name} · ${dayPart}`;
}

function TodayPlanSection({
  rows,
  routineById,
  onStart,
  starting,
}: {
  rows: ScheduledSession[];
  routineById: Map<string, RoutineTemplate>;
  onStart: (s: ScheduledSession) => void;
  starting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
        Today&apos;s plan
      </span>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onStart(row)}
              disabled={starting}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-50"
            >
              <span className="flex flex-col">
                <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-accent">
                  Scheduled
                </span>
                <span className="font-medium leading-snug text-fg">
                  {planSessionLabel(row, routineById)}
                </span>
              </span>
              <span
                aria-hidden
                className="text-accent transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MISSED_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function MissedWorkoutsCard({
  rows,
  routineById,
  onSkip,
  onBumpAll,
}: {
  rows: ScheduledSession[];
  routineById: Map<string, RoutineTemplate>;
  onSkip: () => void;
  onBumpAll: () => void;
}) {
  const fmtDate = (yyyymmdd: string): string => {
    const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
    return MISSED_DATE_FMT.format(
      new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0),
    );
  };
  const count = rows.length;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-soft p-4 shadow-soft">
      <header className="flex flex-col gap-1">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Missed
        </span>
        <h2 className="font-display text-base font-medium leading-snug">
          {count === 1
            ? `1 workout was scheduled but missed`
            : `${count} workouts were scheduled but missed`}
        </h2>
        <p className="text-xs text-fg-muted">
          Mark them skipped and move on, or bump them to today and shift
          the rest of your schedule forwards to match.
        </p>
      </header>
      <ul className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-3 py-2">
        {rows.slice(0, 4).map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 text-xs text-fg"
          >
            <span className="text-fg-muted tabular-nums">
              {fmtDate(r.plannedDate)}
            </span>
            <span className="truncate text-right">
              {planSessionLabel(r, routineById)}
            </span>
          </li>
        ))}
        {rows.length > 4 && (
          <li className="text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
            + {rows.length - 4} more
          </li>
        )}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
        >
          Skip {count === 1 ? 'it' : 'them'}
        </button>
        <button
          type="button"
          onClick={onBumpAll}
          className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90"
        >
          Bump to today
        </button>
      </div>
    </article>
  );
}
