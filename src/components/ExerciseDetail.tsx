import { useEffect, useState } from 'react';
import { ExerciseDiagram } from './ExerciseDiagram';
import { SuggestExerciseFixModal } from './SuggestExerciseFixModal';
import { EQUIPMENT_LABELS, type Exercise } from '../types';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<Exercise['category'], string> = {
  glute: 'Glutes',
  quad: 'Quads',
  'hip-hinge': 'Hip-hinge',
  push: 'Push',
  pull: 'Pull',
  core: 'Core',
  accessory: 'Accessory',
  warmup: 'Warm-up',
  activation: 'Activation',
  cardio: 'Cardio',
  stretching: 'Stretching',
  other: 'Other',
};

/** Bottom-sheet style modal showing how to perform an exercise:
 * diagram, equipment requirements, instructions, and muscle tags. */
export function ExerciseDetail({ exercise, onClose }: Props) {
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Esc closes — but only if the suggest-fix modal isn't intercepting it
  // already. Without this guard the Esc handler here would also fire and
  // close the underlying detail sheet, which is jarring when the user
  // just meant to back out of the suggestion form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (suggestOpen) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, suggestOpen]);

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${exercise.name} details`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 shadow-lift sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
              {CATEGORY_LABEL[exercise.category]}
            </span>
            <h2 className="font-display text-2xl font-light leading-tight">
              {exercise.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-fg-muted transition hover:bg-surface-elevated hover:text-fg"
          >
            ✕
          </button>
        </header>

        <ExerciseDiagram
          slug={exercise.diagram}
          className="rounded-xl border border-line bg-surface-soft/40 px-3 py-2"
        />

        {exercise.demoUrl && (
          <a
            href={exercise.demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-line px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent"
          >
            Watch demo
            <span aria-hidden>↗</span>
          </a>
        )}

        {exercise.requiredEquipment.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
              Equipment
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {exercise.requiredEquipment.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[0.65rem] text-fg-muted"
                >
                  {EQUIPMENT_LABELS[tag]}
                </li>
              ))}
            </ul>
          </section>
        )}

        {exercise.primaryMuscles.length + exercise.secondaryMuscles.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
              Muscles
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {exercise.primaryMuscles.map((m) => (
                <li
                  key={`p-${m}`}
                  className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.65rem] font-medium text-accent"
                >
                  {m}
                </li>
              ))}
              {exercise.secondaryMuscles.map((m) => (
                <li
                  key={`s-${m}`}
                  className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[0.65rem] text-fg-muted"
                >
                  {m}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
            How to
          </h3>
          {exercise.instructions && exercise.instructions.length > 0 ? (
            <ol className="flex flex-col gap-1.5">
              {exercise.instructions.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm leading-snug text-fg"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.65rem] font-medium tabular-nums text-accent">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-surface-soft/60 p-3 text-xs italic text-fg-muted">
              No written instructions yet — search YouTube for a demo if
              you're unsure.
            </p>
          )}
        </section>

        {/* Quiet entry-point for in-the-moment fix suggestions. Opens
            a separate modal so the form lives outside this overflow
            container and so the Esc handler above can defer to it. */}
        <footer className="flex justify-end border-t border-line/60 pt-3">
          <button
            type="button"
            onClick={() => setSuggestOpen(true)}
            className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted underline-offset-4 transition hover:text-accent hover:underline"
          >
            Something off? Suggest a fix
          </button>
        </footer>
      </div>

    </div>
    {/* Rendered as a sibling — not a child of the detail backdrop —
        so a click on the suggest-modal backdrop doesn't bubble to the
        detail's onClose handler underneath. */}
    {suggestOpen && (
      <SuggestExerciseFixModal
        exercise={exercise}
        onClose={() => setSuggestOpen(false)}
      />
    )}
    </>
  );
}
