import { useEffect, useState } from 'react';
import { logSet, deleteSet } from '../db/setLogs';
import { NumberStepper } from './NumberStepper';
import type { Exercise, PlannedExercise, SetLog } from '../types';

interface Props {
  sessionId: string;
  blockOrder: number;
  exerciseOrder: number;
  setNumber: number;
  planned: PlannedExercise;
  exercise: Exercise;
  /** Existing log for this slot — if present, the row renders completed. */
  existingLog: SetLog | null;
}

const WEIGHT_STEP = 2.5; // milestone 6 will make this configurable per profile.
const REPS_STEP = 1;
const TIME_STEP = 5;

export function SetRow({
  sessionId,
  blockOrder,
  exerciseOrder,
  setNumber,
  planned,
  exercise,
  existingLog,
}: Props) {
  const isTimeBased = exercise.measurementType === 'time_seconds';
  const isBodyweight =
    exercise.measurementType === 'bodyweight_reps' && !exercise.usesBarbell;

  // Sensible defaults: midpoint of the planned range so the user is one
  // tap away from a typical entry.
  const defaultReps = planned.reps
    ? Math.round((planned.reps.min + planned.reps.max) / 2)
    : 0;
  const defaultDuration = planned.durationSeconds
    ? Math.round(
        (planned.durationSeconds.min + planned.durationSeconds.max) / 2,
      )
    : 0;

  const [weight, setWeight] = useState<number>(
    existingLog?.weight ?? (isBodyweight ? 0 : 0),
  );
  const [reps, setReps] = useState<number>(existingLog?.reps ?? defaultReps);
  const [duration, setDuration] = useState<number>(
    existingLog?.durationSeconds ?? defaultDuration,
  );
  const [busy, setBusy] = useState(false);

  // Re-sync local state if Dexie pushes us a new existingLog (e.g. after
  // an external edit). useState init only runs on mount.
  useEffect(() => {
    if (existingLog) {
      setWeight(existingLog.weight ?? 0);
      setReps(existingLog.reps ?? defaultReps);
      setDuration(existingLog.durationSeconds ?? defaultDuration);
    }
  }, [existingLog, defaultReps, defaultDuration]);

  const completed = !!existingLog;

  const tick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logSet({
        sessionId,
        exerciseId: exercise.id,
        blockOrder,
        exerciseOrder,
        setNumber,
        ...(isTimeBased
          ? { durationSeconds: duration }
          : { reps, ...(isBodyweight ? {} : { weight }) }),
      });
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy || !existingLog) return;
    setBusy(true);
    try {
      await deleteSet(existingLog.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border px-3 py-2',
        completed
          ? 'border-accent/40 bg-accent-soft'
          : 'border-line bg-surface',
      ].join(' ')}
    >
      <span className="w-10 shrink-0 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
        Set {setNumber}
      </span>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {!isTimeBased && !isBodyweight && (
          <NumberStepper
            value={weight}
            onChange={setWeight}
            step={WEIGHT_STEP}
            ariaLabel="Weight in kilograms"
            disabled={completed}
            format={(v) => `${v % 1 === 0 ? v : v.toFixed(1)} kg`}
            width={6}
          />
        )}
        {!isTimeBased && (
          <NumberStepper
            value={reps}
            onChange={setReps}
            step={REPS_STEP}
            ariaLabel="Reps"
            disabled={completed}
            format={(v) => `${v} reps`}
            width={6}
          />
        )}
        {isTimeBased && (
          <NumberStepper
            value={duration}
            onChange={setDuration}
            step={TIME_STEP}
            ariaLabel="Duration in seconds"
            disabled={completed}
            format={(v) => `${v}s`}
            width={5}
          />
        )}
      </div>

      {completed ? (
        <button
          type="button"
          onClick={undo}
          aria-label="Undo set"
          disabled={busy}
          className="flex h-12 w-12 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-elevated hover:text-fg disabled:opacity-50"
          title="Undo"
        >
          ↺
        </button>
      ) : (
        <button
          type="button"
          onClick={tick}
          aria-label="Complete set"
          disabled={busy}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          title="Tick"
        >
          ✓
        </button>
      )}
    </div>
  );
}
