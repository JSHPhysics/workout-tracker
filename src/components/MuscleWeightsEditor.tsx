import { useEffect, useMemo, useState } from 'react';
import { NumberStepper } from './NumberStepper';
import {
  clearMuscleVolumeOverride,
  setMuscleVolumeOverride,
} from '../db/muscleVolumeOverrides';
import { defaultMuscleWeights } from '../domain/volume';
import type { MuscleWeights } from '../domain/volume';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../types';

interface Props {
  profileId: string;
  exercise: Exercise;
  /** The current persisted override, or undefined when none exists. */
  current: MuscleWeights | undefined;
  onClose: () => void;
}

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

/** Convert a multiplier (0.0–2.0) ⇄ percentage (0–200) for the
 * stepper UI. Using ints avoids floating-point gunk in the store
 * during edits; we round-trip on save. */
function multToPct(m: number): number {
  return Math.round(m * 100);
}
function pctToMult(p: number): number {
  return Math.round(p) / 100;
}

/** Editor for a single exercise's per-muscle volume weighting. The
 * starting state is either the user's saved override (when present)
 * or the default derived from the exercise's primary/secondary tags.
 *
 * Save writes the override; "Reset to default" clears it (chart
 * falls back to seeded behaviour). Cancel discards. */
export function MuscleWeightsEditor({
  profileId,
  exercise,
  current,
  onClose,
}: Props) {
  const defaults = useMemo(() => defaultMuscleWeights(exercise), [exercise]);
  // Local editing buffer keyed by muscle → percentage (int).
  const [pcts, setPcts] = useState<Partial<Record<MuscleGroup, number>>>(
    () => {
      const seed = current ?? defaults;
      const out: Partial<Record<MuscleGroup, number>> = {};
      for (const [m, w] of Object.entries(seed)) {
        if (typeof w === 'number') out[m as MuscleGroup] = multToPct(w);
      }
      return out;
    },
  );
  const [adding, setAdding] = useState<MuscleGroup | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updatePct = (m: MuscleGroup, next: number) => {
    setPcts((prev) => ({ ...prev, [m]: next }));
  };
  const removeMuscle = (m: MuscleGroup) => {
    setPcts((prev) => {
      const next = { ...prev };
      delete next[m];
      return next;
    });
  };
  const addMuscle = () => {
    if (!adding) return;
    if (pcts[adding] !== undefined) return;
    setPcts((prev) => ({ ...prev, [adding]: 50 }));
    setAdding('');
  };

  // Sort the rows for stable display: defaults first (in their
  // original order), then user-added muscles alphabetically.
  const orderedRows = useMemo(() => {
    const inDefault = Object.keys(defaults) as MuscleGroup[];
    const seen = new Set<MuscleGroup>();
    const out: MuscleGroup[] = [];
    for (const m of inDefault) {
      if (pcts[m] !== undefined) {
        out.push(m);
        seen.add(m);
      }
    }
    const extras = (Object.keys(pcts) as MuscleGroup[])
      .filter((m) => !seen.has(m))
      .sort((a, b) => MUSCLE_LABEL[a].localeCompare(MUSCLE_LABEL[b]));
    return [...out, ...extras];
  }, [pcts, defaults]);

  const availableToAdd = useMemo(
    () =>
      MUSCLE_GROUPS.filter((m) => pcts[m] === undefined).sort((a, b) =>
        MUSCLE_LABEL[a].localeCompare(MUSCLE_LABEL[b]),
      ),
    [pcts],
  );

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const weights: MuscleWeights = {};
      for (const [m, p] of Object.entries(pcts)) {
        if (typeof p !== 'number') continue;
        if (p === 0) continue; // 0% means "drop this muscle"
        weights[m as MuscleGroup] = pctToMult(p);
      }
      await setMuscleVolumeOverride(profileId, exercise.id, weights);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clearMuscleVolumeOverride(profileId, exercise.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Default summary for the read-only baseline section.
  const defaultRows = useMemo(
    () =>
      (Object.entries(defaults) as [MuscleGroup, number][])
        .sort((a, b) => b[1] - a[1])
        .map(([m, w]) => ({ muscle: m, pct: multToPct(w) })),
    [defaults],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit muscle weights for ${exercise.name}`}
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Volume weighting
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {exercise.name}
          </h2>
          <p className="text-sm text-fg-muted">
            How much credit each muscle gets when this exercise's
            volume is summed on the Progress chart. 100% = full
            credit.
          </p>
        </header>

        <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface-soft p-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Default for this exercise
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {defaultRows.map((row) => (
              <li
                key={row.muscle}
                className="rounded-full border border-line bg-surface px-2 py-0.5 text-[0.65rem] text-fg-muted"
              >
                <span className="font-medium text-fg">
                  {MUSCLE_LABEL[row.muscle]}
                </span>{' '}
                {row.pct}%
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Your override
          </span>
          {orderedRows.length === 0 ? (
            <p className="rounded-xl bg-surface-soft/60 p-3 text-xs italic text-fg-muted">
              No muscles configured — saving now would zero this
              exercise out of the chart entirely. Add at least one
              row, or hit Reset to fall back to the default.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {orderedRows.map((m) => (
                <li
                  key={m}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-soft/40 px-2.5 py-1.5"
                >
                  <span className="text-sm font-medium text-fg">
                    {MUSCLE_LABEL[m]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <NumberStepper
                      value={pcts[m] ?? 0}
                      onChange={(next) => updatePct(m, next)}
                      step={5}
                      min={0}
                      max={200}
                      format={(v) => `${v}%`}
                      width={5}
                      ariaLabel={`${MUSCLE_LABEL[m]} weight percentage`}
                    />
                    <button
                      type="button"
                      onClick={() => removeMuscle(m)}
                      aria-label={`Remove ${MUSCLE_LABEL[m]}`}
                      title="Remove"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-fg-faint transition hover:bg-surface-elevated hover:text-fg"
                    >
                      <span aria-hidden className="text-sm leading-none">
                        ×
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {availableToAdd.length > 0 && (
          <section className="flex items-center gap-2">
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value as MuscleGroup | '')}
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              <option value="">Add a muscle…</option>
              {availableToAdd.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABEL[m]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addMuscle}
              disabled={!adding}
              className="rounded-full border border-line bg-surface-soft px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              Add
            </button>
          </section>
        )}

        {error && (
          <p className="text-xs text-accent" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {current ? (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-full px-3 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg disabled:opacity-50"
            >
              Reset to default
            </button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || orderedRows.length === 0}
              className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save override'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
