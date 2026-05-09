import { useEffect, useMemo, useState } from 'react';
import { bumpScheduled } from '../db/scheduledSessions';
import {
  addDays,
  formatLocalDate,
  parseLocalDate,
} from '../domain/planScheduler';
import type { ScheduledSession } from '../types';

interface Props {
  session: ScheduledSession;
  /** Display name for the workout (e.g. "StrongLifts · Workout A").
   * Caller looks up the routine + day to assemble this. */
  label: string;
  onClose: () => void;
}

/** Bump a scheduled session's date. Asks the user the explicit
 * cascade question — this session only, or this and everything after
 * it in the same plan — per the user's spec. Plan-less one-off
 * scheduled sessions skip the cascade choice (nothing else to
 * cascade to). */
export function BumpScheduledModal({ session, label, onClose }: Props) {
  const [newDate, setNewDate] = useState<string>(session.plannedDate);
  const [cascade, setCascade] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const deltaDays = useMemo(() => {
    if (newDate === session.plannedDate) return 0;
    const ms =
      parseLocalDate(newDate).getTime() -
      parseLocalDate(session.plannedDate).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
  }, [newDate, session.plannedDate]);

  const canCascade = !!session.planId;
  const submit = async () => {
    if (busy || deltaDays === 0) return;
    setBusy(true);
    setError(null);
    try {
      await bumpScheduled(session.id, deltaDays, cascade && canCascade);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Quick-pick chips for common short bumps. Each computes a target
  // date relative to the *current* plannedDate so chips feel like
  // "shift by N days" rather than "go to a specific date".
  const quickShifts: { label: string; days: number }[] = [
    { label: '−1 day', days: -1 },
    { label: '+1 day', days: 1 },
    { label: '+2 days', days: 2 },
    { label: '+1 week', days: 7 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bump ${label}`}
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Bump session
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            {label}
          </h2>
          <p className="text-sm text-fg-muted">
            Currently scheduled for{' '}
            <span className="text-fg">
              {formatHuman(session.plannedDate)}
            </span>
            .
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="bump-date"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            New date
          </label>
          <input
            id="bump-date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {quickShifts.map((s) => (
              <button
                key={s.days}
                type="button"
                onClick={() => {
                  const next = formatLocalDate(
                    addDays(parseLocalDate(session.plannedDate), s.days),
                  );
                  setNewDate(next);
                }}
                className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-fg-muted transition hover:border-accent hover:text-accent"
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {canCascade && deltaDays !== 0 && (
          <section
            role="radiogroup"
            aria-label="Cascade choice"
            className="flex flex-col gap-2"
          >
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
              How far does this bump?
            </span>
            <CascadePill
              active={!cascade}
              onClick={() => setCascade(false)}
              title="This session only"
              sub="Move just this date. Subsequent sessions stay where they are."
            />
            <CascadePill
              active={cascade}
              onClick={() => setCascade(true)}
              title="This and all subsequent"
              sub={`Shift every still-pending session in this plan by ${deltaDays > 0 ? '+' : ''}${deltaDays} day${Math.abs(deltaDays) === 1 ? '' : 's'}.`}
            />
          </section>
        )}

        {error && (
          <p className="text-xs text-accent" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
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
            onClick={submit}
            disabled={busy || deltaDays === 0}
            className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? 'Bumping…'
              : deltaDays === 0
                ? 'No change'
                : 'Confirm bump'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CascadePill({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={active}
      className={[
        'flex flex-col items-start gap-0.5 rounded-2xl border bg-surface px-3 py-2 text-left text-xs transition',
        active
          ? 'border-accent shadow-soft'
          : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
      ].join(' ')}
    >
      <span className={active ? 'font-medium text-fg' : 'font-medium'}>
        {title}
      </span>
      <span className="text-[0.65rem] text-fg-muted">{sub}</span>
    </button>
  );
}

const HUMAN_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

function formatHuman(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
  return HUMAN_FMT.format(new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0));
}
