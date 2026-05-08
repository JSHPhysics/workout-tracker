import { useState } from 'react';
import { db } from '../db/db';
import { getCompletionCount } from '../db/sessions';
import { formatWorkoutSummary } from '../domain/share';
import { shareText, type ShareOutcome } from '../lib/shareText';
import type { Exercise, Session, UnitSystem } from '../types';

interface Props {
  session: Session;
  /** App-wide exercise map, hoisted to History.tsx so each row doesn't
   * re-query Dexie. The lookups happen at format time. */
  exercises: Map<string, Exercise>;
  unitSystem: UnitSystem;
}

/** Compact "Share" button for each completed session in the History
 * list. Loads the session's set logs from Dexie *only on tap* so the
 * History list itself isn't paying for full set-log data on every
 * row. Same share/clipboard fallback as the in-session button.
 *
 * Stops click propagation so tapping it doesn't also navigate into
 * the session detail (the surrounding row is a Link). */
export function HistoryShareButton({ session, exercises, unitSystem }: Props) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | 'idle'>('idle');

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setOutcome('idle');
    try {
      const [setLogs, completionNumber] = await Promise.all([
        db.setLogs.where({ sessionId: session.id }).toArray(),
        getCompletionCount(session.profileId, session),
      ]);
      const text = formatWorkoutSummary({
        session,
        setLogs,
        exercises,
        unitSystem,
        completionNumber,
        appUrl:
          typeof window !== 'undefined'
            ? `${window.location.origin}${import.meta.env.BASE_URL}`
            : null,
      });
      const result = await shareText({ title: session.planName, text });
      setOutcome(result);
    } catch {
      setOutcome('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`Share workout: ${session.planName}`}
      title={
        outcome === 'shared'
          ? 'Shared'
          : outcome === 'copied'
            ? 'Copied to clipboard'
            : outcome === 'error'
              ? "Couldn't share"
              : 'Share workout'
      }
      className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-fg-faint transition hover:bg-surface-soft hover:text-accent disabled:opacity-50"
    >
      {busy ? (
        <span aria-hidden className="text-[0.65rem]">…</span>
      ) : (
        // Compact share-up arrow glyph; matches the visual weight of
        // the existing → arrow on the row.
        <span aria-hidden className="text-base">↗</span>
      )}
    </button>
  );
}
