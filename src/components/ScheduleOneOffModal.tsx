import { useEffect, useMemo, useState } from 'react';
import { useRoutines } from '../db/routines';
import { scheduleOneOff } from '../db/scheduledSessions';
import type { RoutineTemplate } from '../types';

interface Props {
  profileId: string;
  /** Pre-fill the date picker (YYYY-MM-DD). Defaults to today. */
  initialDate?: string;
  onClose: () => void;
}

interface PlanOption {
  key: string;
  label: string;
  routineId: string;
  weekNumber: number;
  dayNumber: number;
}

/** Bottom-sheet modal for adding a one-off scheduled workout — i.e.
 * a ScheduledSession with no planId. Same shape as
 * LogPastWorkoutModal but writes scheduledSessions instead of
 * sessions. The user picks a date + routine day and the row
 * surfaces on /today + /calendar from then on. */
export function ScheduleOneOffModal({
  profileId,
  initialDate,
  onClose,
}: Props) {
  const routines = useRoutines();
  const [date, setDate] = useState<string>(initialDate ?? todayLocal());
  const [planKey, setPlanKey] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planOptions = useMemo<PlanOption[]>(
    () => buildPlanOptions(routines ?? []),
    [routines],
  );

  // Default to the first option once routines load.
  useEffect(() => {
    if (!planKey && planOptions.length > 0) {
      setPlanKey(planOptions[0]!.key);
    }
  }, [planOptions, planKey]);

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
    const plan = planOptions.find((o) => o.key === planKey);
    if (!plan) {
      setError('Pick a workout to schedule.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await scheduleOneOff({
        profileId,
        plannedDate: date,
        routineId: plan.routineId,
        weekNumber: plan.weekNumber,
        dayNumber: plan.dayNumber,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Schedule a one-off workout"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Schedule
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            One-off workout
          </h2>
          <p className="text-sm text-fg-muted">
            Drops a workout on a specific date — no plan attached.
            It&apos;ll surface on /today when the day comes around.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="oneoff-date"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Date
          </label>
          <input
            id="oneoff-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          />
        </section>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="oneoff-plan"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Workout
          </label>
          <select
            id="oneoff-plan"
            value={planKey}
            onChange={(e) => setPlanKey(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          >
            {planOptions.length === 0 && (
              <option value="">No routines yet — create one first</option>
            )}
            {planOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
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
            disabled={busy || planOptions.length === 0}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear().toString().padStart(4, '0'),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('-');
}

/** Mirror of the picker on LogPastWorkoutModal — surface every
 * workout day (skipping rest) from week 1 of every routine. Most
 * routines either have one week or repeat the same A/B/C across
 * weeks; week 1 is the canonical reference. */
function buildPlanOptions(routines: RoutineTemplate[]): PlanOption[] {
  const out: PlanOption[] = [];
  for (const routine of routines) {
    const week = routine.weeks[0];
    if (!week) continue;
    for (const day of week.days) {
      if (day.kind !== 'workout') continue;
      const dayLabel = day.workoutLabel
        ? `Workout ${day.workoutLabel}`
        : `Day ${day.dayNumber}`;
      out.push({
        key: `${routine.id}-${week.weekNumber}-${day.dayNumber}`,
        label: `${routine.name} — ${dayLabel}`,
        routineId: routine.id,
        weekNumber: week.weekNumber,
        dayNumber: day.dayNumber,
      });
    }
  }
  return out.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}
