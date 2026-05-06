import { useState } from 'react';
import { deleteBodyweight, upsertBodyweight } from '../db/bodyweight';
import { NumberStepper } from './NumberStepper';
import type { BodyweightLog } from '../types';

interface Props {
  profileId: string;
  logs: readonly BodyweightLog[];
}

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function todayLocal(): string {
  // Local YYYY-MM-DD (en-CA happens to format as ISO date).
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

export function BodyweightLogger({ profileId, logs }: Props) {
  const today = todayLocal();
  const todayEntry = logs.find((l) => l.date === today);

  const [weight, setWeight] = useState<number>(
    todayEntry?.weight ?? logs[logs.length - 1]?.weight ?? 75,
  );
  const [notes, setNotes] = useState<string>(todayEntry?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = async () => {
    if (!profileId || busy) return;
    setBusy(true);
    try {
      await upsertBodyweight({ profileId, date: today, weight, notes });
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this weigh-in?')) return;
    await deleteBodyweight(id);
  };

  const recent = [...logs].reverse().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <header className="flex items-baseline justify-between">
          <h3 className="font-display text-base font-medium">
            Today's weight
          </h3>
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
            {DATE_LABEL.format(new Date(`${today}T12:00:00Z`))}
          </span>
        </header>
        <div className="flex items-center justify-center">
          <NumberStepper
            value={weight}
            onChange={setWeight}
            step={0.1}
            min={20}
            max={300}
            ariaLabel="Today's bodyweight in kilograms"
            format={(v) => `${v.toFixed(1)} kg`}
            width={7}
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional note — fasted, post-meal, etc."
          className="resize-none rounded-md border border-line bg-surface-soft px-2 py-1.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
            {todayEntry ? 'Updates today' : 'Add today'}
          </span>
          <div className="flex items-center gap-2">
            {savedAt !== null && (
              <span className="text-[0.65rem] text-accent">Saved</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : todayEntry ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </article>

      {recent.length > 0 && (
        <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <header className="flex items-baseline justify-between">
            <h3 className="font-display text-base font-medium">Recent</h3>
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
              Newest first · last 10
            </span>
          </header>
          <ul className="flex flex-col divide-y divide-line/60">
            {recent.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium tabular-nums text-fg">
                    {l.weight.toFixed(1)} kg
                  </span>
                  <span className="text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
                    {DATE_LABEL.format(new Date(`${l.date}T12:00:00Z`))}
                  </span>
                  {l.notes && (
                    <span className="mt-0.5 text-xs italic text-fg-muted">
                      {l.notes}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(l.id)}
                  className="rounded-full px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-accent"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
