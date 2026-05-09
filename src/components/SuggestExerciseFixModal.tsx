import { useEffect, useState } from 'react';
import { shareText, type ShareOutcome } from '../lib/shareText';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  onClose: () => void;
}

interface Draft {
  name: string;
  diagram: string;
  demoUrl: string;
  /** Newline-separated, one step per line. */
  instructions: string;
}

/** "Suggest a fix" modal launched from ExerciseDetail. Lightweight
 * companion to /exercises/review — gives in-the-moment users a way
 * to flag bad seed data without needing to know about the whole
 * audit tool.
 *
 * Each field starts populated with the current value so blanking
 * one out is meaningful (= "delete this"). The Share Fix button
 * formats only the *changed* fields into the same JSON shape
 * /exercises/review's "Export changes" produces, so the receiver can
 * paste either kind of payload back to the same import path. */
export function SuggestExerciseFixModal({ exercise, onClose }: Props) {
  const initial: Draft = {
    name: exercise.name,
    diagram: exercise.diagram ?? '',
    demoUrl: exercise.demoUrl ?? '',
    instructions: (exercise.instructions ?? []).join('\n'),
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (key: keyof Draft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // Build the diff: only fields that changed appear in the export.
  const changed = computeChanged(initial, draft);
  const hasAny = changed.length > 0;

  const share = async () => {
    if (busy || !hasAny) return;
    setBusy(true);
    setError(null);
    try {
      const payload = [
        {
          id: exercise.id,
          name: exercise.name,
          pieces: changed.map((c) => ({
            piece: c.piece,
            current: c.current,
            suggestion: c.suggestion,
          })),
        },
      ];
      // Bare JSON is the cleanest format for the husband to forward
      // back to me. We add a one-line context header before so the
      // recipient can see at a glance what the message is, but it's
      // a JS-style comment so the JSON parses cleanly if they
      // copy the whole thing.
      const text = [
        `// Workout-tracker fix · ${exercise.name} · ${new Date().toISOString().slice(0, 10)}`,
        JSON.stringify(payload, null, 2),
      ].join('\n');
      const result = await shareText({
        title: `Workout fix: ${exercise.name}`,
        text,
      });
      setOutcome(result);
      if (result === 'shared' || result === 'copied') {
        // Close shortly after the share sheet returns so the user
        // doesn't have to manually dismiss.
        window.setTimeout(onClose, 1200);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Suggest a fix to ${exercise.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Suggest a fix
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {exercise.name}
          </h2>
          <p className="text-sm text-fg-muted">
            Change anything that&apos;s wrong, then tap Share fix to
            send the suggestion. Leave a field as-is if it&apos;s
            fine. Only changes are shared.
          </p>
        </header>

        <Field
          label="Name"
          value={draft.name}
          original={initial.name}
          onChange={(v) => update('name', v)}
          placeholder="Cleaner exercise name"
        />

        <Field
          label="Diagram"
          value={draft.diagram}
          original={initial.diagram}
          onChange={(v) => update('diagram', v)}
          placeholder="https://image.url, 'squat' slug, or empty to clear"
          hint="An image URL or the slug of an existing diagram (squat, deadlift, …)."
        />

        <Field
          label="Demo link"
          value={draft.demoUrl}
          original={initial.demoUrl}
          onChange={(v) => update('demoUrl', v)}
          placeholder="https://… YouTube, spotebi, etc."
        />

        <FieldMultiline
          label="Instructions"
          value={draft.instructions}
          original={initial.instructions}
          onChange={(v) => update('instructions', v)}
          placeholder={'One step per line, e.g.\n1. Set up the bar at hip height\n2. Hinge at the hips…'}
        />

        {error && (
          <p className="text-xs text-accent" role="alert">
            {error}
          </p>
        )}
        {outcome === 'shared' && (
          <p className="text-xs text-accent" role="status">
            Shared — thanks!
          </p>
        )}
        {outcome === 'copied' && (
          <p className="text-xs text-accent" role="status">
            Copied to clipboard — paste it into a chat to send.
          </p>
        )}
        {outcome === 'cancelled' && (
          <p className="text-xs text-fg-muted" role="status">
            Cancelled — no message sent.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[0.65rem] text-fg-muted">
            {hasAny
              ? `${changed.length} change${changed.length === 1 ? '' : 's'} ready`
              : 'No changes yet'}
          </span>
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
              onClick={share}
              disabled={busy || !hasAny}
              className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sharing…' : 'Share fix'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Diff helper ---------------------------------------------------------

interface ChangedPiece {
  piece: 'name' | 'diagram' | 'demoUrl' | 'instructions';
  current: string | null;
  suggestion: string;
}

function computeChanged(initial: Draft, draft: Draft): ChangedPiece[] {
  const out: ChangedPiece[] = [];
  if (norm(initial.name) !== norm(draft.name)) {
    out.push({
      piece: 'name',
      current: initial.name,
      suggestion: draft.name,
    });
  }
  if (norm(initial.diagram) !== norm(draft.diagram)) {
    out.push({
      piece: 'diagram',
      current: initial.diagram === '' ? null : initial.diagram,
      suggestion: draft.diagram,
    });
  }
  if (norm(initial.demoUrl) !== norm(draft.demoUrl)) {
    out.push({
      piece: 'demoUrl',
      current: initial.demoUrl === '' ? null : initial.demoUrl,
      suggestion: draft.demoUrl,
    });
  }
  if (norm(initial.instructions) !== norm(draft.instructions)) {
    out.push({
      piece: 'instructions',
      current: initial.instructions === '' ? null : initial.instructions,
      suggestion: draft.instructions,
    });
  }
  return out;
}

function norm(s: string): string {
  return s.trim();
}

// --- Field components ----------------------------------------------------

function Field({
  label,
  value,
  original,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  original: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const dirty = norm(value) !== norm(original);
  return (
    <section className="flex flex-col gap-1">
      <span
        className={[
          'text-[0.6rem] font-medium uppercase tracking-[0.18em]',
          dirty ? 'text-accent' : 'text-fg-muted',
        ].join(' ')}
      >
        {label} {dirty && '·'} {dirty && <span aria-hidden>↳</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          'rounded-xl border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none',
          dirty ? 'border-accent/40' : 'border-line',
        ].join(' ')}
      />
      {hint && <p className="text-[0.6rem] text-fg-faint">{hint}</p>}
    </section>
  );
}

function FieldMultiline({
  label,
  value,
  original,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  original: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const dirty = norm(value) !== norm(original);
  return (
    <section className="flex flex-col gap-1">
      <span
        className={[
          'text-[0.6rem] font-medium uppercase tracking-[0.18em]',
          dirty ? 'text-accent' : 'text-fg-muted',
        ].join(' ')}
      >
        {label} {dirty && '·'} {dirty && <span aria-hidden>✎</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className={[
          'resize-y rounded-xl border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none',
          dirty ? 'border-accent/40' : 'border-line',
        ].join(' ')}
      />
    </section>
  );
}
