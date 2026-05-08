import { useEffect, useState } from 'react';
import {
  deleteSet,
  logSet,
  updateNotes,
  updateRpe,
  updateSetMetrics,
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
  /** Autofill defaults computed by the parent ExerciseGroup. The
   * parent walks back through prior in-session sets for this
   * exercise, falls back to the most recent prior session's
   * non-warmup set, and finally to planned-range midpoints / 0.
   * Used as the initial stepper value when no `existingLog` exists,
   * and re-synced via useEffect when the parent's computed default
   * changes — unless the user has touched the row's controls
   * (the `dirty` flag protects in-flight edits). */
  defaultWeight: number;
  defaultReps: number;
  defaultDuration: number;
  defaultSteps: number;
  /** Default distance in metres — for `'distance'`-type cardio
   * exercises. UI displays as km. */
  defaultDistance: number;
  /** Initial set type for empty rows. The warm-up generator uses this
   * to pre-cycle the chip to "WARM-UP" without having to pre-log the
   * row (which would render it as already-ticked). Ignored once an
   * `existingLog` is present — the log's own `setType` wins. */
  defaultSetType?: SetType;
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
  defaultWeight,
  defaultReps,
  defaultDuration,
  defaultSteps,
  defaultDistance,
  defaultSetType,
}: Props) {
  const isTimeBased = exercise.measurementType === 'time_seconds';
  const isWalking = exercise.measurementType === 'walking';
  const isDistance = exercise.measurementType === 'distance';
  const isBodyweight =
    exercise.measurementType === 'bodyweight_reps' && !exercise.usesBarbell;

  const [weight, setWeight] = useState<number>(
    existingLog?.weight ?? defaultWeight,
  );
  const [reps, setReps] = useState<number>(existingLog?.reps ?? defaultReps);
  const [duration, setDuration] = useState<number>(
    existingLog?.durationSeconds ?? defaultDuration,
  );
  const [steps, setSteps] = useState<number>(
    existingLog?.steps ?? defaultSteps,
  );
  const [distance, setDistance] = useState<number>(
    existingLog?.distance ?? defaultDistance,
  );
  const [setType, setSetType] = useState<SetType>(
    existingLog?.setType ?? defaultSetType ?? 'working',
  );
  const [rpe, setRpe] = useState<number | null>(existingLog?.rpe ?? null);
  const [notes, setNotes] = useState<string>(existingLog?.notes ?? '');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Tracks whether the user has touched any of the metric steppers
   * since this row was last in sync with `existingLog` / defaults.
   * When true, the re-sync useEffect leaves their in-flight values
   * alone — so a deliberate climb (set 1 → 40 kg, pre-bumped set 2
   * to 42.5 kg) isn't clobbered when set 1 logs and the parent
   * recomputes set 2's default to 40 kg. Reset to false whenever the
   * row syncs from `existingLog` (after Tick or Undo). */
  const [dirty, setDirty] = useState(false);
  /** Helper: wrap any setter so calling it also marks the row dirty.
   * Used on every metric stepper so the re-sync useEffect leaves
   * in-flight user edits alone. */
  const withDirty =
    <T,>(setter: (next: T) => void) =>
    (next: T) => {
      setter(next);
      setDirty(true);
    };

  useEffect(() => {
    if (existingLog) {
      setWeight(existingLog.weight ?? 0);
      setReps(existingLog.reps ?? defaultReps);
      setDuration(existingLog.durationSeconds ?? defaultDuration);
      setSteps(existingLog.steps ?? 0);
      setDistance(existingLog.distance ?? 0);
      setSetType(existingLog.setType);
      setRpe(existingLog.rpe ?? null);
      setNotes(existingLog.notes ?? '');
      setDirty(false);
    } else if (!dirty) {
      // No log yet AND user hasn't touched the steppers — re-sync to
      // the latest computed defaults so in-session and cross-session
      // inheritance flow through as new data lands (e.g. set 1 logs
      // → set 2's default updates → this row picks it up).
      setWeight(defaultWeight);
      setReps(defaultReps);
      setDuration(defaultDuration);
      setSteps(defaultSteps);
      setDistance(defaultDistance);
      // Re-cycle the set-type chip to its default too, so a freshly
      // generated warm-up row reads as "WARM-UP" before tick. The user
      // can still cycle the chip manually before ticking; that change
      // sticks because we only re-sync when the row hasn't been
      // touched (`dirty === false`).
      setSetType(defaultSetType ?? 'working');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    existingLog,
    defaultWeight,
    defaultReps,
    defaultDuration,
    defaultSteps,
    defaultDistance,
    defaultSetType,
  ]);

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
      //   distance         → durationSeconds (if any) + distance (if any)
      const metrics = isWalking
        ? {
            ...(duration > 0 ? { durationSeconds: duration } : {}),
            ...(steps > 0 ? { steps } : {}),
          }
        : isTimeBased
          ? { durationSeconds: duration }
          : isDistance
            ? {
                ...(duration > 0 ? { durationSeconds: duration } : {}),
                ...(distance > 0 ? { distance } : {}),
              }
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
      scrollToNextSetAfter(blockOrder, exerciseOrder, setNumber);
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

  /** Save the in-flight stepper values back to an already-logged set.
   * Used to fix a row that was logged with a wrong value (e.g. saved
   * as 0 kg by accident). Only relevant when there's an existingLog
   * AND the row is dirty — otherwise the buttons aren't shown.
   *
   * Note: doesn't re-run PR detection (CLAUDE.md describes PRs as
   * derived state, recomputable later — see updateSetMetrics for
   * the limitation comment). */
  const saveChanges = async () => {
    if (busy || !existingLog) return;
    setBusy(true);
    try {
      // Build the patch matching the exercise's measurement type so
      // we don't write irrelevant fields (e.g. weight on a
      // bodyweight-rep set).
      const patch: {
        weight?: number;
        reps?: number;
        durationSeconds?: number;
        steps?: number;
        distance?: number;
      } = isWalking
        ? {
            ...(duration > 0 ? { durationSeconds: duration } : {}),
            ...(steps > 0 ? { steps } : {}),
          }
        : isTimeBased
          ? { durationSeconds: duration }
          : isDistance
            ? {
                ...(duration > 0 ? { durationSeconds: duration } : {}),
                ...(distance > 0 ? { distance } : {}),
              }
            : isBodyweight
              ? { reps }
              : { weight, reps };
      await updateSetMetrics(existingLog.id, patch);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  };

  /** Reset stepper values to whatever the existingLog says, dropping
   * any in-flight edits. Available alongside Save when dirty. */
  const discardChanges = () => {
    if (!existingLog) return;
    setWeight(existingLog.weight ?? 0);
    setReps(existingLog.reps ?? defaultReps);
    setDuration(existingLog.durationSeconds ?? defaultDuration);
    setSteps(existingLog.steps ?? 0);
    setDistance(existingLog.distance ?? 0);
    setDirty(false);
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
      // Stable key the auto-scroll-after-tick logic uses to find this
      // row in the DOM and the row below it.
      data-set-key={`${blockOrder}-${exerciseOrder}-${setNumber}`}
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
      <div className="flex w-16 shrink-0 flex-col items-start gap-1">
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
        {!isTimeBased && !isBodyweight && !isWalking && !isDistance && (
          <NumberStepper
            value={weight}
            onChange={withDirty(setWeight)}
            step={WEIGHT_STEP}
            ariaLabel="Weight in kilograms"
            disabled={blockSkipped}
            format={(v) => `${v % 1 === 0 ? v : v.toFixed(1)} kg`}
            width={6}
          />
        )}
        {!isTimeBased && !isWalking && !isDistance && (
          <NumberStepper
            value={reps}
            onChange={withDirty(setReps)}
            step={REPS_STEP}
            ariaLabel="Reps"
            disabled={blockSkipped}
            format={(v) => `${v} reps`}
            width={6}
          />
        )}
        {isTimeBased && (
          <NumberStepper
            value={duration}
            onChange={withDirty(setDuration)}
            step={TIME_STEP}
            ariaLabel="Duration in seconds"
            disabled={blockSkipped}
            format={(v) => `${v}s`}
            width={5}
          />
        )}
        {isDistance && (
          <>
            <NumberStepper
              value={duration}
              onChange={withDirty(setDuration)}
              step={60}
              min={0}
              max={36000}
              ariaLabel="Duration in minutes"
              disabled={blockSkipped}
              format={(v) => `${Math.round(v / 60)} min`}
              width={6}
            />
            <NumberStepper
              value={distance}
              onChange={withDirty(setDistance)}
              step={100}
              min={0}
              max={200000}
              ariaLabel="Distance in metres"
              disabled={blockSkipped}
              // Display as km (one decimal). Stored in metres so the
              // 100 m step keeps things integer-friendly.
              format={(v) => `${(v / 1000).toFixed(1)} km`}
              width={7}
            />
          </>
        )}
        {isWalking && (
          <>
            <NumberStepper
              value={duration}
              onChange={withDirty(setDuration)}
              step={60}
              min={0}
              max={36000}
              ariaLabel="Duration in minutes"
              disabled={blockSkipped}
              format={(v) => `${Math.round(v / 60)} min`}
              width={6}
            />
            <NumberStepper
              value={steps}
              onChange={withDirty(setSteps)}
              step={500}
              min={0}
              max={100000}
              ariaLabel="Steps"
              disabled={blockSkipped}
              format={(v) => `${v.toLocaleString()} steps`}
              width={9}
            />
          </>
        )}
      </div>

      {completed && dirty ? (
        // Logged set with in-flight edits — Save commits, Discard
        // reverts. ↺ undo (delete entire row) stays accessible from
        // the SetExtras panel below.
        <div className="flex flex-col items-stretch gap-1">
          <button
            type="button"
            onClick={saveChanges}
            aria-label="Save changes to this set"
            disabled={busy || blockSkipped}
            className="rounded-full bg-accent px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            title="Save changes"
          >
            Save
          </button>
          <button
            type="button"
            onClick={discardChanges}
            aria-label="Discard changes to this set"
            disabled={busy || blockSkipped}
            className="rounded-full px-3 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      ) : completed ? (
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

/** After a successful tick, smoothly scroll the next SetRow into the
 * middle of the viewport so the user doesn't have to thumb-scroll
 * between sets. Picks the row immediately following the just-ticked
 * one in document order — so when the last set of an exercise is
 * ticked, the next exercise's first set comes into view. No-ops on
 * the very last set of the session and when there's no DOM
 * environment (SSR / tests). Honours `prefers-reduced-motion`. */
function scrollToNextSetAfter(
  blockOrder: number,
  exerciseOrder: number,
  setNumber: number,
): void {
  if (typeof document === 'undefined') return;
  const currentKey = `${blockOrder}-${exerciseOrder}-${setNumber}`;
  // Defer one frame so the parent's live-query update lands first —
  // the just-ticked row is otherwise queryable but its layout may
  // shift as the completed-state styling kicks in, and we want the
  // scroll to settle on stable geometry.
  requestAnimationFrame(() => {
    const all = Array.from(
      document.querySelectorAll<HTMLElement>('[data-set-key]'),
    );
    const idx = all.findIndex(
      (el) => el.getAttribute('data-set-key') === currentKey,
    );
    if (idx < 0 || idx + 1 >= all.length) return;
    const next = all[idx + 1];
    if (!next) return;
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    next.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  });
}

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
