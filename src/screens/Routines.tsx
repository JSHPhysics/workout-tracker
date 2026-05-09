import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useRoutines } from '../db/routines';
import {
  toggleFavouriteRoutine,
  useFavouriteRoutineIds,
} from '../db/favouriteRoutines';
import { PlansSection } from '../components/PlansSection';
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
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const routines = useRoutines();
  const favourites = useFavouriteRoutineIds(profileId);
  const routineById = useMemo(() => {
    const m = new Map<string, RoutineTemplate>();
    for (const r of routines ?? []) m.set(r.id, r);
    return m;
  }, [routines]);

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

      {profileId && (
        <PlansSection profileId={profileId} routineById={routineById} />
      )}

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
              <RoutineCard
                routine={routine}
                profileId={profileId}
                favourited={favourites?.has(routine.id) ?? false}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoutineCard({
  routine,
  profileId,
  favourited,
}: {
  routine: RoutineTemplate;
  profileId: string | null;
  favourited: boolean;
}) {
  const onToggleFavourite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!profileId) return;
    void toggleFavouriteRoutine(profileId, routine.id, !favourited);
  };
  // Outer is a flex row, NOT a Link, so the favourite button can sit
  // as a sibling of the navigable area without ending up as
  // <button> inside <a> (invalid HTML).
  return (
    <div className="group relative flex items-stretch rounded-2xl border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link
        to={`/routines/${routine.id}`}
        className="flex flex-1 flex-col p-5 pr-14"
      >
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
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {routine.description}
        </p>
      </Link>
      <button
        type="button"
        onClick={onToggleFavourite}
        disabled={!profileId}
        aria-label={
          favourited ? `Unfavourite ${routine.name}` : `Favourite ${routine.name}`
        }
        aria-pressed={favourited}
        title={favourited ? 'Unfavourite' : 'Favourite'}
        className={[
          'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full transition',
          favourited
            ? 'text-accent hover:bg-surface-soft'
            : 'text-fg-faint hover:bg-surface-soft hover:text-accent',
        ].join(' ')}
      >
        <span aria-hidden className="text-base leading-none">
          {favourited ? '★' : '☆'}
        </span>
      </button>
    </div>
  );
}
