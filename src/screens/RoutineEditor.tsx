import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import {
  createRoutine,
  defaultRestDay,
  defaultWeek,
  defaultWorkoutDay,
  deleteRoutine,
  renumberDays,
  renumberWeeks,
  updateRoutine,
  useRoutine,
} from '../db/routines';
import { useExerciseMap } from '../db/exercises';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumberStepper } from '../components/NumberStepper';
import type {
  Block,
  DayTemplate,
  Exercise,
  PlannedExercise,
  WeekTemplate,
} from '../types';

// --- Editor entry point ----------------------------------------------------

export function RoutineEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const existing = useRoutine(isNew ? undefined : id);
  const exerciseMap = useExerciseMap();
  const navigate = useNavigate();

  // Local working copy. While the user edits, all mutations stay in
  // React state; we Save (and stamp updatedAt) on submit.
  const [draft, setDraft] = useState<RoutineDraft | null>(null);

  // Initialise the draft once the routine loads (or immediately for /new).
  useEffect(() => {
    if (draft !== null) return;
    if (isNew) {
      setDraft({
        name: '',
        description: '',
        weeks: [defaultWeek(1)],
      });
      return;
    }
    if (existing) {
      setDraft({
        name: existing.name,
        description: existing.description,
        weeks: structuredClone(existing.weeks),
      });
    }
  }, [isNew, existing, draft]);

  if (!profileId) return <Navigate to="/" replace />;
  if (!isNew && existing === null) return <Navigate to="/routines" replace />;
  if (existing && existing.isSeed) {
    // Seed routines aren't editable in place — RoutineDetail handles
    // forking. Bounce back instead of opening a stale editor.
    return <Navigate to={`/routines/${existing.id}`} replace />;
  }
  if (draft === null || exerciseMap === undefined) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-6">
        <div className="h-10 w-1/2 animate-pulse rounded bg-surface-soft" />
        <div className="h-48 animate-pulse rounded-2xl bg-surface-soft" />
      </section>
    );
  }

  return (
    <EditorBody
      isNew={isNew}
      profileId={profileId}
      existingId={existing?.id}
      draft={draft}
      setDraft={setDraft}
      exerciseMap={exerciseMap}
      onClose={() => navigate('/routines')}
    />
  );
}

// --- Working-copy types ----------------------------------------------------

interface RoutineDraft {
  name: string;
  description: string;
  weeks: WeekTemplate[];
}

// --- Body ------------------------------------------------------------------

interface BodyProps {
  isNew: boolean;
  profileId: string;
  existingId: string | undefined;
  draft: RoutineDraft;
  setDraft: (next: RoutineDraft) => void;
  exerciseMap: Map<string, Exercise>;
  onClose: () => void;
}

