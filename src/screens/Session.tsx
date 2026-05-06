import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useSession, finishSession, discardSession } from '../db/sessions';
import { useSessionSetLogs } from '../db/setLogs';
import { useRoutine } from '../db/routines';
import { useExerciseMap } from '../db/exercises';
import { ElapsedTime } from '../components/ElapsedTime';
import { SetRow } from '../components/SetRow';
import type {
  Block,
  DayTemplate,
  Exercise,
  PlannedExercise,
  SetLog,
} from '../types';

export function Session() {
  const { id } = useParams<{ id: string }>();
  const session = useSession(id);
  const setLogs = useSessionSetLogs(id);
  const routine = useRoutine(session?.templateRef?.routineId);
  const exerciseMap = useExerciseMap();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'finish' | 'discard' | null>(null);

  const day = useMemo<DayTemplate | null>(() => {
    if (!routine || !session?.templateRef) return null;
    const week = routine.weeks.find(
      (w) => w.weekNumber === session.templateRef!.weekNumber,
    );
    return (
      week?.days.find((d) => d.dayNumber === session.templateRef!.dayNumber) ??
      null
    );
  }, [routine, session]);

  if (session === null) return <Navigate to="/today" replace />;

  if (
    session === undefined ||
    setLogs === undefined ||
    exerciseMap === undefined ||
    (session.templateRef && routine === undefined)
  ) {
    return <SessionSkeleton />;
  }

  const logsByKey = new Map<string, SetLog>();
  for (const log of setLogs) {
    logsByKey.set(
      `${log.blockOrder}-${log.exerciseOrder}-${log.setNumber}`,
      log,
    );
  }

  const totalPlannedSets = day
    ? day.blocks.reduce(
        (sum, b) => sum + b.exercises.reduce((s, e) => s + e.setCount, 0),
        0,
      )
    : 0;
  const completedSets = setLogs.length;

  const finish = async () => {
    if (!id || busy) return;
    setBusy('finish');
    try {
      await finishSession(id);
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
      navigate('/today');
    } finally {
      setBusy(null);
    }
  };

  const sessionDone = session.completedAt !== null;

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
        {day && day.kind === 'workout' && (
          <p className="text-sm text-fg-muted">
            Day {day.dayNumber} · Workout {day.workoutLabel} ·{' '}
            <span className="tabular-nums">
              {completedSets}/{totalPlannedSets}
            </span>{' '}
            sets logged
          </p>
        )}
      </header>

      {day && day.kind === 'workout' ? (
        <ol className="flex flex-col gap-4">
          {(() => {
            let supersetIdx = 0;
            return day.blocks.map((block, blockIdx) => {
              const letter =
                block.type === 'superset'
                  ? String.fromCharCode(0x41 + supersetIdx++)
                  : null;
              return (
                <li key={blockIdx}>
                  <BlockCard
                    sessionId={session.id}
                    block={block}
                    blockOrder={blockIdx}
                    supersetLetter={letter}
                    exerciseMap={exerciseMap}
                    logsByKey={logsByKey}
                  />
                </li>
              );
            });
          })()}
        </ol>
      ) : (
        <p className="text-sm text-fg-muted">
          Free sessions arrive in milestone 4 — for now, start a workout from
          the Routines tab.
        </p>
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
    </section>
  );
}

interface BlockCardProps {
  sessionId: string;
  block: Block;
  blockOrder: number;
  supersetLetter: string | null;
  exerciseMap: Map<string, Exercise>;
  logsByKey: Map<string, SetLog>;
}

function BlockCard({
  sessionId,
  block,
  blockOrder,
  supersetLetter,
  exerciseMap,
  logsByKey,
}: BlockCardProps) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      {supersetLetter && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
            Superset
          </span>
          <span className="font-mono text-[0.7rem] font-semibold text-accent">
            {supersetLetter}
          </span>
        </div>
      )}

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
}

function ExerciseGroup({
  sessionId,
  blockOrder,
  exerciseOrder,
  planned,
  exercise,
  supersetMarker,
  logsByKey,
}: ExerciseGroupProps) {
  if (!exercise) {
    return (
      <div className="text-sm text-fg-muted">
        Missing exercise: <code>{planned.exerciseId}</code>
      </div>
    );
  }
  const target = formatTarget(planned);

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
            />
          ),
        )}
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
