import { useEffect, useState } from 'react';
import { RatingChips } from './RatingChips';
import { RATING_EMOJI, RATING_LABELS, RATING_VALUES } from '../domain/wellbeing';

interface Props {
  /** `'before'` shown on session start, `'after'` after Finish, `'edit'`
   * when re-opening from the read-only session view. The copy and the
   * primary CTA copy adapt; behaviour is otherwise identical. */
  mode: 'before' | 'after' | 'edit';
  /** Pre-fill values when editing (or when the user has already
   * partially answered in this session). */
  initial?: { mood: number | null; energy: number | null };
  onSave: (mood: number | null, energy: number | null) => void;
  onSkip: () => void;
}

const RATING_OPTIONS = RATING_VALUES.map((v, i) => ({
  value: v,
  label: RATING_EMOJI[i] ?? '',
  sub: RATING_LABELS[i] ?? '',
}));

const COPY: Record<Props['mode'], { eyebrow: string; title: string; sub: string; cta: string }> = {
  before: {
    eyebrow: 'Before you lift',
    title: 'How are you feeling?',
    sub: 'Quick check-in — totally optional. Tap a face for each, or skip.',
    cta: 'Start workout',
  },
  after: {
    eyebrow: 'How did that feel?',
    title: 'Same again — mood + energy.',
    sub: "Now that the work's done, where are you at?",
    cta: 'Done',
  },
  edit: {
    eyebrow: 'Wellbeing',
    title: 'Update your ratings',
    sub: 'Edit any of the four — leaving one blank clears it.',
    cta: 'Save',
  },
};

export function WellbeingPromptModal({ mode, initial, onSave, onSkip }: Props) {
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null);

  // Esc → skip (it's the lower-impact close path).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const copy = COPY[mode];
  const canSave = mode === 'edit' || mood !== null || energy !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onSkip}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            {copy.eyebrow}
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {copy.title}
          </h2>
          <p className="text-sm text-fg-muted">{copy.sub}</p>
        </header>

        <section className="flex flex-col gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Mood
          </span>
          <RatingChips
            value={mood}
            onChange={setMood}
            options={RATING_OPTIONS}
            ariaLabel="Mood rating, 1 to 5"
            emoji
          />
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Energy
          </span>
          <RatingChips
            value={energy}
            onChange={setEnergy}
            options={RATING_OPTIONS}
            ariaLabel="Energy rating, 1 to 5"
            emoji
          />
        </section>

        <div className="flex items-center justify-end gap-2">
          {mode !== 'edit' && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
            >
              Skip
            </button>
          )}
          {mode === 'edit' && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(mood, energy)}
            disabled={!canSave}
            autoFocus
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {copy.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
