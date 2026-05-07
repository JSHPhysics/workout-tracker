import { useEffect, useState } from 'react';
import {
  deleteSet,
  logSet,
  updateNotes,
  updateRpe,
  updateSetType,
} from '../db/setLogs';
import { useRestTimer } from '../state/restTimer';
import { primeAudio } from '../lib/cue';
import { NumberStepper } from './NumberStepper';
import { PRBadges } from './PRBadges';
import { PlateViz } from './PlateViz';
import { RatingChips } from './RatingChips';
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
  /** Most recent bodyweight in kg for the active profile, or null when
   * the profile has no weigh-ins yet. Used for bodyweight-volume
   * accounting on bodyweight-only exercises. */
  latestBodyweight: number | null;
  /** When true, log bodyweight-only sets with weight = latestBodyweight
   * so they contribute to volume aggregates. */
  useBodyweightForVolume: boolean;
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
  latestBodyweight,
  useBodyweightForVolume,
}: Props) {
  const isTimeBased = exercise.measurementType === 'time_seconds';
  const isWalking = exercise.measurementType === 'walking';
  const isBodyweight =
    exercise.measurementType === 'bodyweight_reps' && !exercise.usesBarbell;

  const defaultReps = planned.reps
    ? Math.round((planned.reps.min + planned.reps.max) / 2)
    : 0;
  const defaultDuration = planned.durationSeconds
    ? Math.round(
        (planned.durationSeconds.min + planned.durationSeconds.max) / 2,
      )
    : isWalking
      ? 1800 // 30 min default if no plan
      : 0;

  const [weight, setWeight] = useState<number>(existingLog?.weight ?? 0);
  const [reps, setReps] = useState<number>(existingLog?.reps ?? defaultReps);
  const [duration, setDuration] = useState<number>(
    existingLog?.durationSeconds ?? defaultDuration,
  );
  const [steps, setSteps] = useState<number>(existingLog?.steps ?? 0);
  const [setType, setSetType] = useState<SetType>(
    existingLog?.setType ?? 'working',
  );
  const [rpe, setRpe] = useState<number | null>(existingLog?.rpe ?? null);
  const [notes, setNotes] = useState<string>(existingLog?.notes ?? '');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existingLog) {
      setWeight(existingLog.weight ?? 0);
      setReps(existingLog.reps ?? defaultReps);
      setDuration(existingLog.durationSeconds ?? defaultDuration);
      setSteps(existingLog.steps ?? 0);
      setSetType(existingLog.setType);
      setRpe(existingLog.rpe ?? null);
      setNotes(existingLog.notes ?? '');
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
      // Bodyweight-only exercises store the user's current weigh-in
      // as `weight` when the toggle is on, so volume aggregates on
      // push-ups/dips/etc. count for something. Falls back to no
      // weight when there's no logged bodyweight to draw from.
      const bodyweightLoad =
        isBodyweight && useBodyweightForVolume && latestBodyweight !== null
          ? { weight: latestBodyweight }
          : {};
      // Per measurement type, supply the right metric set:
      //   weight_reps      → weight + reps
      //   bodyweight_reps  → reps (+ weight from latest weigh-in if toggle on)
      //   time_seconds     → durationSeconds
      //   walking          → durationSeconds (if any) + steps (if any)
      const metrics = isWalking
        ? {
            ...(duration > 0 ? { durationSeconds: duration } : {}),
            ...(steps > 0 ? { steps } : {}),
          }
        : isTimeBased
          ? { durationSeconds: duration }
          : { reps, ...(isBodyweight ? bodyweightLoad : { weight }) };
      await logSet({
        sessionId,
        exerciseId: exercise.id,
        blockOrder,
        exerciseOrder,
        setNumber,
        setType,
        ...metrics,
        ...(rpe !== null ? { rpe } : {}),
        ...(notes.trim() !== '' ? { notes } : {}),
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

  const handleRpeChange = async (next: number | null) => {
    setRpe(next);
    if (existingLog) await updateRpe(existingLog.id, next);
  };

  const handleNotesBlur = async () => {
    if (existingLog && notes !== (existingLog.notes ?? '')) {
      await updateNotes(existingLog.id, notes);
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
        {!isTimeBased && !isBodyweight && !isWalking && (
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
        {!isTimeBased && !isWalking && (
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
        {isWalking && (
          <>
            <NumberStepper
              value={duration}
              onChange={setDuration}
              step={60}
              min={0}
              max={36000}
              ariaLabel="Duration in minutes"
              disabled={completed || blockSkipped}
              format={(v) => `${Math.round(v / 60)} min`}
              width={6}
            />
            <NumberStepper
              value={steps}
              onChange={setSteps}
              step={500}
              min={0}
              max={100000}
              ariaLabel="Steps"
              disabled={completed || blockSkipped}
              format={(v) => `${v.toLocaleString()} steps`}
              width={9}
            />
          </>
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

      {existingLog && existingLog.prTypes.length > 0 && (
        <PRBadges types={existingLog.prTypes} />
      )}

      {showPlateViz && barWeight !== null && plateInventory !== null && (
        <PlateViz
          target={weight}
          barWeight={barWeight}
          inventory={plateInventory}
          className="mt-1 border-t border-line/60 pt-2"
        />
      )}

      <SetExtras
        rpe={rpe}
        notes={notes}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onRpeChange={handleRpeChange}
        onNotesChange={setNotes}
        onNotesBlur={handleNotesBlur}
        disabled={blockSkipped}
      />
    </div>
  );
}

interface SetExtrasProps {
  rpe: number | null;
  notes: string;
  expanded: boolean;
  onToggle: () => void;
  onRpeChange: (value: number | null) => void;
  onNotesChange: (value: string) => void;
  onNotesBlur: () => void;
  disabled: boolean;
}

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

function SetExtras({
  rpe,
  notes,
  expanded,
  onToggle,
  onRpeChange,
  onNotesChange,
  onNotesBlur,
  disabled,
}: SetExtrasProps) {
  const summary = (() => {
    const parts: string[] = [];
    if (rpe !== null) parts.push(`RPE ${rpe}`);
    if (notes.trim() !== '') parts.push('· Notes');
    return parts.join(' ');
  })();

  return (
    <div className="-mx-1 mt-1 flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between rounded-lg px-1 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint transition hover:text-fg-muted"
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide RPE and notes' : 'Add RPE or notes'}
      >
        <span className="truncate">
          {summary === '' ? (expanded ? 'Hide' : 'RPE · Notes') : summary}
        </span>
        <span aria-hidden className="ml-2 text-fg-faint">
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-col gap-2 px-1">
          <div className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
              RPE
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <RatingChips
                value={rpe}
                onChange={onRpeChange}
                options={RPE_OPTIONS.map((v) => ({ value: v, label: `${v}` }))}
                ariaLabel="Rate of perceived exertion"
                disabled={disabled}
              />
              {rpe !== null && (
                <button
                  type="button"
                  onClick={() => onRpeChange(null)}
                  disabled={disabled}
                  className="min-h-[32px] rounded-full px-2 text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-fg disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              onBlur={onNotesBlur}
              disabled={disabled}
              rows={2}
              placeholder="Form cue, equipment, anything"
              className="resize-none rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </label>
        </div>
      )}
    </div>
  );
}
