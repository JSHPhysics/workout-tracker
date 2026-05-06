import { useEffect, useState } from 'react';
import { logSet, deleteSet, updateSetType } from '../db/setLogs';
import { useRestTimer } from '../state/restTimer';
import { primeAudio } from '../lib/cue';
import { NumberStepper } from './NumberStepper';
import { PlateViz } from './PlateViz';
import { SetTypeChip } from './SetTypeChip';
import type {
  Exercise,
  PlannedExercise,
  PlateInventoryEntry,
  SetLog,
  SetType,
} from '../types';

interface Props {
  sessionId: string;
  blockOrder: number;
  exerciseOrder: number;
  setNumber: number;
  planned: PlannedExercise;
  exercise: Exercise;
  /** Existing log for this slot — if present, the row renders completed. */
  existingLog: SetLog | null;
  /** Whether the parent block is skipped — locks edits and tick. */
  blockSkipped: boolean;
  /** Default barbell weight for this profile, used by the plate viz on
   * `usesBarbell` exercises. null while loading or unavailable. */
  barWeight: number | null;
  /** Profile's plate inventory; null while loading. */
  plateInventory: PlateInventoryEntry[] | null;
}

const WEIGHT_STEP = 2.5; // milestone 6 will make this configurable per profile.
const REPS_STEP = 1;
const TIME_STEP = 5;
// Fallback rest when neither the planned slot nor the exercise carries
// a default. Settings UI (milestone 12) will let the user override.
const GLOBAL_DEFAULT_REST_S = 90;

function resolveRestSeconds(
  planned: PlannedExercise,
  exercise: Exercise,
): number {
  return (
    planned.restSeconds ??
    exercise.defaultRestSeconds ??
    GLOBAL_DEFAULT_REST_S
  );
}

export function SetRow({
  sessionId,
  blockOrder,
  exerciseOrder,
  setNumber,
  planned,
  exercise,
  existingLog,
  blockSkipped,
  barWeight,
  plateInventory,
}: Props) {
  const isTimeBased = exercise.measurementType === 'time_seconds';
  const isBodyweight =
    exercise.measurementType === 'bodyweight_reps' && !exercise.usesBarbell;

  const defaultReps = planned.reps
    ? Math.round((planned.reps.min + planned.reps.max) / 2)
    : 0;
  const defaultDuration = planned.durationSeconds
    ? Math.round(
        (planned.durationSeconds.min + planned.durationSeconds.max) / 2,
      )
    : 0;

  const [weight, setWeight] = useState<number>(existingLog?.weight ?? 0);
  const [reps, setReps] = useState<number>(existingLog?.reps ?? defaultReps);
  const [duration, setDuration] = useState<number>(
    existingLog?.durationSeconds ?? defaultDuration,
  );
  const [setType, setSetType] = useState<SetType>(
    existingLog?.setType ?? 'working',
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existingLog) {
      setWeight(existingLog.weight ?? 0);
      setReps(existingLog.reps ?? defaultReps);
      setDuration(existingLog.durationSeconds ?? defaultDuration);
      setSetType(existingLog.setType);
    }
  }, [existingLog, defaultReps, defaultDuration]);

  const completed = !!existingLog;

  const startRest = useRestTimer((s) => s.start);

  const tick = async () => {
    if (busy || blockSkipped) return;
    setBusy(true);
    try {
      // Tap → user gesture → safe to prime / play audio later.
      primeAudio();
      await logSet({
        sessionId,
        exerciseId: exercise.id,
        blockOrder,
        exerciseOrder,
        setNumber,
        setType,
        ...(isTimeBased
          ? { durationSeconds: duration }
          : { reps, ...(isBodyweight ? {} : { weight }) }),
      });
      // Auto-start the rest timer for working / drop / failure / amrap
      // sets — warm-ups don't need a rest cue.
      if (setType !== 'warmup') {
        startRest(
          resolveRestSeconds(planned, exercise),
          `After ${exercise.name} · Set ${setNumber}`,
        );
      }
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

  const handleSetTypeChange = async (next: SetType) => {
    setSetType(next);
    if (existingLog) {
      // Persist immediately for already-logged sets.
      await updateSetType(existingLog.id, next);
    }
  };

  const showPlateViz =
    exercise.usesBarbell &&
    !isTimeBased &&
    !isBodyweight &&
    barWeight !== null &&
    plateInventory !== null &&
    weight > 0;

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-xl border px-3 py-2',
        blockSkipped
          ? 'border-line bg-surface-soft/40 opacity-60'
          : completed
            ? 'border-accent/40 bg-accent-soft'
            : 'border-line bg-surface',
      ].join(' ')}
    >
    <div className="flex items-center gap-3">
      <div className="flex w-12 shrink-0 flex-col items-start gap-1">
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-fg-muted">
          Set {setNumber}
        </span>
        <SetTypeChip
          value={setType}
          onChange={handleSetTypeChange}
          disabled={blockSkipped}
        />
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {!isTimeBased && !isBodyweight && (
          <NumberStepper
            value={weight}
            onChange={setWeight}
            step={WEIGHT_STEP}
            ariaLabel="Weight in kilograms"
            disabled={completed || blockSkipped}
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
            disabled={completed || blockSkipped}
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
            disabled={completed || blockSkipped}
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
          disabled={busy || blockSkipped}
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
          disabled={busy || blockSkipped}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          title="Tick"
        >
          ✓
        </button>
      )}
      </div>

      {showPlateViz && barWeight !== null && plateInventory !== null && (
        <PlateViz
          target={weight}
          barWeight={barWeight}
          inventory={plateInventory}
          className="mt-1 border-t border-line/60 pt-2"
        />
      )}
    </div>
  );
}
