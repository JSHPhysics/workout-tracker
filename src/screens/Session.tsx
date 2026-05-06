import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  appendBlock,
  changeSetCount,
  discardSession,
  finishSession,
  setBlockSkipped,
  swapExercise,
  useSession,
} from '../db/sessions';
import { useSessionSetLogs } from '../db/setLogs';
import { useExerciseMap } from '../db/exercises';
import { useDefaultBarbell, usePlateInventory } from '../db/equipment';
import { ElapsedTime } from '../components/ElapsedTime';
import { ExercisePicker } from '../components/ExercisePicker';
import { RestTimerBar } from '../components/RestTimerBar';
import { SetRow } from '../components/SetRow';
import { useRestTimer } from '../state/restTimer';
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

export function Session() {
  const { id } = useParams<{ id: string }>();
  const session = useSession(id);
  const setLogs = useSessionSetLogs(id);
  const exerciseMap = useExerciseMap();
  const defaultBar = useDefaultBarbell(session?.profileId);
  const plateInv = usePlateInventory(session?.profileId);
  const navigate = useNavigate();
  const dismissRest = useRestTimer((s) => s.dismiss);
  const [busy, setBusy] = useState<'finish' | 'discard' | null>(null);
  const [pickerTarget, setPickerTarget] = useState<EditTarget | null>(null);

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
      await finishSession(id);
      dismissRest();
      navigate('/history');
    } finally {
      setBusy(null);
    }
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
                    block={block}
                    blockOrder={blockIdx}
                    supersetLetter={letter}
                    exerciseMap={exerciseMap}
                    logsByKey={logsByKey}
                    locked={sessionDone}
                    barWeight={defaultBar?.weight ?? null}
                    plateInventory={plateInv?.plates ?? null}
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
  block: Block;
  blockOrder: number;
  supersetLetter: string | null;
  exerciseMap: Map<string, Exercise>;
  logsByKey: Map<string, SetLog>;
  locked: boolean;
  barWeight: number | null;
  plateInventory: PlateInventoryEntry[] | null;
  onSwap: (exerciseOrder: number) => void;
}

function BlockCard({
  sessionId,
  block,
  blockOrder,
  supersetLetter,
  exerciseMap,
  logsByKey,
  locked,
  barWeight,
  plateInventory,
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
            onSwap={() => onSwap(exIdx)}
          />
        ))}
      </div>
    </article>
  );
}

interface ExerciseGroupProps {
  sessionId: string;
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
  onSwap: () => void;
}

function ExerciseGroup({
  sessionId,
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
  onSwap,
}: ExerciseGroupProps) {
  if (!exercise) {
    return (
      <div className="text-sm text-fg-muted">
        Missing exercise: <code>{planned.exerciseId}</code>
      </div>
    );
  }
  const target = formatTarget(planned);
  const canRemoveSet = planned.setCount > 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {supersetMarker && (
            <span className="font-mono text-[0.7rem] font-semibold text-accent">
              {supersetMarker}
            </span>
          )}
          <h3 className="text-sm font-medium leading-snug text-fg">
            {exercise.name}
          </h3>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          {target}
        </span>
      </div>
      {planned.notes && (
        <p className="text-xs italic text-fg-muted">{planned.notes}</p>
      )}

      <div className="flex flex-col gap-2">
        {Array.from({ length: planned.setCount }, (_, i) => i + 1).map(
          (setNumber) => (
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
            />
          ),
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
  const newIsTime = next.measurementType === 'time_seconds';
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
  // 8–12 reps for weight/bodyweight, 30–60s for time-based. The user
  // can tweak via +/− Set / per-set steppers.
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
    parts.push(
      `${planned.durationSeconds.min}–${planned.durationSeconds.max}s`,
    );
  } else {
    parts.push('—');
  }
  if (planned.perSide) parts.push('(each)');
  return parts.join(' ');
}
