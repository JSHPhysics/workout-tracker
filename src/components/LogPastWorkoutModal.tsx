import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../db/sessions';
import { useRoutines } from '../db/routines';
import type {
  Block,
  DayTemplate,
  RoutineTemplate,
  SessionTemplateRef,
} from '../types';

interface Props {
  profileId: string;
  onClose: () => void;
}

interface PlanOption {
  /** Stable key for the <select>. */
  key: string;
  /** Human label for the dropdown row. */
  label: string;
  /** `null` for the "Free workout" option. */
  templateRef: SessionTemplateRef | null;
  /** `null` for free; the routine-day blocks otherwise (snapshotted
   * into the new session's livePlan). */
  blocks: Block[] | null;
  /** Display name persisted on the new session, mirroring the format
   * RoutineDetail uses when starting a session for real. */
  planName: string;
}

const FREE_KEY = '__free__';

/** Bottom-sheet modal that backfills a workout into history. The user
 * picks the date the workout actually happened plus a plan (routine +
 * day, or free); we createSession() with the past startedAt and route
 * to /session/:id so they can log sets normally. finishSession() will
 * compute completedAt as startedAt + 60min for retrospective sessions
 * (see db/sessions.ts) so the History timeline + duration display
 * reflect when the workout happened, not when it got logged. */
export function LogPastWorkoutModal({ profileId, onClose }: Props) {
  const navigate = useNavigate();
  const routines = useRoutines();

  // Default the date to yesterday — most retrospective adds are
  // "yesterday's workout, forgot to log."
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateInput(d);
  });
  const [planKey, setPlanKey] = useState<string>(FREE_KEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planOptions = useMemo<PlanOption[]>(
    () => buildPlanOptions(routines ?? []),
    [routines],
  );

  // Esc → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const plan =
        planOptions.find((o) => o.key === planKey) ??
        ({
          key: FREE_KEY,
          label: 'Free workout',
          templateRef: null,
          blocks: [],
          planName: freeSessionLabel(date),
        } satisfies PlanOption);
      const startedAt = parseLocalDateInputToNoonIso(date);
      const id = await createSession({
        profileId,
        ...(plan.templateRef ? { templateRef: plan.templateRef } : {}),
        planName: plan.planName,
        livePlan: plan.blocks ?? [],
        startedAt,
      });
      navigate(`/session/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Log past workout"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Log past workout
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            Backfill a session
          </h2>
          <p className="text-sm text-fg-muted">
            For workouts you did but didn&apos;t log on the day. We&apos;ll
            create the session and drop you straight into it to fill in
            the sets.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="past-workout-date"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Date
          </label>
          <input
            id="past-workout-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            // Don't allow future dates — that's not retrospective.
            max={toLocalDateInput(new Date())}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          />
        </section>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="past-workout-plan"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Workout
          </label>
          <select
            id="past-workout-plan"
            value={planKey}
            onChange={(e) => setPlanKey(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          >
            <option value={FREE_KEY}>Free workout</option>
            {planOptions
              .filter((o) => o.key !== FREE_KEY)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
          </select>
          <p className="text-xs text-fg-muted">
            Picking a routine day pre-fills the planned exercises.
            &ldquo;Free workout&rdquo; starts empty — add exercises in
            the session.
          </p>
        </section>

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
            disabled={busy}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- helpers --------------------------------------------------------

const FREE_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function freeSessionLabel(localDateInput: string): string {
  const d = parseLocalDateInputToNoon(localDateInput);
  return `Free session · ${FREE_LABEL_FMT.format(d)}`;
}

/** YYYY-MM-DD in the user's local timezone — the `<input type="date">`
 * value format. Never use `toISOString().slice(0, 10)` for this; that
 * shifts to UTC and "yesterday at 23:00 local" becomes today's date. */
function toLocalDateInput(d: Date): string {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse YYYY-MM-DD as noon local time (avoids DST + timezone edge
 * cases that would land an event on the wrong calendar day). */
function parseLocalDateInputToNoon(localDateInput: string): Date {
  const [y, m, d] = localDateInput.split('-').map((n) => parseInt(n, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

function parseLocalDateInputToNoonIso(localDateInput: string): string {
  return parseLocalDateInputToNoon(localDateInput).toISOString();
}

/** Build the dropdown options from the routine library. We surface
 * each *workout* day (skipping rest days) for week 1 of every routine.
 * Most routines either have one week or repeat the same A/B/C
 * structure across weeks; week 1 is the canonical reference. Power
 * users running multi-week macros can still drill in via the routine
 * detail screen for live sessions; retrospective adds keep this
 * picker simple. */
function buildPlanOptions(routines: RoutineTemplate[]): PlanOption[] {
  const options: PlanOption[] = [];
  for (const routine of routines) {
    const week = routine.weeks[0];
    if (!week) continue;
    for (const day of week.days) {
      if (day.kind !== 'workout') continue;
      const dayLabel = day.workoutLabel
        ? `Workout ${day.workoutLabel}`
        : `Day ${day.dayNumber}`;
      const planName = `${routine.name} · W${week.weekNumber} D${day.dayNumber}${day.workoutLabel ? ` · Workout ${day.workoutLabel}` : ''}`;
      options.push({
        key: `${routine.id}-${week.weekNumber}-${day.dayNumber}`,
        label: `${routine.name} — ${dayLabel}`,
        templateRef: {
          routineId: routine.id,
          weekNumber: week.weekNumber,
          dayNumber: day.dayNumber,
        },
        blocks: cloneBlocks(day),
        planName,
      });
    }
  }
  // Stable order: by routine name, then day number.
  options.sort(
    (a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
  return options;
}

function cloneBlocks(day: DayTemplate): Block[] {
  return structuredClone(day.blocks);
}
