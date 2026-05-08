import { useState } from 'react';
import { formatWorkoutSummary } from '../domain/share';
import { shareText, type ShareOutcome } from '../lib/shareText';
import type { Exercise, Session, SetLog, UnitSystem } from '../types';

interface Props {
  session: Session;
  setLogs: readonly SetLog[];
  exercises: Map<string, Exercise>;
  unitSystem: UnitSystem;
}

/** "Share" button that opens the OS-native share sheet (WhatsApp,
 * Discord, Snapchat, ...) on devices that support `navigator.share`,
 * and falls back to copy-to-clipboard everywhere else.
 *
 * Renders inline in the completed-session header. The actual summary
 * formatting lives in domain/share.ts; the share/copy plumbing lives
 * in lib/shareText.ts — both are reused by HistoryShareButton. */
export function ShareWorkoutButton({
  session,
  setLogs,
  exercises,
  unitSystem,
}: Props) {
  const [outcome, setOutcome] = useState<ShareOutcome | 'idle'>('idle');
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setOutcome('idle');
    const text = formatWorkoutSummary({
      session,
      setLogs,
      exercises,
      unitSystem,
      // BASE_URL is the deployed public path; combined with origin
      // it's the URL friends can tap to open the app themselves.
      appUrl:
        typeof window !== 'undefined'
          ? `${window.location.origin}${import.meta.env.BASE_URL}`
          : null,
    });
    const result = await shareText({ title: session.planName, text });
    setOutcome(result);
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-fg-muted transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
      >
        {busy ? 'Sharing…' : 'Share'}
      </button>
      {outcome === 'shared' && (
        <span className="text-[0.65rem] text-fg-muted">Shared.</span>
      )}
      {outcome === 'copied' && (
        <span className="text-[0.65rem] text-fg-muted">
          Copied to clipboard.
        </span>
      )}
      {outcome === 'error' && (
        <span className="text-[0.65rem] text-accent">
          Couldn&apos;t share.
        </span>
      )}
    </div>
  );
}
