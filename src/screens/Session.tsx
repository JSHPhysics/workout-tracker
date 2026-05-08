import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  addWarmupSets,
  appendBlock,
  changeSetCount,
  deleteSession,
  discardSession,
  finishSession,
  setBlockSkipped,
  setPostWellbeing,
  setPreWellbeing,
  swapExercise,
  useSession,
} from '../db/sessions';
import { useMostRecentSetMetric, useSessionSetLogs } from '../db/setLogs';
import { useExerciseMap } from '../db/exercises';
import { useDefaultBarbell, usePlateInventory } from '../db/equipment';
import { useLatestBodyweight } from '../db/bodyweight';
import { useProfile } from '../db/profiles';
import { ElapsedTime } from '../components/ElapsedTime';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { ExercisePicker } from '../components/ExercisePicker';
import { PRCelebration } from '../components/PRCelebration';
import { BackupPromptModal } from '../components/BackupPromptModal';
import { staleness } from '../components/BackupSection';
import { RestTimerBar } from '../components/RestTimerBar';
import { SetRow } from '../components/SetRow';
import { ShareWorkoutButton } from '../components/ShareWorkoutButton';
import { WarmupGeneratorModal } from '../components/WarmupGeneratorModal';
import { WellbeingPromptModal } from '../components/WellbeingPromptModal';
import {
  RATING_EMOJI,
  RATING_LABELS,
  hasAnyRating,
  snapshotFromSession,
} from '../domain/wellbeing';
import { useRestTimer } from '../state/restTimer';
import type { PRAward } from '../domain/pr-detection';
import type {
  Block,
  Exercise,
  PlannedExercise,
  PlateInventoryEntry,
  SetLog,
} from '../types';

type EditTarget =
  | { kind: 'add' }
  | { kind: 'swap'; blockOrder: number; exerciseOrder: number };

/** Wellbeing-prompt mode: which slot is being captured / edited. */
type WellbeingTarget = 'before' | 'after' | 'edit';

/** Per-session memory of which pre-prompts the user has dismissed
 * with Skip. Keeps refreshes from re-prompting mid-session. Module-
 * scope = resets on full app reload, which is acceptable: the Skip is
 * a soft "not now" signal, not a settings choice. */
const PRE_PROMPT_DISMISSED = new Set<string>();
const POST_PROMPT_DISMISSED = new Set<string>();

/** Threshold for treating a session as "retrospective" — i.e. the
 * user is back-filling a workout from a previous day rather than
 * lifting right now. Mirrors the constant in db/sessions.ts. We use
 * it to suppress the wellbeing prompts in that flow. */
const RETRO_THRESHOLD_MS = 12 * 60 * 60 * 1000;
function isRetrospectiveSession(startedAt: string): boolean {
  return Date.now() - Date.parse(startedAt) > RETRO_THRESHOLD_MS;
}

