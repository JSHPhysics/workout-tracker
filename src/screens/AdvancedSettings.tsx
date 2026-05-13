import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import {
  disableDevMode,
  tryUnlockDevMode,
  useDevMode,
} from '../state/devMode';
import { useExerciseMap } from '../db/exercises';
import {
  clearMuscleVolumeOverride,
  useMuscleVolumeOverrides,
} from '../db/muscleVolumeOverrides';
import { MuscleWeightsEditor } from '../components/MuscleWeightsEditor';
import type { MuscleWeights } from '../domain/volume';
import type { Exercise, MuscleGroup } from '../types';

const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  forearms: 'Forearms',
  adductors: 'Adductors',
  abductors: 'Abductors',
  traps: 'Traps',
  lats: 'Lats',
};

export function AdvancedSettings() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const exerciseMap = useExerciseMap();
  const overrides = useMuscleVolumeOverrides(profileId);
  const [editorTarget, setEditorTarget] = useState<Exercise | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const overriddenExercises = useMemo<
    { exercise: Exercise; weights: MuscleWeights }[]
  >(() => {
    if (!overrides || !exerciseMap) return [];
    const out: { exercise: Exercise; weights: MuscleWeights }[] = [];
    for (const [exerciseId, weights] of overrides) {
      const ex = exerciseMap.get(exerciseId);
      if (ex) out.push({ exercise: ex, weights });
    }
    return out.sort((a, b) =>
      a.exercise.name.localeCompare(b.exercise.name, undefined, {
        sensitivity: 'base',
      }),
    );
  }, [overrides, exerciseMap]);

  if (!profileId) return null;

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/settings"
          className="self-start text-[0.7rem] uppercase tracking-[0.2em] text-fg-muted hover:text-accent"
        >
          ← Settings
        </Link>
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          Power user
        </span>
        <h1 className="font-display text-3xl font-light leading-[1.05] tracking-tight">
          Advanced features
        </h1>
        <p className="text-sm text-fg-muted">
          Knobs that most users won&apos;t need. Defaults are sensible
          starting points; tweak when you have a reason to.
        </p>
      </header>

      <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-base font-medium">
            Muscle volume weightings
          </h2>
          <p className="text-xs text-fg-muted">
            Choose how each exercise&apos;s volume is apportioned to
            muscles on the Progress chart. Defaults: primary muscles at
            100%, secondary at 50%.
          </p>
          <Link
            to="/settings/advanced/volume-rationale"
            className="self-start text-[0.65rem] font-medium uppercase tracking-[0.18em] text-accent transition hover:underline"
          >
            Why these defaults? →
          </Link>
        </header>

        {!exerciseMap || !overrides ? (
          <div className="h-16 animate-pulse rounded-xl bg-surface-soft" />
        ) : overriddenExercises.length === 0 ? (
          <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
            No overrides yet. Tap{' '}
            <span className="font-medium text-fg">+ Override an exercise</span>{' '}
            to customise one — the chart will pick up the change
            immediately.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {overriddenExercises.map(({ exercise, weights }) => (
              <li
                key={exercise.id}
                className="flex items-stretch gap-1 rounded-xl border border-line bg-surface-soft/40 pr-1"
              >
                <button
                  type="button"
                  onClick={() => setEditorTarget(exercise)}
                  className="flex flex-1 flex-col items-start gap-0.5 rounded-l-xl px-3 py-2 text-left transition hover:bg-surface-elevated/40"
                >
                  <span className="text-sm font-medium text-fg">
                    {exercise.name}
                  </span>
                  <span className="truncate text-[0.65rem] text-fg-muted">
                    {summariseWeights(weights)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Reset "${exercise.name}" to its default muscle weighting?`,
                      )
                    ) {
                      void clearMuscleVolumeOverride(profileId, exercise.id);
                    }
                  }}
                  aria-label={`Remove override for ${exercise.name}`}
                  title="Remove"
                  className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-fg-faint transition hover:bg-surface-elevated hover:text-accent"
                >
                  <span aria-hidden className="text-sm leading-none">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={!exerciseMap}
          className="self-start rounded-full border border-dashed border-line-strong bg-surface-soft/40 px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          + Override an exercise
        </button>
      </article>

      <DevModeCard />

      {editorTarget && (
        <MuscleWeightsEditor
          profileId={profileId}
          exercise={editorTarget}
          current={overrides?.get(editorTarget.id)}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {pickerOpen && exerciseMap && (
        <ExercisePickerModal
          exercises={Array.from(exerciseMap.values()).filter(
            (e) => !e.isCustom,
          )}
          alreadyOverridden={
            overrides ? new Set(overrides.keys()) : new Set()
          }
          onPick={(ex) => {
            setPickerOpen(false);
            setEditorTarget(ex);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

/** Activation-code gated card surfacing the same Developer section
 * that's normally only visible under `pnpm dev`. The code lives in
 * `state/devMode.ts` and is intentionally a soft gate — anyone reading
 * the JS bundle could find it, but a casual user (e.g. the wife
 * sharing the device) won't stumble onto it. The card stays here in
 * Advanced Settings so it's a deliberate destination, not a header
 * affordance. */
function DevModeCard() {
  const enabled = useDevMode();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    if (tryUnlockDevMode(code)) {
      setCode('');
      setError(null);
    } else {
      setError('Wrong code.');
    }
  };

  if (enabled) {
    return (
      <article className="flex flex-col gap-3 rounded-2xl border border-dashed border-accent/40 bg-surface p-4 shadow-soft">
        <header className="flex flex-col gap-1">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-accent">
            Dev mode · on
          </span>
          <h2 className="font-display text-base font-medium">
            Developer tools unlocked
          </h2>
          <p className="text-xs text-fg-muted">
            The Developer section is now showing at the bottom of the
            main Settings page — including the Exercise review tool.
            Disable to tuck it away again.
          </p>
        </header>
        <button
          type="button"
          onClick={() => disableDevMode()}
          className="self-start rounded-full border border-line bg-surface-soft px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
        >
          Disable dev mode
        </button>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-medium">Dev mode</h2>
        <p className="text-xs text-fg-muted">
          Surface the developer tools (synthetic-history seed,
          exercise review) on the deployed app. Requires an activation
          code — if you don&apos;t know it, this isn&apos;t for you.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Activation code"
          aria-label="Dev-mode activation code"
          autoComplete="off"
          className="flex-1 min-w-[10rem] rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="rounded-full bg-accent px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
      {error && (
        <p className="text-[0.65rem] text-accent" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function summariseWeights(w: MuscleWeights): string {
  const entries = Object.entries(w)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  if (entries.length === 0) return '—';
  const top = entries
    .slice(0, 3)
    .map(([m, v]) => `${MUSCLE_LABEL[m as MuscleGroup]} ${Math.round((v as number) * 100)}%`);
  return entries.length > 3
    ? `${top.join(', ')} + ${entries.length - 3}`
    : top.join(', ');
}

function ExercisePickerModal({
  exercises,
  alreadyOverridden,
  onPick,
  onClose,
}: {
  exercises: Exercise[];
  alreadyOverridden: Set<string>;
  onPick: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const sorted = useMemo(
    () =>
      [...exercises].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [exercises],
  );
  const filtered = useMemo(() => {
    if (!search) return sorted;
    const needle = search.toLowerCase();
    return sorted.filter((e) => e.name.toLowerCase().includes(needle));
  }, [sorted, search]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick an exercise to override"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col gap-3 overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-medium">Pick exercise</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
        </header>
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((ex) => {
            const has = alreadyOverridden.has(ex.id);
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onPick(ex)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface-soft"
                >
                  <span className="text-fg">{ex.name}</span>
                  {has && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.14em] text-accent">
                      Overridden
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-sm italic text-fg-muted">
              No matches.
            </li>
          )}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
