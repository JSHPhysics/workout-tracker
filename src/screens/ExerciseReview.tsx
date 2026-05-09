import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseMap } from '../db/exercises';
import { ExerciseDiagram } from '../components/ExerciseDiagram';
import type { Exercise } from '../types';

// --- Persisted review state -----------------------------------------------

type Verdict = 'approved' | 'rejected';
type Piece = 'diagram' | 'demoUrl' | 'instructions';

interface ReviewState {
  // exerciseId → piece → verdict
  [exerciseId: string]: Partial<Record<Piece, Verdict>>;
}

const STORAGE_KEY = 'wt:exercise-review';

function readReviewState(): ReviewState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as ReviewState)
      : {};
  } catch {
    return {};
  }
}

function writeReviewState(state: ReviewState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Filters --------------------------------------------------------------

type Filter = 'all' | 'unreviewed' | 'rejected' | 'no-instructions' | 'no-diagram';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'rejected', label: 'Has rejection' },
  { value: 'no-instructions', label: 'No instructions' },
  { value: 'no-diagram', label: 'No diagram' },
];

// Every exercise has a slot for each — even if absent, the user
// can mark it "needs work" by rejecting.
const PIECES: readonly Piece[] = ['diagram', 'demoUrl', 'instructions'];

function matchesFilter(
  ex: Exercise,
  state: ReviewState,
  filter: Filter,
  search: string,
): boolean {
  if (search) {
    const needle = search.toLowerCase();
    if (
      !ex.name.toLowerCase().includes(needle) &&
      !ex.id.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  const verdicts = state[ex.id] ?? {};
  switch (filter) {
    case 'all':
      return true;
    case 'unreviewed':
      // Any of the three pieces with no verdict yet.
      return PIECES.some((p) => !verdicts[p]);
    case 'rejected':
      return PIECES.some((p) => verdicts[p] === 'rejected');
    case 'no-instructions':
      return !ex.instructions || ex.instructions.length === 0;
    case 'no-diagram':
      return !ex.diagram;
  }
}

// --- Screen ---------------------------------------------------------------

export function ExerciseReview() {
  const exerciseMap = useExerciseMap();
  const [state, setState] = useState<ReviewState>(readReviewState);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [exportFlash, setExportFlash] = useState<string | null>(null);

  // Persist on every change.
  useEffect(() => {
    writeReviewState(state);
  }, [state]);

  const exercises = useMemo<Exercise[]>(() => {
    if (!exerciseMap) return [];
    return Array.from(exerciseMap.values())
      .filter((e) => !e.isCustom)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  }, [exerciseMap]);

  const filtered = useMemo(
    () => exercises.filter((ex) => matchesFilter(ex, state, filter, search)),
    [exercises, state, filter, search],
  );

  const setVerdict = (exerciseId: string, piece: Piece, next: Verdict | null) => {
    setState((prev) => {
      const cur = prev[exerciseId] ?? {};
      const updated = { ...cur };
      if (next === null) delete updated[piece];
      else updated[piece] = next;
      const out = { ...prev };
      if (Object.keys(updated).length === 0) delete out[exerciseId];
      else out[exerciseId] = updated;
      return out;
    });
  };

  const counts = useMemo(() => {
    let totalPieces = 0;
    let approved = 0;
    let rejected = 0;
    for (const ex of exercises) {
      for (const p of PIECES) {
        totalPieces += 1;
        const v = state[ex.id]?.[p];
        if (v === 'approved') approved += 1;
        else if (v === 'rejected') rejected += 1;
      }
    }
    return { totalPieces, approved, rejected };
  }, [exercises, state]);

  const exportRejections = async () => {
    const rejections: {
      id: string;
      name: string;
      pieces: { piece: Piece; current: string | null }[];
    }[] = [];
    for (const ex of exercises) {
      const v = state[ex.id];
      if (!v) continue;
      const rejected = PIECES
        .filter((p) => v[p] === 'rejected')
        .map((p) => ({
          piece: p,
          current: currentValueFor(ex, p),
        }));
      if (rejected.length > 0) {
        rejections.push({ id: ex.id, name: ex.name, pieces: rejected });
      }
    }
    const payload = JSON.stringify(rejections, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setExportFlash(
        `Copied ${rejections.length} exercise${rejections.length === 1 ? '' : 's'} with rejections to clipboard.`,
      );
    } catch {
      setExportFlash(`Couldn't copy. Open the browser console for the JSON.`);
      // eslint-disable-next-line no-console
      console.info('Exercise review rejections:\n' + payload);
    }
    window.setTimeout(() => setExportFlash(null), 4000);
  };

  const resetAll = () => {
    if (!window.confirm('Clear every approve/reject mark?')) return;
    setState({});
  };

  if (!exerciseMap) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-4">
        <div className="h-8 w-1/3 animate-pulse rounded bg-surface-soft" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-soft" />
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link
          to="/settings"
          className="self-start text-[0.7rem] uppercase tracking-[0.2em] text-fg-muted hover:text-accent"
        >
          ← Settings
        </Link>
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          Library audit
        </span>
        <h1 className="font-display text-3xl font-light leading-[1.05] tracking-tight">
          Exercise review
        </h1>
        <p className="text-sm text-fg-muted">
          Walk through every seeded exercise; for each, mark the
          diagram, demo link, and instructions as ✓ approved or ✗
          rejected. Persisted in localStorage. Export the rejection
          list for me to draft replacements.
        </p>
      </header>

      <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-fg">
            {counts.approved} approved · {counts.rejected} rejected
          </span>
          <span className="text-fg-muted">
            {counts.totalPieces} pieces total
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportRejections}
            disabled={counts.rejected === 0}
            className="rounded-full bg-accent px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            Export rejections
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-fg-muted hover:text-fg"
          >
            Reset
          </button>
        </div>
        {exportFlash && (
          <p className="text-[0.65rem] text-accent" role="status">
            {exportFlash}
          </p>
        )}
      </article>

      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or id…"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={[
                'rounded-full border px-3 py-1 text-[0.6rem] font-medium uppercase tracking-[0.14em] transition',
                filter === f.value
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface-soft text-fg-muted hover:border-line-strong hover:text-fg',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[0.65rem] text-fg-faint">
          Showing {filtered.length} of {exercises.length}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((ex) => (
          <li key={ex.id}>
            <ExerciseCard
              exercise={ex}
              verdicts={state[ex.id] ?? {}}
              onVerdict={(piece, next) => setVerdict(ex.id, piece, next)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function currentValueFor(ex: Exercise, piece: Piece): string | null {
  switch (piece) {
    case 'diagram':
      return ex.diagram ?? null;
    case 'demoUrl':
      return ex.demoUrl ?? null;
    case 'instructions':
      return ex.instructions && ex.instructions.length > 0
        ? ex.instructions.join(' / ')
        : null;
  }
}

// --- Per-exercise card ----------------------------------------------------

function ExerciseCard({
  exercise,
  verdicts,
  onVerdict,
}: {
  exercise: Exercise;
  verdicts: Partial<Record<Piece, Verdict>>;
  onVerdict: (piece: Piece, next: Verdict | null) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium leading-snug">
          {exercise.name}
        </h2>
        <code className="text-[0.6rem] text-fg-faint">{exercise.id}</code>
      </header>

      <PieceRow
        label="Diagram"
        verdict={verdicts.diagram}
        onChange={(v) => onVerdict('diagram', v)}
      >
        <div className="flex items-center gap-3">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-soft">
            <ExerciseDiagram
              slug={exercise.diagram}
              className="h-full w-full"
            />
          </div>
          <span className="text-[0.65rem] text-fg-muted">
            {exercise.diagram ? (
              <code>{exercise.diagram}</code>
            ) : (
              <span className="italic">No diagram — placeholder</span>
            )}
          </span>
        </div>
      </PieceRow>

      <PieceRow
        label="Demo link"
        verdict={verdicts.demoUrl}
        onChange={(v) => onVerdict('demoUrl', v)}
      >
        {exercise.demoUrl ? (
          <a
            href={exercise.demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-xs text-accent underline-offset-2 hover:underline"
          >
            {exercise.demoUrl}
          </a>
        ) : (
          <span className="text-xs italic text-fg-faint">
            No demo URL set
          </span>
        )}
      </PieceRow>

      <PieceRow
        label="Instructions"
        verdict={verdicts.instructions}
        onChange={(v) => onVerdict('instructions', v)}
      >
        {exercise.instructions && exercise.instructions.length > 0 ? (
          <ol className="flex flex-col gap-1 text-xs text-fg-muted">
            {exercise.instructions.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-fg-faint">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-xs italic text-fg-faint">
            No instructions yet — needs drafting
          </span>
        )}
      </PieceRow>
    </article>
  );
}

function PieceRow({
  label,
  verdict,
  onChange,
  children,
}: {
  label: string;
  verdict: Verdict | undefined;
  onChange: (next: Verdict | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line/60 bg-surface-soft/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <VerdictPill
            active={verdict === 'approved'}
            tone="approve"
            onClick={() => onChange(verdict === 'approved' ? null : 'approved')}
            label="Approve"
            symbol="✓"
          />
          <VerdictPill
            active={verdict === 'rejected'}
            tone="reject"
            onClick={() => onChange(verdict === 'rejected' ? null : 'rejected')}
            label="Reject"
            symbol="✗"
          />
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function VerdictPill({
  active,
  tone,
  onClick,
  label,
  symbol,
}: {
  active: boolean;
  tone: 'approve' | 'reject';
  onClick: () => void;
  label: string;
  symbol: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-full text-xs transition',
        active
          ? tone === 'approve'
            ? 'bg-accent text-accent-fg'
            : 'bg-fg/80 text-bg'
          : 'bg-surface text-fg-muted hover:bg-surface-elevated hover:text-fg',
      ].join(' ')}
    >
      {symbol}
    </button>
  );
}
