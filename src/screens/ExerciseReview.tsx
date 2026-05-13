import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseMap } from '../db/exercises';
import { useRoutines } from '../db/routines';
import { ExerciseDiagram } from '../components/ExerciseDiagram';
import { buildIssueUrl } from '../lib/githubIssueUrl';
import type { Exercise, RoutineTemplate } from '../types';

// --- Persisted review state -----------------------------------------------

type Verdict = 'approved' | 'rejected';
type Piece = 'name' | 'diagram' | 'demoUrl' | 'instructions';

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
  return (
    s === 'name' ||
    s === 'diagram' ||
    s === 'demoUrl' ||
    s === 'instructions'
  );
}

function writeReviewState(state: ReviewState): { ok: boolean; reason?: string } {
  if (typeof localStorage === 'undefined') return { ok: true };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    // QuotaExceededError lands here when the data URL pile-up overflows
    // the origin's 5–10 MB localStorage budget. We surface it to the
    // UI so the user can clear / export rather than silently losing
    // edits.
    return {
      ok: false,
      reason:
        err instanceof DOMException && err.name === 'QuotaExceededError'
          ? 'localStorage is full — export now and clear suggestions to free space.'
          : `Save failed: ${(err as Error).message}`,
    };
  }
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
// can mark it "needs work" by rejecting. Order matters: rendered
// top-to-bottom on each card.
const PIECES: readonly Piece[] = [
  'name',
  'diagram',
  'demoUrl',
  'instructions',
];

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
  const routines = useRoutines();
  const [state, setState] = useState<ReviewState>(readReviewState);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [exportFlash, setExportFlash] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Persist on every change. If the write fails (typically because
  // accumulated image data URLs blew the localStorage quota) we
  // surface the reason in the header card.
  useEffect(() => {
    const result = writeReviewState(state);
    setPersistError(result.ok ? null : (result.reason ?? 'Save failed.'));
  }, [state]);

  const exercises = useMemo<Exercise[]>(() => {
    if (!exerciseMap) return [];
    return Array.from(exerciseMap.values())
      .filter((e) => !e.isCustom)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  }, [exerciseMap]);

  // Reverse index of which routines (and which workout days within
  // them) reference each exercise. Built once across all routines so
  // every card lookup is O(1). Days are deduped per (routine, label)
  // so multi-week routines that repeat A/B/C tags don't show "A, A,
  // A, A" on every card.
  const routineUsageByExercise = useMemo(
    () => buildRoutineUsageIndex(routines ?? []),
    [routines],
  );

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
  const buildExportPayload = () => {
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
    return out;
  };

  const exportRejections = async () => {
    const out = buildExportPayload();
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

  /** File the audit batch as a GitHub issue. The payload may run to
   * thousands of lines on a full library pass, well past what URL
   * params reliably carry — so we copy the JSON to the clipboard
   * first and open the new-issue page with a placeholder body. The
   * user pastes inside the code-fence the autopull script looks for
   * and submits. */
  const openAsIssue = async () => {
    const out = buildExportPayload();
    if (out.length === 0) return;
    const payload = JSON.stringify(out, null, 2);
    let copied = false;
    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
    } catch {
      // eslint-disable-next-line no-console
      console.info('Exercise review export (copy manually):\n' + payload);
    }
    const today = new Date().toISOString().slice(0, 10);
    const body = [
      `<!-- Auto-generated by the workout-tracker exercise review tool on ${today} -->`,
      `<!-- ${out.length} exercise${out.length === 1 ? '' : 's'} flagged. Paste the JSON ${copied ? 'from your clipboard ' : ''}between the fences below. -->`,
      '',
      '```json',
      copied ? '' : payload,
      '```',
    ].join('\n');
    const url = buildIssueUrl({
      title: `Exercise audit: ${out.length} exercise${out.length === 1 ? '' : 's'} flagged`,
      body,
      labels: ['suggestion'],
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    setExportFlash(
      copied
        ? `Copied ${out.length} exercise${out.length === 1 ? '' : 's'} — paste into the issue body.`
        : `Couldn't copy — JSON in browser console; paste manually.`,
    );
    window.setTimeout(() => setExportFlash(null), 6000);
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
            onClick={openAsIssue}
            disabled={counts.rejected === 0 && counts.suggested === 0}
            title="Copy the JSON and open a prefilled GitHub issue (requires login)"
            className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Open as issue
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
        {persistError && (
          <p className="text-[0.65rem] text-accent" role="alert">
            {persistError}
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
              routineUsage={routineUsageByExercise.get(ex.id) ?? []}
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

// --- Routine usage index --------------------------------------------------

interface RoutineUsage {
  routineId: string;
  routineName: string;
  isSeed: boolean;
  /** Workout-day labels within this routine that reference the
   * exercise — e.g. ['A', 'B'] for StrongLifts when the lift is on
   * both days. Falls back to "Day N" when no workoutLabel is set.
   * Deduped so multi-week routines don't show "A, A, A, A". */
  dayLabels: string[];
}

function buildRoutineUsageIndex(
  routines: readonly RoutineTemplate[],
): Map<string, RoutineUsage[]> {
  const out = new Map<string, RoutineUsage[]>();
  for (const routine of routines) {
    // Per (exercise, day-label) tracking inside this routine — lets
    // us add to dayLabels without duplicates across weeks.
    const perExerciseDays = new Map<string, Set<string>>();
    for (const week of routine.weeks) {
      for (const day of week.days) {
        if (day.kind !== 'workout') continue;
        const dayLabel = day.workoutLabel ?? `Day ${day.dayNumber}`;
        for (const block of day.blocks) {
          for (const planned of block.exercises) {
            const set = perExerciseDays.get(planned.exerciseId) ?? new Set();
            set.add(dayLabel);
            perExerciseDays.set(planned.exerciseId, set);
          }
        }
      }
    }
    for (const [exerciseId, daySet] of perExerciseDays) {
      const usage: RoutineUsage = {
        routineId: routine.id,
        routineName: routine.name,
        isSeed: routine.isSeed,
        dayLabels: Array.from(daySet).sort(),
      };
      const arr = out.get(exerciseId) ?? [];
      arr.push(usage);
      out.set(exerciseId, arr);
    }
  }
  // Sort routines by name within each exercise's list so the
  // pills render in stable order.
  for (const arr of out.values()) {
    arr.sort((a, b) =>
      a.routineName.localeCompare(b.routineName, undefined, {
        sensitivity: 'base',
      }),
    );
  }
  return out;
}

function currentValueFor(ex: Exercise, piece: Piece): string | null {
  switch (piece) {
    case 'name':
      return ex.name;
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
  routineUsage,
  onVerdict,
  onSuggestion,
}: {
  exercise: Exercise;
  cells: Partial<Record<Piece, PieceState>>;
  routineUsage: readonly RoutineUsage[];
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

      <RoutineUsagePills usage={routineUsage} />

      <PieceRow
        label="Name"
        cell={cells.name}
        onVerdict={(v) => onVerdict('name', v)}
        onSuggestion={(v) => onSuggestion('name', v)}
        suggestionPlaceholder="Type a better name and I'll rename in the next import"
        suggestionKind="line"
      >
        <span className="text-sm font-medium text-fg">{exercise.name}</span>
      </PieceRow>

      <PieceRow
        label="Diagram"
        cell={cells.diagram}
        onVerdict={(v) => onVerdict('diagram', v)}
        onSuggestion={(v) => onSuggestion('diagram', v)}
        suggestionPlaceholder="https://… URL, 'squat' slug, or paste/drop an image"
        suggestionKind="image"
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

/** Small horizontal row of pills showing every routine that
 * references the exercise, with the workout-day labels rolled up
 * (so "StrongLifts · A, B" not two pills). Helps the reviewer
 * trace a seeded exercise back to its source material when
 * sourcing better instructions / images. */
function RoutineUsagePills({ usage }: { usage: readonly RoutineUsage[] }) {
  if (usage.length === 0) {
    return (
      <p className="text-[0.6rem] italic text-fg-faint">
        Not referenced by any seeded routine.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {usage.map((u) => (
        <span
          key={u.routineId}
          title={`${u.routineName} · workouts ${u.dayLabels.join(', ')}`}
          className={[
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem]',
            u.isSeed
              ? 'border-accent/30 bg-accent-soft text-accent'
              : 'border-line bg-surface-soft text-fg-muted',
          ].join(' ')}
        >
          <span className="font-medium">{u.routineName}</span>
          <span className="text-fg-muted/80">· {u.dayLabels.join(', ')}</span>
        </span>
      ))}
    </div>
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
  suggestionKind: 'line' | 'multiline' | 'image';
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
  kind: 'line' | 'multiline' | 'image';
}) {
  if (kind === 'image') {
    return (
      <ImageSuggestionInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }
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

/** Diagram suggestion supports four input modes:
 *   - paste an image (Ctrl/Cmd+V on the drop zone)
 *   - drag & drop an image file onto the drop zone
 *   - click "Choose file" to open the picker
 *   - OR type a URL / slug into the text fallback below
 *
 * Pasted/picked images are resized to a 600 px long edge and
 * encoded as JPEG data URLs (~30–80 KB each), so 50+ image
 * suggestions still fit comfortably in localStorage's typical
 * 5 MB origin quota. The stored value stays a single string —
 * either a `data:image/...` URL, an https URL, or a slug — so the
 * export shape doesn't need a new field. */
function ImageSuggestionInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const filled = value.trim() !== '';
  const isDataImage = value.startsWith('data:image/');
  const isImageLike = isDataImage || /^https?:\/\//i.test(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleBlob = async (blob: Blob) => {
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await blobToResizedDataUrl(blob);
      onChange(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) await handleBlob(blob);
        return;
      }
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await handleBlob(file);
    }
  };

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await handleBlob(file);
    }
    // Allow re-picking the same file.
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={[
          'text-[0.55rem] font-medium uppercase tracking-[0.18em]',
          filled ? 'text-accent' : 'text-fg-faint',
        ].join(' ')}
      >
        Suggestion {filled ? `· ${isDataImage ? '🖼' : '↳'}` : ''}
      </span>

      {/* Drop / paste zone. tabIndex makes it focusable so Ctrl+V
        * delivers the paste event reliably. */}
      <div
        tabIndex={0}
        role="button"
        aria-label="Paste, drop, or focus to upload an image"
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        className={[
          'flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed bg-surface px-3 py-2 text-center transition focus:outline-none focus:ring-1 focus:ring-accent',
          dragActive
            ? 'border-accent bg-accent-soft'
            : filled && isImageLike
              ? 'border-accent/40'
              : 'border-line hover:border-line-strong',
        ].join(' ')}
      >
        {busy ? (
          <span className="text-[0.65rem] text-fg-muted">Processing…</span>
        ) : isImageLike ? (
          <img
            src={value}
            alt="Suggested diagram"
            className="max-h-32 max-w-full rounded"
          />
        ) : filled ? (
          <span className="break-all text-xs text-fg">{value}</span>
        ) : (
          <>
            <span className="text-xs text-fg-muted">
              Click here, then paste · or drop an image
            </span>
            <span className="text-[0.6rem] text-fg-faint">
              Resized to 600 px JPEG
            </span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[0.6rem]">
        <label className="cursor-pointer text-fg-muted underline-offset-2 hover:text-accent hover:underline">
          Choose file
          <input
            type="file"
            accept="image/*"
            onChange={onFilePick}
            className="sr-only"
          />
        </label>
        {filled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-fg-faint underline-offset-2 hover:text-fg hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* URL / slug fallback. Hidden (visually) when an image is
        * pasted — clear it first to switch back to typing. */}
      <input
        type="text"
        value={isDataImage ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={isDataImage}
        title={
          isDataImage
            ? 'Clear the pasted image to type a URL or slug here.'
            : ''
        }
        className={[
          'w-full rounded-md border bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-50',
          !isDataImage && filled ? 'border-accent/40' : 'border-line',
        ].join(' ')}
      />

      {error && (
        <p className="text-[0.65rem] text-accent" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Resize a pasted/dropped image to a max long-edge of 600 px and
 * re-encode as JPEG quality 0.78. Keeps each image around 30–80 KB
 * so 50+ suggestions fit in localStorage's typical 5 MB origin
 * quota with headroom. */
async function blobToResizedDataUrl(blob: Blob): Promise<string> {
  const MAX_DIM = 600;
  const QUALITY = 0.78;
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(MAX_DIM / bitmap.width, MAX_DIM / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Encoding failed — got an unexpected data URL.');
  }
  return dataUrl;
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
