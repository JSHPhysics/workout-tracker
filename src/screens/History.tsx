import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import {
  useProfileSessionSummaries,
  type SessionSummary,
} from '../db/history';
import { CalendarHeatmap } from '../components/CalendarHeatmap';
import { localDateKey } from '../domain/streak';
import { sessionDurationMs } from '../domain/volume';

const TZ =
  typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';

const WEEK_LABEL = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});
const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function durationLabel(ms: number | null): string | null {
  if (ms === null) return null;
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtVolume(v: number): string {
  if (v <= 0) return '–';
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k kg`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k kg`;
  return `${Math.round(v)} kg`;
}

function weekKey(iso: string): string {
  // Monday-anchored ISO week key (YYYY-MM-DD of that Monday).
  const d = new Date(iso);
  const local = new Date(`${localDateKey(d, TZ)}T12:00:00Z`);
  const monOffset = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - monOffset);
  return local.toISOString().slice(0, 10);
}

export function History() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const summaries = useProfileSessionSummaries(profileId);

  const grouped = useMemo(() => {
    if (!summaries) return [];
    const out: { weekStart: string; items: SessionSummary[] }[] = [];
    const map = new Map<string, SessionSummary[]>();
    for (const s of summaries) {
      const k = weekKey(s.session.startedAt);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    for (const k of keys) {
      const items = map.get(k)!;
      // Already newest-first inside the day; ensure week-level order too.
      items.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
      out.push({ weekStart: k, items });
    }
    return out;
  }, [summaries]);

  const completedAt = useMemo(
    () =>
      (summaries ?? [])
        .filter((s) => s.session.completedAt !== null)
        .map((s) => s.session.completedAt!) as string[],
    [summaries],
  );

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
          Last 12 weeks at a glance, every session below.
        </p>
      </header>

      <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <CalendarHeatmap completedAt={completedAt} timeZone={TZ} />
      </article>

      {summaries === undefined ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
            />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface-soft/50 p-6 text-center text-sm text-fg-muted">
          <span className="font-display italic">Nothing yet.</span>{' '}
          Start your first workout from the{' '}
          <Link to="/routines" className="text-accent hover:underline">
            Routines
          </Link>{' '}
          tab.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(({ weekStart, items }) => (
            <WeekGroup key={weekStart} weekStart={weekStart} items={items} />
          ))}
        </div>
      )}
    </section>
  );
}

function WeekGroup({
  weekStart,
  items,
}: {
  weekStart: string;
  items: SessionSummary[];
}) {
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const label = `${WEEK_LABEL.format(new Date(`${weekStart}T12:00:00Z`))} – ${WEEK_LABEL.format(weekEnd)}`;
  const totalVolume = items.reduce((sum, s) => sum + s.totalVolume, 0);
  const totalPRs = items.reduce((sum, s) => sum + s.prCount, 0);

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
          {label}
        </h2>
        <span className="text-[0.65rem] tabular-nums text-fg-faint">
          {items.length} session{items.length === 1 ? '' : 's'}
          {totalPRs > 0 && ` · ${totalPRs} PR${totalPRs === 1 ? '' : 's'}`}
          {totalVolume > 0 && ` · ${fmtVolume(totalVolume)}`}
        </span>
      </header>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.session.id}>
            <SessionRow summary={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionRow({ summary }: { summary: SessionSummary }) {
  const { session } = summary;
  const startedAt = new Date(session.startedAt);
  const dur = durationLabel(
    sessionDurationMs(session.startedAt, session.completedAt),
  );
  const inProgress = session.completedAt === null;
  return (
    <Link
      to={`/session/${session.id}`}
      className="group flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="flex w-14 shrink-0 flex-col items-start">
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
          {DAY_LABEL.format(startedAt)}
        </span>
        <span className="font-mono text-xs tabular-nums text-fg-faint">
          {TIME_LABEL.format(startedAt)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug text-fg">
          {session.planName}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
          {inProgress ? (
            <span className="text-accent">In progress</span>
          ) : (
            <>
              {dur && <span className="tabular-nums">{dur}</span>}
              {summary.totalVolume > 0 && (
                <span className="tabular-nums">
                  {fmtVolume(summary.totalVolume)}
                </span>
              )}
              {summary.setLogCount > 0 && (
                <span className="tabular-nums text-fg-faint">
                  {summary.setLogCount} set{summary.setLogCount === 1 ? '' : 's'}
                </span>
              )}
            </>
          )}
        </span>
        {summary.prCount > 0 && (
          <span className="mt-1 inline-flex w-max items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-accent-fg">
            <span aria-hidden>★</span>
            <span>
              {summary.prCount} PR{summary.prCount === 1 ? '' : 's'}
            </span>
          </span>
        )}
      </div>
      <span
        aria-hidden
        className="self-center text-fg-faint transition group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
