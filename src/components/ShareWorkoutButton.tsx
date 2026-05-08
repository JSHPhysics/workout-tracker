import { useState } from 'react';
import { formatWorkoutSummary } from '../domain/share';
import type { Exercise, Session, SetLog, UnitSystem } from '../types';

interface Props {
  session: Session;
  setLogs: readonly SetLog[];
  exercises: Map<string, Exercise>;
  unitSystem: UnitSystem;
}

type Outcome = 'idle' | 'shared' | 'copied' | 'cancelled' | 'error';

interface NavigatorWithShare {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
}

/** "Share" button that opens the OS-native share sheet (WhatsApp,
 * Discord, Snapchat, ...) on devices that support `navigator.share`,
 * and falls back to copy-to-clipboard everywhere else.
 *
 * Renders inline in the completed-session header. The actual summary
 * formatting lives in domain/share.ts so it's testable. */
export function ShareWorkoutButton({
  session,
  setLogs,
  exercises,
  unitSystem,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setOutcome('idle');
    try {
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

      const nav = navigator as NavigatorWithShare;
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title: session.planName, text });
          setOutcome('shared');
        } catch (err) {
          // AbortError = user dismissed the share sheet without
          // picking a target. That's a normal cancel, not an error.
          if (
            err instanceof DOMException &&
            (err.name === 'AbortError' || err.name === 'NotAllowedError')
          ) {
            setOutcome('cancelled');
          } else {
            // Some browsers expose `share` but reject for unexpected
            // reasons (e.g. too-long text on iOS). Fall back to copy.
            await copyToClipboard(text);
            setOutcome('copied');
          }
        }
      } else {
        await copyToClipboard(text);
        setOutcome('copied');
      }
    } catch {
      setOutcome('error');
    } finally {
      setBusy(false);
    }
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

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Last-ditch fallback for ancient browsers — execCommand is deprecated
  // but still works where the Clipboard API doesn't exist.
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return;
  }
  throw new Error('No clipboard support available.');
}
