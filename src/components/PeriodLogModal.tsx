import { useEffect, useState } from 'react';
import {
  addPeriodLog,
  deletePeriodLog,
  updatePeriodLog,
  usePeriodLogs,
} from '../db/period';
import {
  CYCLE_PHASE_COLORS,
  CYCLE_PHASE_LABELS,
  type PeriodLog,
} from '../types';
import {
  averageCycleLength,
  cyclePhaseAt,
  predictedNextStart,
} from '../domain/cycle';

interface Props {
  profileId: string;
  onClose: () => void;
}

const FULL_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const COMPACT_DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function dateAddingDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA').format(d);
}

export function PeriodLogModal({ profileId, onClose }: Props) {
  const logs = usePeriodLogs(profileId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState(todayLocal());
  const [draftEnd, setDraftEnd] = useState('');
  const [busy, setBusy] = useState(false);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId) setEditingId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingId]);

  const sortedLogs = (logs ?? []).slice().reverse(); // newest first
  const today = todayLocal();
  const todayPhase = logs ? cyclePhaseAt(today, logs) : null;
  const avgCycle = logs ? averageCycleLength(logs) : null;
  const next = logs ? predictedNextStart(logs) : null;

  const startQuick = async (date: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await addPeriodLog({ profileId, startDate: date });
    } finally {
      setBusy(false);
    }
  };

  const startCustom = async () => {
    if (busy || !draftStart) return;
    setBusy(true);
    try {
      await addPeriodLog({
        profileId,
        startDate: draftStart,
        ...(draftEnd ? { endDate: draftEnd } : {}),
      });
      setDraftStart(todayLocal());
      setDraftEnd('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (log: PeriodLog) => {
    if (
      !window.confirm(
        `Delete the period that started ${FULL_DATE.format(
          new Date(`${log.startDate}T12:00:00Z`),
        )}?`,
      )
    ) {
      return;
    }
    await deletePeriodLog(log.id);
  };

  const beginEdit = (log: PeriodLog) => {
    setEditingId(log.id);
    setDraftStart(log.startDate);
    setDraftEnd(log.endDate ?? '');
  };

  const commitEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      await updatePeriodLog(editingId, {
        startDate: draftStart,
        endDate: draftEnd === '' ? null : draftEnd,
      });
      setEditingId(null);
      setDraftStart(todayLocal());
      setDraftEnd('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Period log"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
              Cycle
            </span>
            <h2 className="font-display text-2xl font-light leading-tight">
              Period log
            </h2>
            <p className="text-sm text-fg-muted">
              Stays on this device. Used only to compute cycle phase
              context elsewhere in the app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-fg-muted transition hover:bg-surface-elevated hover:text-fg"
          >
            ✕
          </button>
        </header>

        {/* Today's status */}
        {todayPhase && (
          <article
            className="flex flex-col gap-1 rounded-2xl border px-3 py-2"
            style={{
              borderColor: `${CYCLE_PHASE_COLORS[todayPhase.phase]}55`,
              background: `${CYCLE_PHASE_COLORS[todayPhase.phase]}14`,
            }}
          >
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
              Today
            </span>
            <span className="font-display text-base">
              Day {todayPhase.dayOfCycle} ·{' '}
              <span style={{ color: CYCLE_PHASE_COLORS[todayPhase.phase] }}>
                {CYCLE_PHASE_LABELS[todayPhase.phase]}
              </span>
              {todayPhase.overdue && (
                <span className="ml-1 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
                  (overdue)
                </span>
              )}
            </span>
            {(avgCycle !== null || next) && (
              <span className="text-[0.65rem] tabular-nums text-fg-muted">
                {avgCycle !== null && `Avg cycle ${avgCycle} days`}
                {avgCycle !== null && next && ' · '}
                {next &&
                  `Next predicted ${COMPACT_DATE.format(new Date(`${next}T12:00:00Z`))}`}
              </span>
            )}
          </article>
        )}

        {/* Quick log */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
            Log a new period start
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void startQuick(todayLocal())}
              disabled={busy || editingId !== null}
              className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              Started today
            </button>
            <button
              type="button"
              onClick={() => void startQuick(dateAddingDays(-1))}
              disabled={busy || editingId !== null}
              className="rounded-full border border-line px-4 py-2 text-xs text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Yesterday
            </button>
          </div>
          <details className="rounded-xl border border-line bg-surface-soft/50 px-3 py-2 text-xs">
            <summary className="cursor-pointer text-[0.65rem] uppercase tracking-[0.16em] text-fg-muted">
              {editingId ? 'Edit dates' : 'Custom date'}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
                  Start date
                </span>
                <input
                  type="date"
                  value={draftStart}
                  max={todayLocal()}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
                  End date (optional)
                </span>
                <input
                  type="date"
                  value={draftEnd}
                  min={draftStart}
                  max={todayLocal()}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </label>
              <div className="flex justify-end gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraftStart(todayLocal());
                      setDraftEnd('');
                    }}
                    className="rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-fg"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    editingId ? void commitEdit() : void startCustom()
                  }
                  disabled={busy || !draftStart}
                  className="rounded-full bg-accent px-3 py-1.5 text-[0.7rem] font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
                >
                  {editingId ? 'Save changes' : 'Add entry'}
                </button>
              </div>
            </div>
          </details>
        </section>

        {/* Recent log */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-fg-muted">
            Recent
          </h3>
          {logs === undefined ? (
            <div className="h-12 animate-pulse rounded-xl bg-surface-soft" />
          ) : sortedLogs.length === 0 ? (
            <p className="rounded-xl bg-surface-soft/60 p-3 text-xs italic text-fg-muted">
              No periods logged yet. Tap "Started today" the next time
              one begins to start the record.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/60">
              {sortedLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium tabular-nums text-fg">
                      {FULL_DATE.format(new Date(`${log.startDate}T12:00:00Z`))}
                    </span>
                    {log.endDate && (
                      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
                        Ended{' '}
                        {COMPACT_DATE.format(
                          new Date(`${log.endDate}T12:00:00Z`),
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => beginEdit(log)}
                      className="rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted transition hover:text-fg"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(log)}
                      className="rounded-full px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-accent"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
