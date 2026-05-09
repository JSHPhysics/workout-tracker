import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useExerciseMap } from '../db/exercises';
import { useRoutines } from '../db/routines';
import { createSession } from '../db/sessions';
import {
  markScheduledCompleted,
  useScheduledInRange,
} from '../db/scheduledSessions';
import { BumpScheduledModal } from '../components/BumpScheduledModal';
import { ScheduleOneOffModal } from '../components/ScheduleOneOffModal';
import {
  addDays,
  formatLocalDate,
  parseLocalDate,
} from '../domain/planScheduler';
import type { RoutineTemplate, ScheduledSession } from '../types';

const PAST_WEEKS = 2;
const FUTURE_WEEKS = 12;

interface DayBucket {
  /** YYYY-MM-DD. */
  dateKey: string;
  /** Weekday label, short form (Mon / Tue / …). */
  weekdayShort: string;
  /** Day-of-month + month (12 May). */
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  rows: ScheduledSession[];
}

const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});
const WEEK_HEADER_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

export function Calendar() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const routines = useRoutines();
  const exerciseMap = useExerciseMap();

  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [bumpTarget, setBumpTarget] = useState<ScheduledSession | null>(null);
  const [starting, setStarting] = useState(false);

  // Range bookends — anchored on local "today" so weekend rollover
  // doesn't shift the visible window mid-render.
  const { fromDate, toDate, todayKey } = useMemo(() => {
    const today = new Date();
    const todayKey = formatLocalDate(today);
    const fromDate = formatLocalDate(addDays(today, -PAST_WEEKS * 7));
    const toDate = formatLocalDate(addDays(today, FUTURE_WEEKS * 7));
    return { fromDate, toDate, todayKey };
  }, []);

  const scheduled = useScheduledInRange(profileId, fromDate, toDate);

  const routineById = useMemo(() => {
    const m = new Map<string, RoutineTemplate>();
    for (const r of routines ?? []) m.set(r.id, r);
    return m;
  }, [routines]);

  // Build a Map from dateKey to scheduled rows for that day.
  const rowsByDate = useMemo(() => {
    const m = new Map<string, ScheduledSession[]>();
    for (const r of scheduled ?? []) {
      const arr = m.get(r.plannedDate) ?? [];
      arr.push(r);
      m.set(r.plannedDate, arr);
    }
    return m;
  }, [scheduled]);

  // Walk every day in range, grouped by Monday-anchored week.
  const weekGroups = useMemo(() => {
    const fromD = parseLocalDate(fromDate);
    // Snap fromD back to its Monday so the week header lands on a
    // sensible week-start.
    const fromWeekday = (fromD.getDay() + 6) % 7;
    const cursor = addDays(fromD, -fromWeekday);
    const toD = parseLocalDate(toDate);
    const groups: { weekStart: string; days: DayBucket[] }[] = [];
    let week = startNewWeek(cursor);
    let walker = new Date(cursor);
    while (walker <= toD) {
      // Roll over to a fresh week each Monday.
      if (walker.getDay() === 1 && week.days.length > 0) {
        groups.push(week);
        week = startNewWeek(walker);
      }
      const key = formatLocalDate(walker);
      week.days.push({
        dateKey: key,
        weekdayShort: WEEKDAY_FMT.format(walker),
        dateLabel: DATE_FMT.format(walker),
        isToday: key === todayKey,
        isPast: key < todayKey,
        rows: rowsByDate.get(key) ?? [],
      });
      walker = addDays(walker, 1);
    }
    if (week.days.length > 0) groups.push(week);
    return groups;
  }, [fromDate, toDate, todayKey, rowsByDate]);

  const navigate = useNavigate();

  const startScheduled = async (s: ScheduledSession) => {
    if (!profileId || starting) return;
    const routine = routineById.get(s.routineId);
    const week = routine?.weeks.find((w) => w.weekNumber === s.weekNumber);
    const day = week?.days.find((d) => d.dayNumber === s.dayNumber);
    if (!routine || !week || !day || day.kind !== 'workout') return;
    setStarting(true);
    try {
      const sessionId = await createSession({
        profileId,
        templateRef: {
          routineId: routine.id,
          weekNumber: week.weekNumber,
          dayNumber: day.dayNumber,
        },
        planName: `${routine.name} · W${week.weekNumber} D${day.dayNumber}${day.workoutLabel ? ` · Workout ${day.workoutLabel}` : ''}`,
        livePlan: day.blocks,
      });
      await markScheduledCompleted(s.id, sessionId);
      navigate(`/session/${sessionId}`);
    } finally {
      setStarting(false);
    }
  };

  if (!profileId) return null;
  // Suppress the loading flicker — `scheduled` and `exerciseMap` are
  // both via useLiveQuery; the page renders fine even before they
  // resolve, just with empty rows.
  void exerciseMap;

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          Forecast
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
            Calendar
          </h1>
          <button
            type="button"
            onClick={() => setOneOffOpen(true)}
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90"
          >
            + Schedule
          </button>
        </div>
        <p className="text-sm text-fg-muted">
          Last {PAST_WEEKS} weeks of context, {FUTURE_WEEKS} weeks ahead.
          Tap a session to start it; tap ↦ to bump.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {weekGroups.map((wg) => (
          <WeekGroup
            key={wg.weekStart}
            group={wg}
            routineById={routineById}
            onStart={startScheduled}
            onBump={(s) => setBumpTarget(s)}
            starting={starting}
          />
        ))}
      </div>

      {oneOffOpen && (
        <ScheduleOneOffModal
          profileId={profileId}
          onClose={() => setOneOffOpen(false)}
        />
      )}

      {bumpTarget && (
        <BumpScheduledModal
          session={bumpTarget}
          label={planSessionLabel(bumpTarget, routineById)}
          onClose={() => setBumpTarget(null)}
        />
      )}
    </section>
  );
}