export function Session() {
  const { id } = useParams<{ id: string }>();
  const session = useSession(id);
  const setLogs = useSessionSetLogs(id);
  const exerciseMap = useExerciseMap();
  const defaultBar = useDefaultBarbell(session?.profileId);
  const plateInv = usePlateInventory(session?.profileId);
  const profile = useProfile(session?.profileId ?? null);
  const latestBw = useLatestBodyweight(session?.profileId ?? null);
  const navigate = useNavigate();
  const dismissRest = useRestTimer((s) => s.dismiss);
  const [busy, setBusy] = useState<'finish' | 'discard' | 'delete' | null>(
    null,
  );
  const [pickerTarget, setPickerTarget] = useState<EditTarget | null>(null);
  const [celebration, setCelebration] = useState<PRAward[] | null>(null);
  const [backupPrompt, setBackupPrompt] = useState(false);
  const [wellbeingTarget, setWellbeingTarget] =
    useState<WellbeingTarget | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Pre-prompt fires once per session-load when the session is fresh
  // and no pre-ratings are recorded. Dismissed-set blocks re-prompts
  // after Skip (until full app reload). Skipped entirely for
  // retrospective sessions — the user is back-filling history, not
  // about to lift, so a "how do you feel?" prompt makes no sense.
  useEffect(() => {
    if (!session) return;
    if (session.completedAt !== null) return;
    if (PRE_PROMPT_DISMISSED.has(session.id)) return;
    if (isRetrospectiveSession(session.startedAt)) return;
    if (
      session.moodBefore !== undefined ||
      session.energyBefore !== undefined
    ) {
      return;
    }
    setWellbeingTarget('before');
  }, [session]);

  const logsByKey = useMemo(() => {
    const map = new Map<string, SetLog>();
    for (const log of setLogs ?? []) {
      map.set(`${log.blockOrder}-${log.exerciseOrder}-${log.setNumber}`, log);
    }
    return map;
  }, [setLogs]);

  if (session === null) return <Navigate to="/today" replace />;

  if (session === undefined || setLogs === undefined || exerciseMap === undefined) {
    return <SessionSkeleton />;
  }

  const livePlan = session.livePlan;
  const totalPlannedSets = livePlan.reduce(
    (sum, b) =>
      b.skipped
        ? sum
        : sum + b.exercises.reduce((s, e) => s + e.setCount, 0),
    0,
  );
  const completedSets = setLogs.length;
  const sessionDone = session.completedAt !== null;
  const sessionId = session.id;

  const finish = async () => {
    if (!id || busy) return;
    setBusy('finish');
    try {
      const awards = await finishSession(id);
      dismissRest();
      // Post-finish modal chain:
      //   (PR celebration if any) → wellbeing-after → (backup if stale) → navigate.
      // Each stage chains forward in its own onClose handler.
      if (awards.length > 0) {
        setCelebration(awards);
      } else {
        advanceFromCelebration();
      }
    } finally {
      setBusy(null);
    }
  };

  const advanceFromCelebration = () => {
    if (!session) return;
    // Skip the post-wellbeing prompt if the user has already filled
    // both ratings in (e.g. they finish from the read-only view, or
    // re-finish a session somehow), if this session id was dismissed,
    // or if the session is retrospective (back-filling from history —
    // the user isn't actually post-workout).
    const alreadyRated =
      session.moodAfter !== undefined && session.energyAfter !== undefined;
    if (
      !alreadyRated &&
      !POST_PROMPT_DISMISSED.has(session.id) &&
      !session.completedAt &&
      !isRetrospectiveSession(session.startedAt)
    ) {
      // Note: we read session.completedAt here from the live snapshot;
      // by the time `finishSession` resolves Dexie has stamped it, but
      // this guard is defensive in case a reflow re-fires. The prompt
      // is unconditional otherwise — the user can always Skip.
      setWellbeingTarget('after');
      return;
    }
    advanceFromWellbeing();
  };

  const advanceFromWellbeing = () => {
    const stale = profile
      ? staleness(profile.lastBackupAt).severity !== 'fresh'
      : false;
    if (stale) {
      setBackupPrompt(true);
    } else {
      navigate('/history');
    }
  };

  const closeCelebration = () => {
    setCelebration(null);
    advanceFromCelebration();
  };

  const closeBackupPrompt = () => {
    setBackupPrompt(false);
    navigate('/history');
  };

  const handleWellbeingSave = async (
    mood: number | null,
    energy: number | null,
  ) => {
    if (!session) return;
    const target = wellbeingTarget;
    setWellbeingTarget(null);
    if (target === 'before') {
      await setPreWellbeing(session.id, mood, energy);
      // Pre-prompt: don't chain anywhere; the user is still in-session.
    } else if (target === 'after') {
      await setPostWellbeing(session.id, mood, energy);
      advanceFromWellbeing();
    } else if (target === 'edit') {
      // Edit mode covers both pre and post — let the user fill in
      // anything on a completed-session card. Heuristic: if either
      // post field had a value, treat the edit as the post slot;
      // otherwise the pre slot.
      const editingPost =
        session.moodAfter !== undefined || session.energyAfter !== undefined;
      if (editingPost) {
        await setPostWellbeing(session.id, mood, energy);
      } else {
        await setPreWellbeing(session.id, mood, energy);
      }
    }
  };

  const handleWellbeingSkip = () => {
    if (!session) return;
    const target = wellbeingTarget;
    setWellbeingTarget(null);
    if (target === 'before') {
      PRE_PROMPT_DISMISSED.add(session.id);
    } else if (target === 'after') {
      POST_PROMPT_DISMISSED.add(session.id);
      advanceFromWellbeing();
    }
    // edit-mode skip is just "cancel" — no dismissal memory needed.
  };

  const discard = async () => {
    if (!id || busy) return;
    if (
      !window.confirm(
        'Discard this in-progress session? All sets logged so far will be deleted.',
      )
    ) {
      return;
    }
    setBusy('discard');
    try {
      await discardSession(id);
      dismissRest();
      navigate('/today');
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!id || busy) return;
    setBusy('delete');
    try {
      await deleteSession(id);
      navigate('/history');
    } catch (err) {
      // Surface to the console so a real failure (Dexie schema, etc.)
      // doesn't disappear silently the way the v1 sessionId-not-indexed
      // bug did. The user sees the modal stay open — they can retry
      // or cancel.
      console.error('Failed to delete workout:', err);
      setBusy(null);
    } finally {
      // Only clear busy on success too — the navigate above will
      // unmount this component, so the state update is dropped.
      // Belt-and-braces though.
      setBusy(null);
    }
  };

  const handlePicked = async (exercise: Exercise) => {
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'add') {
      await appendBlock(sessionId, {
        type: 'single',
        exercises: [plannedFromExercise(exercise)],
      });
    } else {
      // Preserve the existing plan structure (setCount, reps, duration)
      // when swapping — usually you swap because of equipment / variation,
      // not because you want a different rep scheme. If the new exercise's
      // measurement type can't carry the old structure (e.g. swapping a
      // weight-and-reps lift for a time-based plank), fall back to the
      // new exercise's defaults.
      const existing =
        livePlan[pickerTarget.blockOrder]?.exercises[pickerTarget.exerciseOrder];
      const next = existing
        ? mergePlanForSwap(existing, exercise)
        : plannedFromExercise(exercise);
      await swapExercise(
        sessionId,
        pickerTarget.blockOrder,
        pickerTarget.exerciseOrder,
        next,
      );
    }
    setPickerTarget(null);
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-5 pb-32">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            {sessionDone ? 'Logged' : 'In session'}
          </span>
          <ElapsedTime
            startedAt={session.startedAt}
            endAt={session.completedAt}
            className="text-sm text-fg-muted"
          />
        </div>
        <h1 className="font-display text-3xl font-light leading-[1.05] tracking-tight">
          {session.planName}
        </h1>
        <p className="text-sm text-fg-muted">
          {session.templateRef ? 'Templated' : 'Free session'} ·{' '}
          <span className="tabular-nums">
            {completedSets}/{totalPlannedSets || '–'}
          </span>{' '}
          sets logged
        </p>
      </header>

      {sessionDone && (
        <div className="flex justify-end">
          <ShareWorkoutButton
            session={session}
            setLogs={setLogs}
            exercises={exerciseMap}
            unitSystem={profile?.unitSystem ?? 'kg'}
          />
        </div>
      )}

      {sessionDone && (
        <WellbeingCard
          session={session}
          onEdit={() => setWellbeingTarget('edit')}
        />
      )}

      {livePlan.length === 0 ? (
        <EmptyPlan
          onAdd={() => setPickerTarget({ kind: 'add' })}
          locked={sessionDone}
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {(() => {
            let supersetIdx = 0;
            return livePlan.map((block, blockIdx) => {
              const letter =
                block.type === 'superset'
                  ? String.fromCharCode(0x41 + supersetIdx++)
                  : null;
              return (
                <li key={blockIdx}>
                  <BlockCard
                    sessionId={sessionId}
                    profileId={session.profileId}
                    block={block}
                    blockOrder={blockIdx}
                    supersetLetter={letter}
                    exerciseMap={exerciseMap}
                    logsByKey={logsByKey}
                    locked={sessionDone}
                    barWeight={defaultBar?.weight ?? null}
                    plateInventory={plateInv?.plates ?? null}
                    latestBodyweight={latestBw?.weight ?? null}
                    useBodyweightForVolume={
                      profile?.useBodyweightForVolume ?? false
                    }
                    warmupPercentages={
                      profile?.warmupPercentages ?? [30, 45, 60]
                    }
                    onSwap={(exerciseOrder) =>
                      setPickerTarget({
                        kind: 'swap',
                        blockOrder: blockIdx,
                        exerciseOrder,
                      })
                    }
                  />
                </li>
              );
            });
          })()}
        </ol>
      )}

      {!sessionDone && livePlan.length > 0 && (
        <button
          type="button"
          onClick={() => setPickerTarget({ kind: 'add' })}
          className="self-center rounded-full border border-dashed border-line-strong bg-surface-soft/40 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
        >
          + Add exercise
        </button>
      )}

      {sessionDone && (
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-line/60 pt-6">
          <p className="text-center text-xs text-fg-muted">
            Editing a logged set updates it in place. Deleting the
            workout removes it and every set log + PR attached to it.
          </p>
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={busy !== null}
            className="rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-fg-muted hover:text-fg disabled:opacity-50"
          >
            Delete workout…
          </button>
        </div>
      )}

      {!sessionDone && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-bg/90 px-5 py-4 backdrop-blur"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
          }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              onClick={discard}
              disabled={busy !== null}
              className="text-xs uppercase tracking-[0.18em] text-fg-muted transition hover:text-fg disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={busy !== null}
              className="flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-fg shadow-lift transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'finish' ? 'Finishing…' : 'Finish workout'}
            </button>
          </div>
        </div>
      )}

      <RestTimerBar />

      {celebration && (
        <PRCelebration
          awards={celebration}
          exerciseMap={exerciseMap}
          onClose={closeCelebration}
        />
      )}

      {backupPrompt && profile && (
        <BackupPromptModal profile={profile} onClose={closeBackupPrompt} />
      )}

      {deleteConfirm && (
        <DeleteWorkoutModal
          planName={session.planName}
          busy={busy === 'delete'}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={confirmDelete}
        />
      )}

      {wellbeingTarget && (
        <WellbeingPromptModal
          mode={wellbeingTarget}
          {...(wellbeingTarget === 'edit'
            ? {
                initial:
                  session.moodAfter !== undefined ||
                  session.energyAfter !== undefined
                    ? {
                        mood: session.moodAfter ?? null,
                        energy: session.energyAfter ?? null,
                      }
                    : {
                        mood: session.moodBefore ?? null,
                        energy: session.energyBefore ?? null,
                      },
              }
            : {})}
          onSave={handleWellbeingSave}
          onSkip={handleWellbeingSkip}
        />
      )}

      <ExercisePicker
        open={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onSelect={handlePicked}
        title={pickerTarget?.kind === 'swap' ? 'Swap exercise' : 'Add exercise'}
        {...(pickerTarget?.kind === 'swap' &&
        livePlan[pickerTarget.blockOrder]?.exercises[pickerTarget.exerciseOrder]
          ? {
              excludeId:
                livePlan[pickerTarget.blockOrder]!.exercises[
                  pickerTarget.exerciseOrder
                ]!.exerciseId,
            }
          : {})}
      />
    </section>
  );
}

