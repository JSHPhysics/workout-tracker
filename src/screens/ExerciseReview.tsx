import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseMap } from '../db/exercises';
import { ExerciseDiagram } from '../components/ExerciseDiagram';
import type { Exercise } from '../types';

// --- Persisted review state -----------------------------------------------

type Verdict = 'approved' | 'rejected';
type Piece = 'diagram' | 'demoUrl' | 'instructions';

interface PieceState {
  verdict?: Verdict;
  /** User-supplied replacement candidate. URL for diagram/demo,
   * free-form multiline text for instructions. Stored verbatim — we
   * don't validate URL shape here, the export pass does. */
  suggestion?: string;
}

interface ReviewState {
  [exerciseId: string]: Partial<Record<Piece, PieceState>>;
}

const STORAGE_KEY = 'wt:exercise-review';

function readReviewState(): ReviewState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Migration: the v1 shape stored a verdict string per piece.
    // Wrap any bare string in {verdict} so the rest of the code only
    // ever deals with PieceState objects.
    const out: ReviewState = {};
    for (const [exId, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val !== 'object' || val === null) continue;
      const pieces: Partial<Record<Piece, PieceState>> = {};
      for (const [piece, raw] of Object.entries(val as Record<string, unknown>)) {
        if (!isPiece(piece)) continue;
        if (typeof raw === 'string') {
          if (raw === 'approved' || raw === 'rejected') {
            pieces[piece] = { verdict: raw };
          }
        } else if (typeof raw === 'object' && raw !== null) {
          const obj = raw as PieceState;
          const next: PieceState = {};
          if (obj.verdict === 'approved' || obj.verdict === 'rejected') {
            next.verdict = obj.verdict;
          }
          if (typeof obj.suggestion === 'string' && obj.suggestion.trim() !== '') {
            next.suggestion = obj.suggestion;
          }
          if (next.verdict || next.suggestion) pieces[piece] = next;
        }
      }
      if (Object.keys(pieces).length > 0) out[exId] = pieces;
    }
    return out;
  } catch {
    return {};
  }
}

