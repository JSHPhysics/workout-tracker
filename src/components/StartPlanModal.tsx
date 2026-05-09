import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPlan } from '../db/plans';
import { generateSchedule } from '../domain/planScheduler';
import type { PlanMode, RoutineTemplate } from '../types';

interface Props {
  profileId: string;
  routine: RoutineTemplate;
  onClose: () => void;
}

const WEEKDAY_LABELS: { value: number; short: string; full: string }[] = [
  { value: 1, short: 'M', full: 'Monday' },
  { value: 2, short: 'T', full: 'Tuesday' },
  { value: 3, short: 'W', full: 'Wednesday' },
  { value: 4, short: 'T', full: 'Thursday' },
  { value: 5, short: 'F', full: 'Friday' },
  { value: 6, short: 'S', full: 'Saturday' },
  { value: 0, short: 'S', full: 'Sunday' },
];

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Bottom-sheet modal that turns a routine into an active plan. The
 * user picks: mode (finite/rotation), frequency, preferred weekdays,
 * start date. We render a live preview of the first few generated
 * dates so the choice feels concrete. On submit createPlan()
 * materialises the schedule and we route to /today where it'll
 * surface. */
export function StartPlanModal({ profileId, routine, onClose }: Props) {
  const navigate = useNavigate();

  // Default mode: finite if the routine has a clear endpoint
  // (multiple weeks of distinct content); rotation otherwise.
  const defaultMode: PlanMode = routine.weeks.length > 1 ? 'finite' : 'rotation';
  const [mode, setMode] = useState<PlanMode>(defaultMode);
  const [frequency, setFrequency] = useState<number>(3);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]); // M/W/F
  const [startDate, setStartDate] = useState<string>(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Live preview of the first three generated dates.
  const preview = useMemo(() => {
    const slots = generateSchedule({
      startDate,
      mode,
      frequencyPerWeek: frequency,
      preferredWeekdays: weekdays,
      routine,
      horizonWeeks: 2,
    });
    return slots.slice(0, 3);
  }, [startDate, mode, frequency, weekdays, routine]);

  const toggleWeekday = (n: number) => {
    setWeekdays((cur) =>
      cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort(),
    );
  };

  const submit = async () => {
    if (busy) return;
    if (weekdays.length === 0) {
      setError('Pick at least one day per week.');
      return;
    }
    if (frequency < 1) {
      setError('Frequency must be at least 1 session per week.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createPlan({
        profileId,
        routine,
        mode,
        frequencyPerWeek: frequency,
        preferredWeekdays: weekdays,
        startDate,
      });
      navigate('/today');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Frequency follows the number of selected weekdays — keeps the
  // two in sync without making the user manage both. If the user
  // explicitly bumps frequency above selected count, weekdays
  // auto-distribute. Below: trim selection.
  const onFrequencyChange = (n: number) => {
    setFrequency(n);
    if (weekdays.length > n) {
      setWeekdays(weekdays.slice(0, n));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Start ${routine.name} as a plan`}
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Start a plan
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {routine.name}
          </h2>
          <p className="text-sm text-fg-muted">
            We&apos;ll schedule the workouts for you. You can bump
            individual sessions or pause the whole plan later.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Mode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <ModePill
              active={mode === 'finite'}
              onClick={() => setMode('finite')}
              title="Finite"
              sub={`Walk through ${routine.weeks.length} week${routine.weeks.length === 1 ? '' : 's'} then complete. Bumps push the end date.`}
            />
            <ModePill
              active={mode === 'rotation'}
              onClick={() => setMode('rotation')}
              title="Rotation"
              sub="Cycle through workouts indefinitely. Good for ongoing programs like StrongLifts."
            />
          </div>
        </section>

        <section className="flex items-center justify-between gap-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Sessions per week
          </span>
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onFrequencyChange(n)}
                aria-pressed={frequency === n}
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition',
                  frequency === n
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-line bg-surface-soft text-fg-muted hover:border-line-strong hover:text-fg',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Days of the week
          </span>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((d) => {
              const active = weekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  aria-pressed={active}
                  aria-label={d.full}
                  title={d.full}
                  className={[
                    'flex h-9 items-center justify-center rounded-full border text-xs font-medium transition',
                    active
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-line bg-surface-soft text-fg-muted hover:border-line-strong hover:text-fg',
                  ].join(' ')}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <p className="text-[0.65rem] text-fg-muted">
            {weekdays.length === 0
              ? 'Pick at least one day.'
              : `${weekdays.length} day${weekdays.length === 1 ? '' : 's'} selected.`}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="plan-start-date"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Start date
          </label>
          <input
            id="plan-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          />
        </section>

        {preview.length > 0 && (
          <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface-soft p-3">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
              First sessions
            </span>
            <ul className="flex flex-col gap-0.5 text-xs text-fg">
              {preview.map((s, i) => (
                <li key={i} className="flex justify-between tabular-nums">
                  <span>{formatPreviewDate(s.plannedDate)}</span>
                  <span className="text-fg-muted">
                    Week {s.weekNumber}, Day {s.dayNumber}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p className="text-xs text-accent" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || weekdays.length === 0}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Start plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModePill({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex flex-col items-start gap-0.5 rounded-2xl border bg-surface px-3 py-2 text-left text-xs transition',
        active
          ? 'border-accent shadow-soft'
          : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
      ].join(' ')}
    >
      <span className={active ? 'font-medium text-fg' : 'font-medium'}>
        {title}
      </span>
      <span className="text-[0.65rem] text-fg-muted">{sub}</span>
    </button>
  );
}

const PREVIEW_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function formatPreviewDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
  return PREVIEW_FMT.format(new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0));
}