function startNewWeek(monday: Date): { weekStart: string; days: DayBucket[] } {
  return { weekStart: formatLocalDate(monday), days: [] };
}

function WeekGroup({
  group,
  routineById,
  onStart,
  onBump,
  starting,
}: {
  group: { weekStart: string; days: DayBucket[] };
  routineById: Map<string, RoutineTemplate>;
  onStart: (s: ScheduledSession) => void;
  onBump: (s: ScheduledSession) => void;
  starting: boolean;
}) {
  const weekStartDate = parseLocalDate(group.weekStart);
  const weekEndDate = addDays(weekStartDate, 6);
  const weekLabel = `${WEEK_HEADER_FMT.format(weekStartDate)} – ${WEEK_HEADER_FMT.format(weekEndDate)}`;
  // A week is "interesting" when it has any rows; otherwise we still
  // render the header + day stubs so navigation / context stay
  // intact, but the day rows collapse to a thin divider.
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
        {weekLabel}
      </h2>
      <ul className="flex flex-col rounded-2xl border border-line bg-surface shadow-soft">
        {group.days.map((day, i) => (
          <DayRow
            key={day.dateKey}
            day={day}
            routineById={routineById}
            onStart={onStart}
            onBump={onBump}
            starting={starting}
            isFirst={i === 0}
            isLast={i === group.days.length - 1}
          />
        ))}
      </ul>
    </section>
  );
}

function DayRow({
  day,
  routineById,
  onStart,
  onBump,
  starting,
  isFirst,
  isLast,
}: {
  day: DayBucket;
  routineById: Map<string, RoutineTemplate>;
  onStart: (s: ScheduledSession) => void;
  onBump: (s: ScheduledSession) => void;
  starting: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const empty = day.rows.length === 0;
  return (
    <li
      className={[
        'grid grid-cols-[3rem_1fr] gap-3 px-3 transition',
        isFirst ? '' : 'border-t border-line/60',
        isLast ? '' : '',
        empty ? 'py-1.5' : 'py-2.5',
        day.isToday ? 'bg-accent-soft/40' : '',
        day.isPast ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex flex-col items-start gap-0.5 pt-0.5">
        <span
          className={[
            'text-[0.55rem] font-medium uppercase tracking-[0.18em]',
            day.isToday ? 'text-accent' : 'text-fg-muted',
          ].join(' ')}
        >
          {day.weekdayShort}
        </span>
        <span
          className={[
            'font-mono text-xs tabular-nums',
            day.isToday ? 'text-fg' : 'text-fg-muted',
          ].join(' ')}
        >
          {day.dateLabel}
        </span>
        {day.isToday && (
          <span className="text-[0.55rem] font-medium uppercase tracking-[0.18em] text-accent">
            today
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {empty && (
          <span aria-hidden className="text-[0.65rem] italic text-fg-faint">
            —
          </span>
        )}
        {day.rows.map((row) => (
          <ScheduledRow
            key={row.id}
            row={row}
            routineById={routineById}
            onStart={onStart}
            onBump={onBump}
            starting={starting}
          />
        ))}
      </div>
    </li>
  );
}

function ScheduledRow({
  row,
  routineById,
  onStart,
  onBump,
  starting,
}: {
  row: ScheduledSession;
  routineById: Map<string, RoutineTemplate>;
  onStart: (s: ScheduledSession) => void;
  onBump: (s: ScheduledSession) => void;
  starting: boolean;
}) {
  const label = planSessionLabel(row, routineById);

  // Completed → render as a subtle link to the live session detail.
  if (row.status === 'completed' && row.sessionId) {
    return (
      <Link
        to={`/session/${row.sessionId}`}
        className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-soft/60 px-2 py-1.5 text-xs text-fg-muted transition hover:border-line-strong hover:text-fg"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span aria-hidden className="text-accent">
            ✓
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span aria-hidden className="text-fg-faint">
          →
        </span>
      </Link>
    );
  }

  // Skipped → faded, not interactive.
  if (row.status === 'skipped') {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-dashed border-line bg-transparent px-2 py-1.5 text-xs italic text-fg-faint">
        <span aria-hidden>⊘</span>
        <span className="truncate">{label} · skipped</span>
      </span>
    );
  }

  // Pending → start + bump pair, same shape as Today.
  return (
    <div className="group flex items-stretch gap-1 rounded-lg border border-accent/30 bg-accent-soft pr-1">
      <button
        type="button"
        onClick={() => onStart(row)}
        disabled={starting}
        className="flex flex-1 items-center justify-between gap-2 rounded-l-lg px-2 py-1.5 text-left text-xs transition disabled:opacity-50"
      >
        <span className="truncate font-medium text-fg">{label}</span>
        <span
          aria-hidden
          className="text-accent transition group-hover:translate-x-0.5"
        >
          →
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onBump(row);
        }}
        aria-label="Bump this session"
        title="Bump"
        className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-accent transition hover:bg-accent/10"
      >
        <span aria-hidden className="text-sm leading-none">
          ↦
        </span>
      </button>
    </div>
  );
}

function planSessionLabel(
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