function EditorBody({
  isNew,
  profileId,
  existingId,
  draft,
  setDraft,
  exerciseMap,
  onClose,
}: BodyProps) {
  const navigate = useNavigate();
  const [activeWeek, setActiveWeek] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const week =
    draft.weeks.find((w) => w.weekNumber === activeWeek) ?? draft.weeks[0]!;

  const updateWeeks = (mutator: (weeks: WeekTemplate[]) => WeekTemplate[]) => {
    setDraft({ ...draft, weeks: mutator(draft.weeks) });
  };

  const updateActiveWeek = (
    mutator: (week: WeekTemplate) => WeekTemplate,
  ) => {
    updateWeeks((weeks) =>
      weeks.map((w) => (w.weekNumber === week.weekNumber ? mutator(w) : w)),
    );
  };

  const addWeek = () => {
    const next = renumberWeeks([...draft.weeks, defaultWeek(0)]);
    updateWeeks(() => next);
    setActiveWeek(next.length);
  };

  const duplicateWeek = () => {
    const cloned: WeekTemplate = {
      weekNumber: 0,
      days: structuredClone(week.days),
    };
    const next = renumberWeeks([...draft.weeks, cloned]);
    updateWeeks(() => next);
    setActiveWeek(next.length);
  };

  const deleteActiveWeek = () => {
    if (draft.weeks.length === 1) {
      setError('A routine needs at least one week');
      return;
    }
    if (!window.confirm(`Delete Week ${week.weekNumber}?`)) return;
    const next = renumberWeeks(
      draft.weeks.filter((w) => w.weekNumber !== week.weekNumber),
    );
    updateWeeks(() => next);
    setActiveWeek(Math.min(activeWeek, next.length));
  };

  const save = async () => {
    if (busy) return;
    if (draft.name.trim() === '') {
      setError('Name cannot be empty');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        const id = await createRoutine({
          profileId,
          name: draft.name,
          description: draft.description,
          weeks: draft.weeks,
        });
        navigate(`/routines/${id}`);
      } else if (existingId) {
        await updateRoutine(existingId, {
          name: draft.name.trim(),
          description: draft.description.trim(),
          weeks: draft.weeks,
        });
        navigate(`/routines/${existingId}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existingId) return;
    if (
      !window.confirm(
        `Delete "${draft.name || 'this routine'}"? This can't be undone.`,
      )
    ) {
      return;
    }
    await deleteRoutine(existingId);
    navigate('/routines');
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 pb-32">
      <header className="flex flex-col gap-3">
        <Link
          to="/routines"
          className="self-start text-[0.7rem] uppercase tracking-[0.2em] text-fg-muted hover:text-accent"
        >
          ← Routines
        </Link>
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          {isNew ? 'New routine' : 'Editing'}
        </span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Routine name"
          className="rounded-xl border border-line bg-surface px-3 py-2 font-display text-2xl font-light tracking-tight focus:border-accent focus:outline-none"
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="What's this routine for? Who's it for? How long?"
          rows={2}
          className="resize-none rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
      </header>

      <WeekTabs
        weeks={draft.weeks}
        active={activeWeek}
        onChange={setActiveWeek}
        onAdd={addWeek}
        onDuplicate={duplicateWeek}
        onDelete={deleteActiveWeek}
      />

      <WeekEditor
        week={week}
        exerciseMap={exerciseMap}
        onChange={(next) => updateActiveWeek(() => next)}
      />

      {error && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-bg/90 px-5 py-4 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-xs uppercase tracking-[0.18em] text-fg-muted transition hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-xs uppercase tracking-[0.18em] text-fg-faint transition hover:text-accent disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex min-h-[48px] items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-fg shadow-lift transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}

// --- Week tabs -------------------------------------------------------------

interface WeekTabsProps {
  weeks: WeekTemplate[];
  active: number;
  onChange: (n: number) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function WeekTabs({
  weeks,
  active,
  onChange,
  onAdd,
  onDuplicate,
  onDelete,
}: WeekTabsProps) {
  return (
    <div className="flex flex-col gap-2">
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
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add week"
          className="min-h-[36px] shrink-0 rounded-full border border-dashed border-line-strong px-3 text-xs text-fg-muted transition hover:border-accent hover:text-accent"
        >
          + Week
        </button>
      </div>
      <div className="flex justify-end gap-1 text-[0.65rem] uppercase tracking-[0.16em]">
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-full px-3 py-1 text-fg-faint transition hover:text-fg"
        >
          Duplicate week
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full px-3 py-1 text-fg-faint transition hover:text-accent"
        >
          Delete week
        </button>
      </div>
    </div>
  );
}

// --- Week editor -----------------------------------------------------------

function WeekEditor({
  week,
  exerciseMap,
  onChange,
}: {
  week: WeekTemplate;
  exerciseMap: Map<string, Exercise>;
  onChange: (next: WeekTemplate) => void;
}) {
  const setDay = (mutator: (day: DayTemplate) => DayTemplate, dayNumber: number) => {
    onChange({
      ...week,
      days: week.days.map((d) => (d.dayNumber === dayNumber ? mutator(d) : d)),
    });
  };

  const addWorkoutDay = () => {
    const nextLabel = nextWorkoutLabel(week.days);
    const day = defaultWorkoutDay(week.days.length + 1, nextLabel);
    onChange({ ...week, days: [...week.days, day] });
  };

  const addRestDay = () => {
    onChange({
      ...week,
      days: [...week.days, defaultRestDay(week.days.length + 1)],
    });
  };

  const removeDay = (dayNumber: number) => {
    if (!window.confirm(`Remove Day ${dayNumber}?`)) return;
    onChange(renumberDays({
      ...week,
      days: week.days.filter((d) => d.dayNumber !== dayNumber),
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      {week.days.map((day) => (
        <DayEditor
          key={day.dayNumber}
          day={day}
          exerciseMap={exerciseMap}
          onChange={(next) => setDay(() => next, day.dayNumber)}
          onRemove={() => removeDay(day.dayNumber)}
        />
      ))}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={addWorkoutDay}
          className="rounded-full border border-dashed border-line-strong px-4 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
        >
          + Workout day
        </button>
        <button
          type="button"
          onClick={addRestDay}
          className="rounded-full border border-dashed border-line-strong px-4 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
        >
          + Rest day
        </button>
      </div>
    </div>
  );
}

function nextWorkoutLabel(days: readonly DayTemplate[]): string {
  const used = new Set(
    days
      .filter((d) => d.kind === 'workout')
      .map((d) => d.workoutLabel ?? '')
      .filter(Boolean),
  );
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(0x41 + i);
    if (!used.has(c)) return c;
  }
  return 'X';
}

// --- Day editor ------------------------------------------------------------

function DayEditor({
  day,
  exerciseMap,
  onChange,
  onRemove,
}: {
  day: DayTemplate;
  exerciseMap: Map<string, Exercise>;
  onChange: (next: DayTemplate) => void;
  onRemove: () => void;
}) {
  const isRest = day.kind === 'rest';

  const toggleKind = () => {
    if (isRest) {
      onChange({
        ...day,
        kind: 'workout',
        workoutLabel: day.workoutLabel ?? 'A',
        blocks: day.blocks ?? [],
      });
    } else {
      onChange({ ...day, kind: 'rest', blocks: [] });
    }
  };

  const updateBlocks = (mutator: (blocks: Block[]) => Block[]) => {
    onChange({ ...day, blocks: mutator(day.blocks) });
  };

  const addSingleBlock = () => {
    updateBlocks((blocks) => [...blocks, { type: 'single', exercises: [] }]);
  };
  const addSupersetBlock = () => {
    updateBlocks((blocks) => [...blocks, { type: 'superset', exercises: [] }]);
  };

  return (
    <article
      className={[
        'flex flex-col gap-3 rounded-2xl border p-4 shadow-soft',
        isRest ? 'border-dashed border-line bg-bg/40' : 'border-line bg-surface',
      ].join(' ')}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Day {day.dayNumber}
          </span>
          {!isRest && (
            <input
              type="text"
              value={day.workoutLabel ?? ''}
              onChange={(e) =>
                onChange({ ...day, workoutLabel: e.target.value.slice(0, 4) })
              }
              aria-label="Workout label"
              className="w-12 rounded-md border border-line bg-surface-soft px-1.5 py-1 text-center font-mono text-xs uppercase text-fg focus:border-accent focus:outline-none"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleKind}
            className="rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted transition hover:text-accent"
          >
            {isRest ? 'Make workout' : 'Make rest'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint transition hover:text-accent"
          >
            Remove
          </button>
        </div>
      </header>

      {!isRest && (
        <>
          <div className="flex flex-col gap-3">
            {day.blocks.map((block, i) => (
              <BlockEditor
                key={i}
                block={block}
                exerciseMap={exerciseMap}
                onChange={(next) =>
                  updateBlocks((bs) => bs.map((b, j) => (j === i ? next : b)))
                }
                onRemove={() =>
                  updateBlocks((bs) => bs.filter((_, j) => j !== i))
                }
                {...(i > 0
                  ? {
                      onMoveUp: () =>
                        updateBlocks((bs) => {
                          const next = [...bs];
                          [next[i - 1]!, next[i]!] = [next[i]!, next[i - 1]!];
                          return next;
                        }),
                    }
                  : {})}
                {...(i < day.blocks.length - 1
                  ? {
                      onMoveDown: () =>
                        updateBlocks((bs) => {
                          const next = [...bs];
                          [next[i]!, next[i + 1]!] = [next[i + 1]!, next[i]!];
                          return next;
                        }),
                    }
                  : {})}
              />
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={addSingleBlock}
              className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
            >
              + Exercise
            </button>
            <button
              type="button"
              onClick={addSupersetBlock}
              className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
            >
              + Superset
            </button>
          </div>
        </>
      )}
    </article>
  );
}

// --- Block editor ----------------------------------------------------------

interface BlockEditorProps {
  block: Block;
  exerciseMap: Map<string, Exercise>;
  onChange: (next: Block) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

function BlockEditor({
  block,
  exerciseMap,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: BlockEditorProps) {
  const [pickerForIndex, setPickerForIndex] = useState<number | 'add' | null>(
    null,
  );

  const updateExercises = (
    mutator: (xs: PlannedExercise[]) => PlannedExercise[],
  ) => {
    onChange({ ...block, exercises: mutator(block.exercises) });
  };

  const handlePicked = (ex: Exercise) => {
    const planned = freshPlanned(ex);
    if (pickerForIndex === 'add') {
      updateExercises((xs) => [...xs, planned]);
    } else if (typeof pickerForIndex === 'number') {
      const idx = pickerForIndex;
      updateExercises((xs) =>
        xs.map((x, i) => (i === idx ? { ...x, exerciseId: ex.id } : x)),
      );
    }
    setPickerForIndex(null);
  };

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-xl border px-3 py-3',
        block.type === 'superset'
          ? 'border-accent/30 bg-accent-soft'
          : 'border-line bg-surface-soft/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
          {block.type === 'superset' ? 'Superset' : 'Single'}
        </span>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              aria-label="Move block up"
              className="rounded-full px-2 py-1 text-fg-faint transition hover:text-fg"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              aria-label="Move block down"
              className="rounded-full px-2 py-1 text-fg-faint transition hover:text-fg"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-accent"
          >
            Remove
          </button>
        </div>
      </div>

      {block.exercises.length === 0 ? (
        <p className="text-xs italic text-fg-muted">No exercises yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {block.exercises.map((planned, i) => (
            <PlannedRowEditor
              key={i}
              planned={planned}
              exercise={exerciseMap.get(planned.exerciseId)}
              onChange={(next) =>
                updateExercises((xs) =>
                  xs.map((x, j) => (j === i ? next : x)),
                )
              }
              onRemove={() =>
                updateExercises((xs) => xs.filter((_, j) => j !== i))
              }
              onSwap={() => setPickerForIndex(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPickerForIndex('add')}
        className="self-start rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-accent"
      >
        + Add exercise
      </button>

      <ExercisePicker
        open={pickerForIndex !== null}
        onClose={() => setPickerForIndex(null)}
        onSelect={handlePicked}
        title={pickerForIndex === 'add' ? 'Add exercise' : 'Swap exercise'}
      />
    </div>
  );
}

// --- Planned-row editor ----------------------------------------------------

function PlannedRowEditor({
  planned,
  exercise,
  onChange,
  onRemove,
  onSwap,
}: {
  planned: PlannedExercise;
  exercise: Exercise | undefined;
  onChange: (next: PlannedExercise) => void;
  onRemove: () => void;
  onSwap: () => void;
}) {
  const isTimeBased = exercise?.measurementType === 'time_seconds';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={onSwap}
          className="text-left text-sm font-medium leading-snug text-fg transition hover:text-accent"
        >
          {exercise?.name ?? planned.exerciseId}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-accent"
        >
          Remove
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NumberStepper
          value={planned.setCount}
          onChange={(v) => onChange({ ...planned, setCount: v })}
          step={1}
          min={1}
          max={20}
          ariaLabel="Set count"
          format={(v) => `${v} sets`}
          width={5}
        />
        {isTimeBased ? (
          <DurationRangeStepper
            value={
              planned.durationSeconds ?? { min: 30, max: 60 }
            }
            onChange={(v) => onChange({ ...planned, durationSeconds: v })}
          />
        ) : (
          <RepRangeStepper
            value={planned.reps ?? { min: 8, max: 12 }}
            onChange={(v) => onChange({ ...planned, reps: v })}
          />
        )}
        <NumberStepper
          value={planned.restSeconds ?? exercise?.defaultRestSeconds ?? 90}
          onChange={(v) => onChange({ ...planned, restSeconds: v })}
          step={15}
          min={0}
          max={600}
          ariaLabel="Rest seconds"
          format={(v) => `${v}s rest`}
          width={6}
        />
      </div>
    </div>
  );
}

function RepRangeStepper({
  value,
  onChange,
}: {
  value: { min: number; max: number };
  onChange: (next: { min: number; max: number }) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <NumberStepper
        value={value.min}
        onChange={(v) => onChange({ min: v, max: Math.max(v, value.max) })}
        step={1}
        min={1}
        max={50}
        ariaLabel="Min reps"
        format={(v) => `${v}`}
        width={3}
      />
      <span className="text-[0.65rem] text-fg-faint">to</span>
      <NumberStepper
        value={value.max}
        onChange={(v) => onChange({ min: Math.min(v, value.min), max: v })}
        step={1}
        min={1}
        max={50}
        ariaLabel="Max reps"
        format={(v) => `${v} reps`}
        width={5}
      />
    </span>
  );
}

function DurationRangeStepper({
  value,
  onChange,
}: {
  value: { min: number; max: number };
  onChange: (next: { min: number; max: number }) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <NumberStepper
        value={value.min}
        onChange={(v) => onChange({ min: v, max: Math.max(v, value.max) })}
        step={5}
        min={5}
        max={600}
        ariaLabel="Min seconds"
        format={(v) => `${v}`}
        width={4}
      />
      <span className="text-[0.65rem] text-fg-faint">to</span>
      <NumberStepper
        value={value.max}
        onChange={(v) => onChange({ min: Math.min(v, value.min), max: v })}
        step={5}
        min={5}
        max={600}
        ariaLabel="Max seconds"
        format={(v) => `${v}s`}
        width={5}
      />
    </span>
  );
}

function freshPlanned(ex: Exercise): PlannedExercise {
  if (ex.measurementType === 'time_seconds') {
    return {
      exerciseId: ex.id,
      setCount: 3,
      durationSeconds: { min: 30, max: 60 },
    };
  }
  return {
    exerciseId: ex.id,
    setCount: 3,
    reps: { min: 8, max: 12 },
  };
}

