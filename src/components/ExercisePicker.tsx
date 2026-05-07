import { useEffect, useMemo, useState } from 'react';
import { useExercises } from '../db/exercises';
import { useActiveProfile } from '../state/activeProfile';
import { useProfile } from '../db/profiles';
import { ExerciseDetail } from './ExerciseDetail';
import type { EquipmentTag, Exercise } from '../types';

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

/** True when the user can perform the exercise with their current
 * equipment. `bodyweight` is always implicitly available. */
function canPerform(
  required: readonly EquipmentTag[],
  available: readonly EquipmentTag[],
): boolean {
  if (required.length === 0) return true;
  const set = new Set<EquipmentTag>(available);
  set.add('bodyweight');
  return required.every((t) => set.has(t));
}

export function ExercisePicker({
  open,
  onClose,
  onSelect,
  title = 'Add exercise',
  excludeId,
}: Props) {
  const exercises = useExercises();
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const profile = useProfile(profileId);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [previewing, setPreviewing] = useState<Exercise | null>(null);

  // Reset state whenever the picker re-opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setShowAll(false);
      setPreviewing(null);
    }
  }, [open]);

  // Esc closes — preview first, then picker.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewing) setPreviewing(null);
      else onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, previewing]);

  const available = profile?.equipment ?? [];

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    let list = exercises.filter((e) => e.id !== excludeId);
    if (!showAll && available.length > 0) {
      list = list.filter((e) => canPerform(e.requiredEquipment, available));
    }
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.primaryMuscles.some((m) => m.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [exercises, query, excludeId, showAll, available]);

  const hiddenByEquipmentCount = useMemo(() => {
    if (!exercises || showAll) return 0;
    return exercises.filter(
      (e) =>
        e.id !== excludeId && !canPerform(e.requiredEquipment, available),
    ).length;
  }, [exercises, excludeId, showAll, available]);

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

        <div className="flex flex-col gap-2 px-5 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, muscle, category…"
            autoFocus
            className="w-full rounded-full border border-line bg-surface-soft px-4 py-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          {available.length > 0 && (
            <label className="flex items-center justify-between gap-2 px-1 text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted">
              <span>
                {showAll
                  ? 'Showing all exercises'
                  : `Filtering by your equipment${hiddenByEquipmentCount > 0 ? ` · ${hiddenByEquipmentCount} hidden` : ''}`}
              </span>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint transition hover:text-accent"
              >
                {showAll ? 'Hide unavailable' : 'Show all'}
              </button>
            </label>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto px-3 pb-4">
          {exercises === undefined ? (
            <li className="p-4 text-sm text-fg-muted">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="p-4 text-sm text-fg-muted">No matches.</li>
          ) : (
            filtered.map((ex) => (
              <li key={ex.id}>
                <div className="flex items-stretch gap-1 rounded-xl transition hover:bg-surface-soft">
                  <button
                    type="button"
                    onClick={() => onSelect(ex)}
                    className="flex flex-1 items-baseline justify-between gap-3 px-3 py-2.5 text-left"
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
                  <button
                    type="button"
                    onClick={() => setPreviewing(ex)}
                    aria-label={`How to do ${ex.name}`}
                    className="flex w-9 shrink-0 items-center justify-center rounded-r-xl text-fg-faint transition hover:bg-surface-elevated hover:text-accent"
                    title="How to"
                  >
                    ?
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {previewing && (
        <ExerciseDetail
          exercise={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
