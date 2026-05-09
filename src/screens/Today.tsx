import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useActiveSession, createSession } from '../db/sessions';
import { useRoutines } from '../db/routines';
import { useFavouriteRoutineIds } from '../db/favouriteRoutines';
import { useProfile } from '../db/profiles';
import { useCyclePhaseToday } from '../db/period';
import { CycleChip } from '../components/CycleChip';
import { ElapsedTime } from '../components/ElapsedTime';
import { PeriodLogModal } from '../components/PeriodLogModal';

const FREE_SESSION_LABEL = (() => {
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return () => `Free session · ${fmt.format(new Date())}`;
})();

export function Today() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const activeSession = useActiveSession(profileId);
  const routines = useRoutines();
  const favourites = useFavouriteRoutineIds(profileId);
  const profile = useProfile(profileId);
  const cycleToday = useCyclePhaseToday(profileId);

  // Favourites sort first (alphabetical within each group). Stable
  // ordering — favourites toggle reactively without the list jumping.
  const sortedRoutines = useMemo(() => {
    if (!routines) return undefined;
    const favSet = favourites ?? new Set<string>();
    return [...routines].sort((a, b) => {
      const aFav = favSet.has(a.id) ? 0 : 1;
      const bFav = favSet.has(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [routines, favourites]);
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const periodTrackingOn = profile?.periodTrackingEnabled ?? false;

  const startFree = async () => {
    if (!profileId || starting) return;
    setStarting(true);
    try {
      const id = await createSession({
        profileId,
        planName: FREE_SESSION_LABEL(),
        livePlan: [],
      });
      navigate(`/session/${id}`);
    } finally {
      setStarting(false);
    }
  };

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
        {periodTrackingOn && (
          <div className="-mt-0.5 flex flex-wrap gap-2">
            {cycleToday ? (
              <CycleChip
                phase={cycleToday.phase}
                dayOfCycle={cycleToday.dayOfCycle}
                {...(cycleToday.overdue ? { overdue: true } : {})}
                asButton
                onClick={() => setPeriodModalOpen(true)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPeriodModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted transition hover:border-accent hover:text-accent"
              >
                + Log period
              </button>
            )}
          </div>
        )}
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
        {sortedRoutines === undefined ? (
          <div
            aria-hidden
            className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedRoutines.map((r) => {
              const fav = favourites?.has(r.id) ?? false;
              return (
                <li key={r.id}>
                  <Link
                    to={`/routines/${r.id}`}
                    className="group flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-soft"
                  >
                    <span className="flex items-center gap-2">
                      {fav && (
                        <span
                          aria-label="Favourite"
                          title="Favourite"
                          className="text-sm leading-none text-accent"
                        >
                          ★
                        </span>
                      )}
                      <span className="font-medium text-fg">{r.name}</span>
                    </span>
                    <span
                      aria-hidden
                      className="text-fg-faint transition group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Or wing it
        </span>
        <button
          type="button"
          onClick={startFree}
          disabled={starting || !profileId}
          className="group flex items-center justify-between rounded-xl border border-dashed border-line-strong bg-surface-soft/40 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft disabled:opacity-50"
        >
          <span className="flex flex-col">
            <span className="font-medium text-fg">
              {starting ? 'Starting…' : 'Free session'}
            </span>
            <span className="text-xs text-fg-muted">
              No template — add exercises as you go.
            </span>
          </span>
          <span
            aria-hidden
            className="text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </button>
        <Link
          to="/timers"
          className="group flex items-center justify-between rounded-xl border border-line bg-surface-soft/40 px-4 py-3 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-soft"
        >
          <span className="flex flex-col">
            <span className="font-medium text-fg">Timers</span>
            <span className="text-xs text-fg-muted">
              Stopwatch · countdown · EMOM / Tabata.
            </span>
          </span>
          <span
            aria-hidden
            className="text-fg-faint transition group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </Link>
      </div>

      {periodModalOpen && profileId && (
        <PeriodLogModal
          profileId={profileId}
          onClose={() => setPeriodModalOpen(false)}
        />
      )}
    </section>
  );
}
