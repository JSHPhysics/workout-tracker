import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { forkRoutine, useRoutine } from '../db/routines';
import { useExerciseMap } from '../db/exercises';
import { createSession } from '../db/sessions';
import { useActiveProfile } from '../state/activeProfile';
import type {
  Block,
  DayTemplate,
  Exercise,
  PlannedExercise,
  RoutineTemplate,
  WeekTemplate,
} from '../types';

export function RoutineDetail() {
  const { id } = useParams<{ id: string }>();
  const routine = useRoutine(id);
  const exerciseMap = useExerciseMap();
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const navigate = useNavigate();
  const [activeWeek, setActiveWeek] = useState<number>(1);
  const [forking, setForking] = useState(false);

  const handleEdit = async () => {
    if (!routine) return;
    if (routine.isSeed) {
      if (!profileId) return;
      if (
        !window.confirm(
          `${routine.name} is built-in and read-only. Create an editable copy?`,
        )
      ) {
        return;
      }
      setForking(true);
      try {
        const newId = await forkRoutine(routine.id, profileId);
        navigate(`/routines/${newId}/edit`);
      } finally {
        setForking(false);
      }
    } else {
      navigate(`/routines/${routine.id}/edit`);
    }
  };

  if (routine === null) return <Navigate to="/routines" replace />;

  if (routine === undefined || exerciseMap === undefined) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-6">
        <div
          aria-hidden
          className="h-8 w-1/3 animate-pulse rounded bg-surface-soft"
        />
        <div
          aria-hidden
          className="h-32 animate-pulse rounded-2xl bg-surface-soft"
        />
      </section>
    );
  }

  const week =
    routine.weeks.find((w) => w.weekNumber === activeWeek) ?? routine.weeks[0];

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/routines"
          className="self-start text-[0.7rem] uppercase tracking-[0.2em] text-fg-muted hover:text-accent"
        >
          ← Routines
        </Link>
        {routine.isSeed && (
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Built-in
          </span>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl font-light leading-[1.1] tracking-tight">
            {routine.name}
          </h1>
          <button
            type="button"
            onClick={handleEdit}
            disabled={forking}
            className="rounded-full border border-line px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {forking ? '…' : routine.isSeed ? 'Fork & edit' : 'Edit'}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-fg-muted">
          {routine.description}
        </p>
      </header>

      <WeekSwitcher
        weeks={routine.weeks}
        active={activeWeek}
        onChange={setActiveWeek}
      />

      {week && (
        <WeekView
          routine={routine}
          week={week}
          exerciseMap={exerciseMap}
        />
      )}
    </section>
  );
}

interface WeekSwitcherProps {
  weeks: WeekTemplate[];
  active: number;
  onChange: (weekNumber: number) => void;
}

function WeekSwitcher({ weeks, active, onChange }: WeekSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Weeks"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {weeks.map((w) => {
        const isActive = w.weekNumber === active;
        return (
          <button
            key={w.weekNumber}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(w.weekNumber)}
            className={[
              'min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-medium tracking-wide transition',
              isActive
                ? 'border-transparent bg-accent text-accent-fg'
                : 'border-line bg-surface text-fg-soft hover:border-line-strong',
            ].join(' ')}
          >
            Week {w.weekNumber}
          </button>
        );
      })}
    </div>
  );
}

interface WeekViewProps {
  routine: RoutineTemplate;
  week: WeekTemplate;
  exerciseMap: Map<string, Exercise>;
}

function WeekView({ routine, week, exerciseMap }: WeekViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {week.days.map((day) => (
        <DayCard
          key={day.dayNumber}
          routine={routine}
          week={week}
          day={day}
          exerciseMap={exerciseMap}
        />
      ))}
    </div>
  );
}

interface DayCardProps {
  routine: RoutineTemplate;
  week: WeekTemplate;
  day: DayTemplate;
  exerciseMap: Map<string, Exercise>;
}

function DayCard({ routine, week, day, exerciseMap }: DayCardProps) {
  const navigate = useNavigate();
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (!activeProfileId || starting || day.kind !== 'workout') return;
    setStarting(true);
    try {
      const id = await createSession({
        profileId: activeProfileId,
        templateRef: {
          routineId: routine.id,
          weekNumber: week.weekNumber,
          dayNumber: day.dayNumber,
        },
        planName: `${routine.name} · W${week.weekNumber} D${day.dayNumber}${day.workoutLabel ? ` · Workout ${day.workoutLabel}` : ''}`,
        livePlan: day.blocks,
      });
      navigate(`/session/${id}`);
    } finally {
      setStarting(false);
    }
  };

  const dayLabel = `Day ${day.dayNumber}`;
  if (day.kind === 'rest') {
    return (
      <article className="rounded-2xl border border-dashed border-line bg-bg/40 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            {dayLabel}
          </span>
          <span className="font-display text-sm italic text-fg-muted">Rest</span>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            {dayLabel}
          </span>
          <h3 className="font-display text-lg font-medium tracking-tight">
            Workout {day.workoutLabel}
          </h3>
          <span className="text-xs text-fg-muted">
            {day.blocks.length} block{day.blocks.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={starting || !activeProfileId}
          className="flex min-h-[36px] items-center justify-center rounded-full bg-accent px-4 text-xs font-medium uppercase tracking-[0.12em] text-accent-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {starting ? '…' : 'Start'}
        </button>
      </div>
      <ol className="mt-4 flex flex-col gap-3">
        {(() => {
          let supersetIdx = 0;
          return day.blocks.map((block, i) => {
            const letter =
              block.type === 'superset'
                ? String.fromCharCode(0x41 + supersetIdx++)
                : null;
            return (
              <li key={i}>
                <BlockRow
                  block={block}
                  exerciseMap={exerciseMap}
                  supersetLetter={letter}
                />
              </li>
            );
          });
        })()}
      </ol>
    </article>
  );
}

interface BlockRowProps {
  block: Block;
  exerciseMap: Map<string, Exercise>;
  supersetLetter: string | null;
}

function BlockRow({ block, exerciseMap, supersetLetter }: BlockRowProps) {
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        block.type === 'superset'
          ? 'border-accent/30 bg-accent-soft'
          : 'border-line bg-surface-soft/60',
      ].join(' ')}
    >
      {block.type === 'superset' && (
        <span className="mb-2 inline-block text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
          Superset
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        {block.exercises.map((ex, i) => (
          <PlannedRow
            key={i}
            planned={ex}
            exercise={exerciseMap.get(ex.exerciseId)}
            supersetMarker={supersetLetter ? `${supersetLetter}${i + 1}` : null}
          />
        ))}
      </div>
    </div>
  );
}

interface PlannedRowProps {
  planned: PlannedExercise;
  exercise: Exercise | undefined;
  supersetMarker: string | null;
}

function PlannedRow({ planned, exercise, supersetMarker }: PlannedRowProps) {
  const target = useMemo(() => formatTarget(planned), [planned]);
  const name = exercise?.name ?? planned.exerciseId;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        {supersetMarker && (
          <span className="shrink-0 font-mono text-[0.7rem] font-semibold text-accent">
            {supersetMarker}
          </span>
        )}
        <span className="text-sm font-medium leading-snug text-fg">{name}</span>
      </div>
      <span
        className={[
          'text-xs tabular-nums text-fg-muted',
          supersetMarker ? 'pl-6' : '',
        ].join(' ')}
      >
        {target}
      </span>
    </div>
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