interface EmptyPlanProps {
  onAdd: () => void;
  locked: boolean;
}

function EmptyPlan({ onAdd, locked }: EmptyPlanProps) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface-soft/40 p-8 text-center">
      <p className="font-display text-lg italic text-fg-soft">
        Free as a bird.
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        No plan yet — add exercises as you go.
      </p>
      {!locked && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          + Add exercise
        </button>
      )}
    </div>
  );
}

interface BlockCardProps {
  sessionId: string;
  /** The session's owning profile — needed by autofill for the
   * cross-session "what did I lift last time?" lookup. */
  profileId: string;
  block: Block;
  blockOrder: number;
  supersetLetter: string | null;
  exerciseMap: Map<string, Exercise>;
  logsByKey: Map<string, SetLog>;
  locked: boolean;
  barWeight: number | null;
  plateInventory: PlateInventoryEntry[] | null;
  latestBodyweight: number | null;
  useBodyweightForVolume: boolean;
  warmupPercentages: readonly number[];
  onSwap: (exerciseOrder: number) => void;
}

function BlockCard({
  sessionId,
  profileId,
  block,
  blockOrder,
  supersetLetter,
  exerciseMap,
  logsByKey,
  locked,
  barWeight,
  plateInventory,
  latestBodyweight,
  useBodyweightForVolume,
  warmupPercentages,
  onSwap,
}: BlockCardProps) {
  const skipped = !!block.skipped;
  const toggleSkip = () => setBlockSkipped(sessionId, blockOrder, !skipped);

  return (
    <article
      className={[
        'rounded-2xl border bg-surface p-4 shadow-soft transition',
        skipped ? 'border-line opacity-70' : 'border-line',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {supersetLetter && (
            <>
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
                Superset
              </span>
              <span className="font-mono text-[0.7rem] font-semibold text-accent">
                {supersetLetter}
              </span>
            </>
          )}
          {skipped && (
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-faint">
              Skipped
            </span>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            onClick={toggleSkip}
            className="text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted transition hover:text-accent"
          >
            {skipped ? 'Resume' : 'Skip block'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {block.exercises.map((ex, exIdx) => (
          <ExerciseGroup
            key={exIdx}
            sessionId={sessionId}
            profileId={profileId}
            blockOrder={blockOrder}
            exerciseOrder={exIdx}
            planned={ex}
            exercise={exerciseMap.get(ex.exerciseId)}
            supersetMarker={
              supersetLetter ? `${supersetLetter}${exIdx + 1}` : null
            }
            logsByKey={logsByKey}
            blockSkipped={skipped}
            locked={locked}
            barWeight={barWeight}
            plateInventory={plateInventory}
            latestBodyweight={latestBodyweight}
            useBodyweightForVolume={useBodyweightForVolume}
            warmupPercentages={warmupPercentages}
            onSwap={() => onSwap(exIdx)}
          />
        ))}
      </div>
    </article>
  );
}

interface ExerciseGroupProps {
  sessionId: string;
  profileId: string;
  blockOrder: number;
  exerciseOrder: number;
  planned: PlannedExercise;
  exercise: Exercise | undefined;
  supersetMarker: string | null;
  logsByKey: Map<string, SetLog>;
  blockSkipped: boolean;
  locked: boolean;
  barWeight: number | null;
  plateInventory: PlateInventoryEntry[] | null;
  latestBodyweight: number | null;
  useBodyweightForVolume: boolean;
  warmupPercentages: readonly number[];
  onSwap: () => void;
}

function ExerciseGroup({
  sessionId,
  profileId,
  blockOrder,
  exerciseOrder,
  planned,
  exercise,
  supersetMarker,
  logsByKey,
  blockSkipped,
  locked,
  barWeight,
  plateInventory,
  latestBodyweight,
  useBodyweightForVolume,
  warmupPercentages,
  onSwap,
}: ExerciseGroupProps) {
  const [previewing, setPreviewing] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  // Cross-session "what did I lift last time?" lookup. Returns the
  // most recent non-warmup set from any prior session for this
  // profile + exercise. Used as the autofill default for set 1 when
  // there's no in-session prior set to inherit from.
  const priorMetric = useMostRecentSetMetric(
    profileId,
    exercise?.id,
    sessionId,
  );
  if (!exercise) {
    return (
      <div className="text-sm text-fg-muted">
        Missing exercise: <code>{planned.exerciseId}</code>
      </div>
    );
  }
  const target = formatTarget(planned);
  const canRemoveSet = planned.setCount > 1;
  const warmupSets = planned.warmupSets ?? [];
  // The warm-up generator stashes specs on the planned slot at
  // setNumbers 1..N and bumps setCount by N. To avoid renumbering
  // existing rows we only allow generation when the slot has neither
  // existing warm-ups nor any logged sets. Also gated on weighted
  // exercises — bodyweight / time / walking lifts have no working
  // weight to multiply against.
  const hasAnyLogsForSlot = Array.from(
    { length: planned.setCount },
    (_, i) => i + 1,
  ).some((n) => logsByKey.has(`${blockOrder}-${exerciseOrder}-${n}`));
  const canGenerateWarmups =
    exercise.measurementType === 'weight_reps' &&
    warmupPercentages.length > 0 &&
    warmupSets.length === 0 &&
    !hasAnyLogsForSlot;

  /** Per-set autofill defaults. Walks back through the in-session
   * sets (N-1, N-2, ... 1) for the most recent logged value of each
   * metric. Falls back to the cross-session prior. Falls back again
   * to the planned-range midpoint (for reps / duration) or 0.
   *
   * Warm-up rows (setNumbers 1..N when `planned.warmupSets` is set)
   * short-circuit to the suggested weight/reps so the row pre-fills
   * with the calculated warm-up load and survives undo. */
  const computeDefaults = (
    setNumber: number,
  ): {
    weight: number;
    reps: number;
    durationSeconds: number;
    steps: number;
    distance: number;
  } => {
    if (setNumber <= warmupSets.length) {
      const spec = warmupSets[setNumber - 1]!;
      return {
        weight: spec.weight,
        reps: spec.reps,
        durationSeconds: 0,
        steps: 0,
        distance: 0,
      };
    }
    let weight: number | undefined;
    let reps: number | undefined;
    let durationSeconds: number | undefined;
    let steps: number | undefined;
    let distance: number | undefined;
    for (let n = setNumber - 1; n >= 1; n--) {
      const prior = logsByKey.get(`${blockOrder}-${exerciseOrder}-${n}`);
      if (!prior) continue;
      // Skip warm-up sets so a 60% pre-logged warm-up doesn't drag the
      // first working set's default weight down to itself. Working sets
      // should default to the cross-session prior weight (or 0).
      if (prior.setType === 'warmup') continue;
      if (weight === undefined && prior.weight !== undefined) {
        weight = prior.weight;
      }
      if (reps === undefined && prior.reps !== undefined) {
        reps = prior.reps;
      }
      if (
        durationSeconds === undefined &&
        prior.durationSeconds !== undefined
      ) {
        durationSeconds = prior.durationSeconds;
      }
      if (steps === undefined && prior.steps !== undefined) {
        steps = prior.steps;
      }
      if (distance === undefined && prior.distance !== undefined) {
        distance = prior.distance;
      }
      if (
        weight !== undefined &&
        reps !== undefined &&
        durationSeconds !== undefined &&
        steps !== undefined &&
        distance !== undefined
      ) {
        break;
      }
    }
    // Cross-session fallback (only when in-session yielded nothing
    // for that metric).
    if (priorMetric) {
      if (weight === undefined && priorMetric.weight !== undefined) {
        weight = priorMetric.weight;
      }
      if (reps === undefined && priorMetric.reps !== undefined) {
        reps = priorMetric.reps;
      }
      if (
        durationSeconds === undefined &&
        priorMetric.durationSeconds !== undefined
      ) {
        durationSeconds = priorMetric.durationSeconds;
      }
      if (steps === undefined && priorMetric.steps !== undefined) {
        steps = priorMetric.steps;
      }
      if (distance === undefined && priorMetric.distance !== undefined) {
        distance = priorMetric.distance;
      }
    }
    // Planned-range midpoints (last resort for reps + duration).
    const plannedRepsMidpoint = planned.reps
      ? Math.round((planned.reps.min + planned.reps.max) / 2)
      : 0;
    const plannedDurationMidpoint = planned.durationSeconds
      ? Math.round(
          (planned.durationSeconds.min + planned.durationSeconds.max) / 2,
        )
      : exercise.measurementType === 'walking' ||
          exercise.measurementType === 'distance'
        ? 1800
        : 0;
    return {
      weight: weight ?? 0,
      reps: reps ?? plannedRepsMidpoint,
      durationSeconds: durationSeconds ?? plannedDurationMidpoint,
      steps: steps ?? 0,
      distance: distance ?? 0,
    };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {supersetMarker && (
            <span className="font-mono text-[0.7rem] font-semibold text-accent">
              {supersetMarker}
            </span>
          )}
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="text-left text-sm font-medium leading-snug text-fg transition hover:text-accent"
            title="How to do this exercise"
          >
            {exercise.name}
            <span aria-hidden className="ml-1 text-fg-faint">?</span>
          </button>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          {target}
        </span>
      </div>
      {planned.notes && (
        <p className="text-xs italic text-fg-muted">{planned.notes}</p>
      )}

      {/* Top-of-list warm-up affordance. Only renders when generation
        * is currently allowed (weighted lift, no warm-ups yet, no logs
        * yet for the slot, block not locked). Disappears as soon as
        * warm-ups are generated, so it doesn't clutter the row layout
        * mid-workout. */}
      {!locked && !blockSkipped && canGenerateWarmups && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setWarmupOpen(true)}
            className="rounded-full border border-line bg-surface-soft px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent/40 hover:text-accent"
          >
            + Warm-ups
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {Array.from({ length: planned.setCount }, (_, i) => i + 1).map(
          (setNumber) => {
            const defaults = computeDefaults(setNumber);
            const isWarmupPosition = setNumber <= warmupSets.length;
            return (
              <SetRow
                key={setNumber}
                sessionId={sessionId}
                blockOrder={blockOrder}
                exerciseOrder={exerciseOrder}
                setNumber={setNumber}
                planned={planned}
                exercise={exercise}
                existingLog={
                  logsByKey.get(`${blockOrder}-${exerciseOrder}-${setNumber}`) ??
                  null
                }
                blockSkipped={blockSkipped}
                barWeight={barWeight}
                plateInventory={plateInventory}
                latestBodyweight={latestBodyweight}
                useBodyweightForVolume={useBodyweightForVolume}
                defaultWeight={defaults.weight}
                defaultReps={defaults.reps}
                defaultDuration={defaults.durationSeconds}
                defaultSteps={defaults.steps}
                defaultDistance={defaults.distance}
                {...(isWarmupPosition
                  ? { defaultSetType: 'warmup' as const }
                  : {})}
              />
            );
          },
        )}
      </div>

      {!locked && !blockSkipped && (
        <div className="flex items-center justify-end gap-3 text-[0.65rem] uppercase tracking-[0.14em]">
          <button
            type="button"
            onClick={() => onSwap()}
            className="text-fg-muted transition hover:text-accent"
          >
            Swap
          </button>
          {canRemoveSet && (
            <button
              type="button"
              onClick={() =>
                changeSetCount(sessionId, blockOrder, exerciseOrder, -1)
              }
              className="text-fg-muted transition hover:text-accent"
            >
              − Set
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              changeSetCount(sessionId, blockOrder, exerciseOrder, 1)
            }
            className="text-fg-muted transition hover:text-accent"
          >
            + Set
          </button>
        </div>
      )}
      {warmupOpen && (
        <WarmupGeneratorModal
          exerciseName={exercise.name}
          initialTarget={priorMetric?.weight ?? 0}
          percentages={warmupPercentages}
          onCancel={() => setWarmupOpen(false)}
          onGenerate={(warmups) => {
            void addWarmupSets(
              sessionId,
              blockOrder,
              exerciseOrder,
              warmups,
            );
            setWarmupOpen(false);
          }}
        />
      )}
      {previewing && (
        <ExerciseDetail
          exercise={exercise}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

interface WellbeingCardProps {
  session: import('../types').Session;
  onEdit: () => void;
}

function WellbeingCard({ session, onEdit }: WellbeingCardProps) {
  const snap = snapshotFromSession(session);
  const empty = !hasAnyRating(snap);

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={empty ? 'Add wellbeing ratings' : 'Edit wellbeing ratings'}
      className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lift"
    >
      <header className="flex items-baseline justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Wellbeing
        </span>
        <span
          aria-hidden
          className="text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint group-hover:text-accent"
        >
          {empty ? '+ Add' : 'Edit'}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <RatingPair label="Mood" before={snap.moodBefore} after={snap.moodAfter} />
        <RatingPair label="Energy" before={snap.energyBefore} after={snap.energyAfter} />
      </div>
    </button>
  );
}

function RatingPair({
  label,
  before,
  after,
}: {
  label: string;
  before: number | null;
  after: number | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <RatingValue value={before} hint="before" />
        <span aria-hidden className="text-fg-faint">
          →
        </span>
        <RatingValue value={after} hint="after" />
      </div>
    </div>
  );
}

function RatingValue({
  value,
  hint,
}: {
  value: number | null;
  hint: 'before' | 'after';
}) {
  if (value === null) {
    return (
      <span
        className="text-[0.6rem] uppercase tracking-[0.14em] text-fg-faint"
        title={`No ${hint} rating recorded`}
      >
        —
      </span>
    );
  }
  const idx = Math.min(Math.max(value, 1), 5) - 1;
  return (
    <span
      className="flex items-baseline gap-1 text-fg"
      title={`${hint}: ${RATING_LABELS[idx]}`}
    >
      <span aria-hidden className="text-base">
        {RATING_EMOJI[idx]}
      </span>
      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted">
        {RATING_LABELS[idx]}
      </span>
    </span>
  );
}

/** Confirmation dialog for "Delete workout" on the completed-session
 * view. Uses the same bottom-sheet shape as BackupPromptModal /
 * WellbeingPromptModal. Type-to-confirm would be overkill for one
 * session row — JSON backup is the safety net per CLAUDE.md, plus
 * the body text spells out exactly what gets removed. */
function DeleteWorkoutModal({
  planName,
  busy,
  onCancel,
  onConfirm,
}: {
  planName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete workout ${planName}`}
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Delete workout
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {planName}
          </h2>
          <p className="text-sm text-fg-muted">
            This permanently removes the session, every set log
            attached to it, and every PR earned during it. There&apos;s
            no undo.
          </p>
        </header>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionSkeleton() {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <div className="h-8 w-1/3 animate-pulse rounded bg-surface-soft" />
      <div className="h-64 animate-pulse rounded-2xl bg-surface-soft" />
    </section>
  );
}

function mergePlanForSwap(
  existing: PlannedExercise,
  next: Exercise,
): PlannedExercise {
  const oldIsTime = existing.durationSeconds !== undefined;
  const newIsTime =
    next.measurementType === 'time_seconds' ||
    next.measurementType === 'walking';
  if (oldIsTime !== newIsTime) {
    // Measurement type mismatch — start fresh.
    return { ...plannedFromExercise(next), setCount: existing.setCount };
  }
  return {
    exerciseId: next.id,
    setCount: existing.setCount,
    ...(existing.reps ? { reps: existing.reps } : {}),
    ...(existing.durationSeconds
      ? { durationSeconds: existing.durationSeconds }
      : {}),
    ...(next.perSide || existing.perSide ? { perSide: true } : {}),
    ...(existing.notes ? { notes: existing.notes } : {}),
    ...(existing.restSeconds !== undefined
      ? { restSeconds: existing.restSeconds }
      : {}),
  };
}

function plannedFromExercise(exercise: Exercise): PlannedExercise {
  // Sensible default plan for a freshly-added exercise: 3 sets of
  // 8–12 reps for weight/bodyweight, 30–60s for time-based, one
  // ~30 minute "set" for walking. The user can tweak via +/− Set or
  // the per-set steppers.
  if (exercise.measurementType === 'walking') {
    return {
      exerciseId: exercise.id,
      setCount: 1,
      durationSeconds: { min: 1500, max: 2700 },
    };
  }
  if (exercise.measurementType === 'time_seconds') {
    return {
      exerciseId: exercise.id,
      setCount: 3,
      durationSeconds: { min: 30, max: 60 },
    };
  }
  return {
    exerciseId: exercise.id,
    setCount: 3,
    reps: { min: 8, max: 12 },
    ...(exercise.perSide ? { perSide: true } : {}),
  };
}

function formatTarget(planned: PlannedExercise): string {
  const parts: string[] = [`${planned.setCount}×`];
  if (planned.reps) {
    parts.push(`${planned.reps.min}–${planned.reps.max} reps`);
  } else if (planned.durationSeconds) {
    // For long durations (≥ 5 minutes — walks, long holds, intervals)
    // display in minutes; everything shorter stays in seconds.
    const { min, max } = planned.durationSeconds;
    if (min >= 300) {
      parts.push(`${Math.round(min / 60)}–${Math.round(max / 60)} min`);
    } else {
      parts.push(`${min}–${max}s`);
    }
  } else {
    parts.push('—');
  }
  if (planned.perSide) parts.push('(each)');
  return parts.join(' ');
}
