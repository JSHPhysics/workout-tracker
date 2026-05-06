import { Link } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useActiveSession } from '../db/sessions';
import { useRoutines } from '../db/routines';
import { ElapsedTime } from '../components/ElapsedTime';

export function Today() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const activeSession = useActiveSession(profileId);
  const routines = useRoutines();

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          On the floor
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          Today
        </h1>
        <p className="text-sm text-fg-muted">
          Pick up an open session, or start a fresh workout from a routine.
        </p>
      </header>

      {activeSession && (
        <Link
          to={`/session/${activeSession.id}`}
          className="group block rounded-2xl border border-accent/40 bg-accent-soft p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-accent">
            Resume
          </span>
          <h2 className="mt-1 font-display text-xl font-medium leading-snug tracking-tight">
            {activeSession.planName}
          </h2>
          <p className="mt-2 text-xs text-fg-muted">
            Started{' '}
            <ElapsedTime
              startedAt={activeSession.startedAt}
              className="text-fg-muted"
            />{' '}
            ago
          </p>
        </Link>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {activeSession ? 'Or start fresh' : 'Pick a routine'}
        </span>
        {routines === undefined ? (
          <div
            aria-hidden
            className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {routines.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/routines/${r.id}`}
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <span className="font-medium text-fg">{r.name}</span>
                  <span
                    aria-hidden
                    className="text-fg-faint transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