function isPiece(s: string): s is Piece {
  return s === 'diagram' || s === 'demoUrl' || s === 'instructions';
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
  const pieces = state[ex.id] ?? {};
  switch (filter) {
    case 'all':
      return true;
    case 'unreviewed':
      // Any of the three pieces with no verdict yet.
      return PIECES.some((p) => !pieces[p]?.verdict);
    case 'rejected':
      return PIECES.some((p) => pieces[p]?.verdict === 'rejected');
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

  /** Mutate a single (exerciseId, piece) cell in-place. Empty cells
   * (no verdict + no suggestion) are pruned so the persisted JSON
   * stays compact. The mutator receives a draft and decides what to
   * change — deleting unset properties keeps us compatible with
   * exactOptionalPropertyTypes. */
  const updatePiece = (
    exerciseId: string,
    piece: Piece,
    mutate: (draft: PieceState) => void,
  ) => {
    setState((prev) => {
      const exCur = prev[exerciseId] ?? {};
      const draft: PieceState = { ...(exCur[piece] ?? {}) };
      mutate(draft);
      // Treat empty-string suggestion as cleared.
      if (draft.suggestion !== undefined && draft.suggestion.trim() === '') {
        delete draft.suggestion;
      }
      const updatedEx = { ...exCur };
      if (!draft.verdict && !draft.suggestion) {
        delete updatedEx[piece];
      } else {
        updatedEx[piece] = draft;
      }
      const out = { ...prev };
      if (Object.keys(updatedEx).length === 0) delete out[exerciseId];
      else out[exerciseId] = updatedEx;
      return out;
    });
  };

  const setVerdict = (exerciseId: string, piece: Piece, next: Verdict | null) => {
    updatePiece(exerciseId, piece, (draft) => {
      if (next === null) delete draft.verdict;
      else draft.verdict = next;
    });
  };
  const setSuggestion = (exerciseId: string, piece: Piece, value: string) => {
    updatePiece(exerciseId, piece, (draft) => {
      draft.suggestion = value;
    });
  };

  const counts = useMemo(() => {
    let totalPieces = 0;
    let approved = 0;
    let rejected = 0;
    let suggested = 0;
    for (const ex of exercises) {
      for (const p of PIECES) {
        totalPieces += 1;
        const cell = state[ex.id]?.[p];
        if (cell?.verdict === 'approved') approved += 1;
        else if (cell?.verdict === 'rejected') rejected += 1;
        if (cell?.suggestion) suggested += 1;
      }
    }
    return { totalPieces, approved, rejected, suggested };
  }, [exercises, state]);

  /** Export every exercise that has a rejection OR a suggestion
   * (whichever is non-empty). Suggestions without a verdict still
   * count — sometimes you'll want to suggest a better demo link
   * without going as far as marking the existing one rejected. */
  const exportRejections = async () => {
    const out: {
      id: string;
      name: string;
      pieces: {
        piece: Piece;
        verdict?: Verdict;
        current: string | null;
        suggestion?: string;
      }[];
    }[] = [];
    for (const ex of exercises) {
      const cells = state[ex.id];
      if (!cells) continue;
      const rows = PIECES.flatMap((p) => {
        const cell = cells[p];
        if (!cell) return [];
        if (cell.verdict !== 'rejected' && !cell.suggestion) return [];
        const row: {
          piece: Piece;
          verdict?: Verdict;
          current: string | null;
          suggestion?: string;
        } = {
          piece: p,
          current: currentValueFor(ex, p),
        };
        if (cell.verdict) row.verdict = cell.verdict;
        if (cell.suggestion) row.suggestion = cell.suggestion;
        return [row];
      });
      if (rows.length > 0) {
        out.push({ id: ex.id, name: ex.name, pieces: rows });
      }
    }
    const payload = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setExportFlash(
        `Copied ${out.length} exercise${out.length === 1 ? '' : 's'} to clipboard.`,
      );
    } catch {
      setExportFlash(`Couldn't copy. Open the browser console for the JSON.`);
      // eslint-disable-next-line no-console
      console.info('Exercise review export:\n' + payload);
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
          rejected, and optionally type a replacement (URL for
          diagram/demo, free-form text for instructions). Persisted
          in localStorage. Export the result so I can roll the
          changes into the seed.
        </p>
      </header>

      <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-fg">
            {counts.approved} approved · {counts.rejected} rejected ·{' '}
            {counts.suggested} with suggestion
          </span>
          <span className="text-fg-muted">
            {counts.totalPieces} pieces total
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportRejections}
            disabled={counts.rejected === 0 && counts.suggested === 0}
            className="rounded-full bg-accent px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            Export changes
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
              cells={state[ex.id] ?? {}}
              onVerdict={(piece, next) => setVerdict(ex.id, piece, next)}
              onSuggestion={(piece, value) =>
                setSuggestion(ex.id, piece, value)
              }
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
  cells,
  onVerdict,
  onSuggestion,
}: {
  exercise: Exercise;
  cells: Partial<Record<Piece, PieceState>>;
  onVerdict: (piece: Piece, next: Verdict | null) => void;
  onSuggestion: (piece: Piece, value: string) => void;
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
        cell={cells.diagram}
        onVerdict={(v) => onVerdict('diagram', v)}
        onSuggestion={(v) => onSuggestion('diagram', v)}
        suggestionPlaceholder="https://… image URL or 'squat' slug"
        suggestionKind="line"
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
        cell={cells.demoUrl}
        onVerdict={(v) => onVerdict('demoUrl', v)}
        onSuggestion={(v) => onSuggestion('demoUrl', v)}
        suggestionPlaceholder="https://… replacement URL"
        suggestionKind="line"
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
        cell={cells.instructions}
        onVerdict={(v) => onVerdict('instructions', v)}
        onSuggestion={(v) => onSuggestion('instructions', v)}
        suggestionPlaceholder="One step per line — I'll split on newlines."
        suggestionKind="multiline"
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
  cell,
  onVerdict,
  onSuggestion,
  suggestionPlaceholder,
  suggestionKind,
  children,
}: {
  label: string;
  cell: PieceState | undefined;
  onVerdict: (next: Verdict | null) => void;
  onSuggestion: (value: string) => void;
  suggestionPlaceholder: string;
  suggestionKind: 'line' | 'multiline';
  children: React.ReactNode;
}) {
  const verdict = cell?.verdict;
  const suggestion = cell?.suggestion ?? '';
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
            onClick={() => onVerdict(verdict === 'approved' ? null : 'approved')}
            label="Approve"
            symbol="✓"
          />
          <VerdictPill
            active={verdict === 'rejected'}
            tone="reject"
            onClick={() => onVerdict(verdict === 'rejected' ? null : 'rejected')}
            label="Reject"
            symbol="✗"
          />
        </div>
      </div>
      <div>{children}</div>
      <SuggestionInput
        value={suggestion}
        onChange={onSuggestion}
        placeholder={suggestionPlaceholder}
        kind={suggestionKind}
      />
    </div>
  );
}

function SuggestionInput({
  value,
  onChange,
  placeholder,
  kind,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  kind: 'line' | 'multiline';
}) {
  const filled = value.trim() !== '';
  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          'text-[0.55rem] font-medium uppercase tracking-[0.18em]',
          filled ? 'text-accent' : 'text-fg-faint',
        ].join(' ')}
      >
        Suggestion {filled && '·'} {filled && (kind === 'multiline' ? '✎' : '↳')}
      </span>
      {kind === 'multiline' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={[
            'w-full resize-y rounded-md border bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none',
            filled ? 'border-accent/40' : 'border-line',
          ].join(' ')}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={[
            'w-full rounded-md border bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none',
            filled ? 'border-accent/40' : 'border-line',
          ].join(' ')}
        />
      )}
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
