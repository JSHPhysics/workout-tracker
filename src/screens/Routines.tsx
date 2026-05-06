import { Link } from 'react-router-dom';
import { useRoutines } from '../db/routines';
import type { RoutineTemplate } from '../types';

function summarise(routine: RoutineTemplate): string {
  const weeks = routine.weeks.length;
  const workouts = routine.weeks.reduce(
    (sum, w) => sum + w.days.filter((d) => d.kind === 'workout').length,
    0,
  );
  return `${weeks} week${weeks === 1 ? '' : 's'} · ${workouts} workouts`;
}

export function Routines() {
  const routines = useRoutines();

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          The plans
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
            Routines
          </h1>
          <Link
            to="/routines/new"
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90"
          >
            + Create
          </Link>
        </div>
        <p className="text-sm text-fg-muted">
          Built-in templates and your own. Tap one to browse.
        </p>
      </header>

      {routines === undefined ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-24 animate-pulse rounded-2xl border border-line bg-surface-soft"
            />
          ))}
        </div>
      ) : routines.length === 0 ? (
        <p className="text-sm text-fg-muted">No routines yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {routines.map((routine) => (
            <li key={routine.id}>
              <Link
                to={`/routines/${routine.id}`}
                className="group block rounded-2xl border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    {routine.isSeed && (
                      <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-accent">
                        Built-in
                      </span>
                    )}
                    <h2 className="font-display text-xl font-medium leading-snug tracking-tight">
                      {routine.name}
                    </h2>
                    <p className="text-xs text-fg-muted">{summarise(routine)}</p>
                  </div>
                  <span
                    aria-hidden
                    className="text-fg-faint transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {routine.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
