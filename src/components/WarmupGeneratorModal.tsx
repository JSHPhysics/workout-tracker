import { useEffect, useState } from 'react';
import { NumberStepper } from './NumberStepper';

interface Props {
  /** The exercise name shown in the header so the user knows which slot
   * they're generating warm-ups for (esp. mid-superset). */
  exerciseName: string;
  /** Initial target — usually the autofill / cross-session prior. */
  initialTarget: number;
  /** Stepper increment in kg — also the snap unit applied to each
   * warm-up weight in the preview & the eventual write. */
  step?: number;
  /** Percentages from the active profile, in order. */
  percentages: readonly number[];
  /** Called with one entry per percentage — already snapped to `step`,
   * with the user-chosen reps. */
  onGenerate: (warmups: { weight: number; reps: number }[]) => void;
  onCancel: () => void;
}

const DEFAULT_REPS = 5;

/** Round to nearest `step`. Snaps the % maths to a barbell-friendly
 * weight (typically 2.5 kg). Negative values clamp to 0 since the
 * stepper does the same. */
function snap(weight: number, step: number): number {
  if (step <= 0) return weight;
  const snapped = Math.round(weight / step) * step;
  return Math.max(0, Number(snapped.toFixed(2)));
}

/** Bottom-sheet modal that asks for the working weight, previews each
 * warm-up at its configured % (snapped to `step` kg), and on confirm
 * hands the list back to the caller for persistence.
 *
 * Reps default to 5 across all warm-ups — fine for the generator
 * step; the user can fine-tune per-row inline after the warm-ups
 * land in the session list. */
export function WarmupGeneratorModal({
  exerciseName,
  initialTarget,
  step = 2.5,
  percentages,
  onGenerate,
  onCancel,
}: Props) {
  const [target, setTarget] = useState<number>(
    initialTarget > 0 ? initialTarget : 60,
  );
  const [reps, setReps] = useState<number>(DEFAULT_REPS);

  // Esc closes — same affordance as other prompts in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const preview = percentages.map((pct) => ({
    pct,
    weight: snap((target * pct) / 100, step),
  }));
  const canGenerate = target > 0 && percentages.length > 0;

  const generate = () => {
    if (!canGenerate) return;
    onGenerate(preview.map((p) => ({ weight: p.weight, reps })));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generate warm-up sets"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Warm-up sets
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {exerciseName}
          </h2>
          <p className="text-sm text-fg-muted">
            Set your working weight — we'll pre-log {percentages.length}{' '}
            warm-up sets at {percentages.join(' / ')}% of it.
          </p>
        </header>

        <section className="flex items-center justify-between gap-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Target weight
          </span>
          <NumberStepper
            value={target}
            onChange={setTarget}
            step={step}
            min={0}
            format={(v) => `${v} kg`}
            width={6}
            ariaLabel="Working weight in kilograms"
          />
        </section>

        <section className="flex items-center justify-between gap-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Reps per warm-up
          </span>
          <NumberStepper
            value={reps}
            onChange={setReps}
            step={1}
            min={1}
            max={20}
            width={3}
            ariaLabel="Reps per warm-up set"
          />
        </section>

        <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface-soft p-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Preview
          </span>
          <ul className="flex flex-col gap-1">
            {preview.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-sm tabular-nums text-fg"
              >
                <span className="text-fg-muted">
                  Set {i + 1}{' '}
                  <span className="text-[0.65rem] uppercase tracking-[0.14em]">
                    {p.pct}%
                  </span>
                </span>
                <span className="font-mono">
                  {p.weight} kg × {reps}
                </span>
              </li>
            ))}
            {preview.length === 0 && (
              <li className="text-xs text-fg-muted">
                No percentages configured. Add some in Settings → Warm-up sets.
              </li>
            )}
          </ul>
        </section>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            autoFocus
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
