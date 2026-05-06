import { useEffect, useMemo, useState } from 'react';
import { useExercises } from '../db/exercises';
import type { Exercise } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  /** Optional title (e.g. "Add exercise" vs "Swap exercise"). */
  title?: string;
  /** Optional id to exclude from the list (e.g. when swapping, hide the
   * one being replaced). */
  excludeId?: string;
}

export function ExercisePicker({
  open,
  onClose,
  onSelect,
  title = 'Add exercise',
  excludeId,
}: Props) {
  const exercises = useExercises();
  const [query, setQuery] = useState('');

  // Reset query whenever the picker re-opens.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    let list = exercises.filter((e) => e.id !== excludeId);
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.primaryMuscles.some((m) => m.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [exercises, query, excludeId]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-bg shadow-lift"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-col">
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
              {title}
            </span>
            <h2 className="font-display text-xl font-medium tracking-tight">
              Pick an exercise
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-soft hover:text-fg"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, muscle, category…"
            autoFocus
            className="w-full rounded-full border border-line bg-surface-soft px-4 py-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <ul className="flex-1 overflow-y-auto px-3 pb-4">
          {exercises === undefined ? (
            <li className="p-4 text-sm text-fg-muted">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="p-4 text-sm text-fg-muted">No matches.</li>
          ) : (
            filtered.map((ex) => (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ex)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-soft"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-fg">
                      {ex.name}
                    </span>
                    <span className="text-[0.7rem] uppercase tracking-[0.14em] text-fg-faint">
                      {ex.category}
                      {ex.primaryMuscles.length > 0 &&
                        ` · ${ex.primaryMuscles.join(', ')}`}
                    </span>
                  </span>
                  {ex.usesBarbell && (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-accent">
                      Barbell
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
