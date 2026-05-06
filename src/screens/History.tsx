import { Link } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useProfileSessions } from '../db/sessions';
import type { Session } from '../types';

const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function durationLabel(s: Session): string | null {
  if (!s.completedAt) return null;
  const ms = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function History() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const sessions = useProfileSessions(profileId);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          The receipts
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          History
        </h1>
        <p className="text-sm text-fg-muted">
          Every session you've completed, newest first.
        </p>
      </header>

      {sessions === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
            />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface-soft/50 p-6 text-center text-sm text-fg-muted">
          <span className="font-display italic">Nothing yet.</span>{' '}
          Start your first workout from the{' '}
          <Link to="/routines" className="text-accent hover:underline">
            Routines
          </Link>{' '}
          tab.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => {
            const startedAt = new Date(session.startedAt);
            const dateLabel = DAY_FORMATTER.format(startedAt);
            const timeLabel = TIME_FORMATTER.format(startedAt);
            const dur = durationLabel(session);
            const inProgress = session.completedAt === null;
            return (
              <li key={session.id}>
                <Link
                  to={`/session/${session.id}`}
                  className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex w-14 shrink-0 flex-col items-start">
                    <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
                      {dateLabel}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-fg-faint">
                      {timeLabel}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium leading-snug text-fg">
                      {session.planName}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {inProgress ? (
                        <span className="text-accent">In progress</span>
                      ) : (
                        dur
                      )}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="self-center text-fg-faint transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
