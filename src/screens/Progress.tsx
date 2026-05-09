import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useActiveProfile } from '../state/activeProfile';
import { useExerciseMap } from '../db/exercises';
import { useMuscleVolumeOverrides } from '../db/muscleVolumeOverrides';
import { useBodyweightLogs } from '../db/bodyweight';
import { usePeriodLogs } from '../db/period';
import { useProfile } from '../db/profiles';
import { ChartShareButton } from '../components/ChartShareButton';
import { CycleChip } from '../components/CycleChip';
import { cyclePhaseAt } from '../domain/cycle';
import {
  CYCLE_PHASE_COLORS,
  CYCLE_PHASE_LABELS,
  type CyclePhase,
  type PeriodLog,
} from '../types';
import {
  useExerciseHistory,
  useProfilePRRecords,
  useProfileSessionSummaries,
  type SessionSummary,
} from '../db/history';
import { BodyweightChart } from '../components/BodyweightChart';
import { BodyweightLogger } from '../components/BodyweightLogger';
import { computeStreak, localDateKey } from '../domain/streak';
import { epleyE1RM } from '../domain/e1rm';
import { sessionDurationMs, volumeByMuscle } from '../domain/volume';
import {
  RATING_EMOJI,
  averageEnergyLift,
  averageMoodLift,
  snapshotFromSession,
  type WellbeingSnapshot,
} from '../domain/wellbeing';
import type { Exercise, MuscleGroup, PRRecord, PRType, SetLog } from '../types';

const TZ =
  typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';

// Theme tokens are stored as RGB triplets (`34 197 94`) so Tailwind can
// compose them with alpha via `rgb(var(--accent) / 0.5)`. SVG attributes
// can't parse a bare triplet, so wrap before passing to Recharts.
const tk = (name: string, alpha = 1): string =>
  alpha === 1
    ? `rgb(var(--${name}))`
    : `rgb(var(--${name}) / ${alpha})`;

type Range = '4w' | '12w' | '6m' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  '4w': 28,
  '12w': 84,
  '6m': 182,
  all: null,
};

const RANGE_LABEL: Record<Range, string> = {
  '4w': '4 weeks',
  '12w': '12 weeks',
  '6m': '6 months',
  all: 'All time',
};

const PR_LABEL: Record<PRType, string> = {
  weight: 'Weight',
  reps_at_weight: 'Reps@wt',
  e1rm: 'e1RM',
  session_volume: 'Vol',
};

function fmtNum(v: number): string {
  if (v >= 100_000) return `${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return `${Math.round(v)}`;
}

function fmtKg(v: number): string {
  return v % 1 === 0 ? `${v}` : v.toFixed(1);
}

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h === 0) return `${m}m`;
  if (h < 100) return `${h}h ${m}m`;
  return `${h}h`;
}

function withinRange(iso: string, days: number | null, now: Date): boolean {
  if (days === null) return true;
  const cutoff = now.getTime() - days * 86_400_000;
  return Date.parse(iso) >= cutoff;
}

type SubTab = 'charts' | 'body';

export function Progress() {
  const profileId = useActiveProfile((s) => s.activeProfileId);
  const summaries = useProfileSessionSummaries(profileId);
  const prRecords = useProfilePRRecords(profileId);
  const exerciseMap = useExerciseMap();
  const bodyweightLogs = useBodyweightLogs(profileId);
  const [range, setRange] = useState<Range>('12w');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [tab, setTab] = useState<SubTab>('charts');

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 pb-12">
      <header className="flex flex-col gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
          The trend lines
        </span>
        <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight">
          Progress
        </h1>
        <p className="text-sm text-fg-muted">
          PRs, volume, streaks. Body sub-tab tracks weigh-ins.
        </p>
      </header>

      <StatStrip summaries={summaries} />

      <SubTabBar value={tab} onChange={setTab} />

      {tab === 'charts' ? (
        <>
          <RangeFilter value={range} onChange={setRange} />

          <PRTimeline
            records={prRecords}
            summaries={summaries}
            exerciseMap={exerciseMap}
            range={range}
            profileId={profileId}
          />

          <MoodEnergyChart
            summaries={summaries}
            range={range}
            profileId={profileId}
          />

          <ExerciseDrillDown
            profileId={profileId}
            exerciseId={exerciseId}
            onSelectExercise={setExerciseId}
            exerciseMap={exerciseMap}
            summaries={summaries}
            range={range}
          />

          <VolumeByMuscleChart
            summaries={summaries}
            exerciseMap={exerciseMap}
            range={range}
            profileId={profileId}
          />

          <VolumeByRoutineChart summaries={summaries} range={range} />
        </>
      ) : (
        <BodySection profileId={profileId} logs={bodyweightLogs} />
      )}
    </section>
  );
}

// --- Sub-tabs --------------------------------------------------------------

function SubTabBar({
  value,
  onChange,
}: {
  value: SubTab;
  onChange: (t: SubTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Progress sub-tabs"
      className="flex items-center gap-1 self-start rounded-full border border-line bg-surface p-1"
    >
      {(['charts', 'body'] as SubTab[]).map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            className={[
              'min-h-[36px] rounded-full px-4 text-xs font-medium uppercase tracking-[0.16em] transition',
              active
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {t === 'charts' ? 'Charts' : 'Body'}
          </button>
        );
      })}
    </div>
  );
}

// --- Body section ----------------------------------------------------------

function BodySection({
  profileId,
  logs,
}: {
  profileId: string | null;
  logs: import('../types').BodyweightLog[] | undefined;
}) {
  if (!profileId) return null;
  if (logs === undefined) {
    return (
      <div className="space-y-2">
        <div className="h-32 animate-pulse rounded-2xl border border-line bg-surface-soft" />
        <div className="h-44 animate-pulse rounded-2xl border border-line bg-surface-soft" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <BodyweightArticle logs={logs} />
      <BodyweightLogger profileId={profileId} logs={logs} />
    </div>
  );
}

function BodyweightArticle({ logs }: { logs: NonNullable<ReturnType<typeof useBodyweightLogs>> }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium">Bodyweight trend</h2>
        <div className="flex items-center gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
            7-day rolling avg
          </span>
          <ChartShareButton
            containerRef={chartRef}
            filename="bodyweight-trend.png"
            title="Bodyweight trend"
          />
        </div>
      </header>
      <div ref={chartRef}>
        <BodyweightChart logs={logs} />
      </div>
    </article>
  );
}

// --- Range filter ----------------------------------------------------------

function RangeFilter({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range filter"
      className="flex items-center gap-1 self-start rounded-full border border-line bg-surface p-1"
    >
      {(Object.keys(RANGE_LABEL) as Range[]).map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r)}
            className={[
              'min-h-[32px] rounded-full px-3 text-[0.7rem] font-medium uppercase tracking-[0.14em] transition',
              active
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

// --- Stat strip ------------------------------------------------------------

function StatStrip({
  summaries,
}: {
  summaries: SessionSummary[] | undefined;
}) {
  const stats = useMemo(() => {
    if (!summaries) return null;
    const completed = summaries.filter((s) => s.session.completedAt !== null);
    const totalTonnage = completed.reduce((sum, s) => sum + s.totalVolume, 0);
    const totalDurationMs = completed.reduce((sum, s) => {
      const ms = sessionDurationMs(s.session.startedAt, s.session.completedAt);
      return sum + (ms ?? 0);
    }, 0);
    const streak = computeStreak({
      completedAt: completed.map((s) => s.session.completedAt!) as string[],
      timeZone: TZ,
      now: new Date(),
    });
    return {
      sessions: completed.length,
      tonnage: totalTonnage,
      duration: totalDurationMs,
      ...streak,
    };
  }, [summaries]);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden
            className="h-20 animate-pulse rounded-2xl border border-line bg-surface-soft"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Streak" value={`${stats.current}d`} sub={`Best ${stats.longest}`} />
      <Stat label="Sessions" value={fmtNum(stats.sessions)} sub="Lifetime" />
      <Stat label="Tonnage" value={`${fmtNum(stats.tonnage)} kg`} sub="Lifetime" />
      <Stat label="Time" value={fmtDuration(stats.duration)} sub="Under bar" />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <article className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface px-3 py-3 shadow-soft">
      <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </span>
      <span className="font-display text-xl font-medium tabular-nums">
        {value}
      </span>
      <span className="text-[0.6rem] uppercase tracking-[0.14em] text-fg-faint">
        {sub}
      </span>
    </article>
  );
}

// --- PR timeline -----------------------------------------------------------

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

function PRTimeline({
  records,
  summaries,
  exerciseMap,
  range,
  profileId,
}: {
  records: PRRecord[] | undefined;
  summaries: SessionSummary[] | undefined;
  exerciseMap: Map<string, Exercise> | undefined;
  range: Range;
  profileId: string | null;
}) {
  const profile = useProfile(profileId);
  const periodLogs = usePeriodLogs(profileId);
  const periodTrackingOn = profile?.periodTrackingEnabled ?? false;
  const showPhase = periodTrackingOn && (periodLogs?.length ?? 0) > 0;

  const filtered = useMemo(() => {
    if (!records) return null;
    const now = new Date();
    const days = RANGE_DAYS[range];
    return records.filter((r) => withinRange(r.achievedAt, days, now));
  }, [records, range]);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-medium">PR timeline</h2>
        <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
          {RANGE_LABEL[range]}
        </span>
      </header>
      {!filtered || !exerciseMap || !summaries ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface-soft" />
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          No PRs in this window. Hit a heavier set or more reps to break a record.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {filtered.slice(0, 12).map((r) => {
            const ex = exerciseMap.get(r.exerciseId);
            const phaseSnap =
              showPhase && periodLogs
                ? cyclePhaseAt(r.achievedAt.slice(0, 10), periodLogs)
                : null;
            return (
              <li key={r.id}>
                <Link
                  to={`/session/${r.sessionId}`}
                  className="flex items-center justify-between gap-3 py-2 transition hover:opacity-80"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {ex?.name ?? 'Exercise'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
                      <span>{DATE_LABEL.format(new Date(r.achievedAt))}</span>
                      {phaseSnap && (
                        <CycleChip phase={phaseSnap.phase} />
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs tabular-nums text-fg-muted">
                      {fmtKg(r.value)}
                    </span>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-accent">
                      {PR_LABEL[r.type]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          {filtered.length > 12 && (
            <li className="pt-2 text-center text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">
              + {filtered.length - 12} more in this window
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

// --- Mood & energy ---------------------------------------------------------

interface WellbeingPoint {
  date: string;
  moodBefore: number | null;
  moodAfter: number | null;
  energyBefore: number | null;
  energyAfter: number | null;
}

interface PhaseBand {
  phase: CyclePhase;
  /** Both refer to dataKey values on the X axis (session dates). */
  x1: string;
  x2: string;
}

/** Compute consecutive-same-phase runs across the chart's data
 * points. Each run becomes a ReferenceArea band. Sparse session
 * dates mean bands span session-to-session, not literal calendar
 * days — close enough for visual phase context. */
function computePhaseBands(
  points: readonly WellbeingPoint[],
  logs: readonly PeriodLog[],
): PhaseBand[] {
  if (logs.length === 0 || points.length === 0) return [];
  const out: PhaseBand[] = [];
  let currentPhase: CyclePhase | null = null;
  let runStart: string | null = null;
  let runEnd: string | null = null;
  for (const p of points) {
    const snap = cyclePhaseAt(p.date, logs);
    const phase = snap?.phase ?? null;
    if (phase !== currentPhase) {
      if (currentPhase !== null && runStart !== null && runEnd !== null) {
        out.push({ phase: currentPhase, x1: runStart, x2: runEnd });
      }
      currentPhase = phase;
      runStart = phase ? p.date : null;
      runEnd = phase ? p.date : null;
    } else if (phase) {
      runEnd = p.date;
    }
  }
  if (currentPhase !== null && runStart !== null && runEnd !== null) {
    out.push({ phase: currentPhase, x1: runStart, x2: runEnd });
  }
  return out;
}

function MoodEnergyChart({
  summaries,
  range,
  profileId,
}: {
  summaries: SessionSummary[] | undefined;
  range: Range;
  profileId: string | null;
}) {
  const profile = useProfile(profileId);
  const periodLogs = usePeriodLogs(profileId);
  const periodTrackingOn = profile?.periodTrackingEnabled ?? false;
  const chartRef = useRef<HTMLDivElement | null>(null);

  const { points, snapshots } = useMemo(() => {
    if (!summaries) return { points: null, snapshots: null };
    const now = new Date();
    const days = RANGE_DAYS[range];
    const filtered = summaries.filter(
      (s) =>
        s.session.completedAt !== null &&
        withinRange(s.session.completedAt, days, now),
    );
    // Oldest-first for the line chart.
    const ordered = [...filtered].reverse();
    const ps: WellbeingPoint[] = ordered.map((s) => {
      const snap = snapshotFromSession(s.session);
      return {
        date: localDateKey(new Date(s.session.completedAt!), TZ),
        moodBefore: snap.moodBefore,
        moodAfter: snap.moodAfter,
        energyBefore: snap.energyBefore,
        energyAfter: snap.energyAfter,
      };
    });
    const snaps: WellbeingSnapshot[] = ordered.map((s) =>
      snapshotFromSession(s.session),
    );
    return { points: ps, snapshots: snaps };
  }, [summaries, range]);

  const phaseBands = useMemo(() => {
    if (!periodTrackingOn || !periodLogs || !points) return [];
    return computePhaseBands(points, periodLogs);
  }, [periodTrackingOn, periodLogs, points]);

  const moodLift = snapshots ? averageMoodLift(snapshots) : null;
  const energyLift = snapshots ? averageEnergyLift(snapshots) : null;

  const hasAnyData =
    points !== null &&
    points.some(
      (p) =>
        p.moodBefore !== null ||
        p.moodAfter !== null ||
        p.energyBefore !== null ||
        p.energyAfter !== null,
    );

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium">Mood & energy</h2>
        <div className="flex items-center gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
            {RANGE_LABEL[range]}
          </span>
          <ChartShareButton
            containerRef={chartRef}
            filename={`mood-energy-${range}.png`}
            title="Mood & energy"
          />
        </div>
      </header>

      {points === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-surface-soft" />
      ) : !hasAnyData ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          Log a few workouts with mood + energy to see the trend.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <LiftPill
              label="Avg mood lift"
              value={moodLift}
              positiveEmoji="🙂"
              negativeEmoji="🙁"
            />
            <LiftPill
              label="Avg energy lift"
              value={energyLift}
              positiveEmoji="⚡"
              negativeEmoji="🥱"
            />
          </div>
          <div ref={chartRef} className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
              >
                <CartesianGrid stroke={tk('line')} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: tk('fg-faint') }}
                  tickFormatter={(d) =>
                    DATE_LABEL.format(new Date(`${d}T12:00:00Z`))
                  }
                  minTickGap={24}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  // Emoji glyphs render wider than digits and need a
                  // larger fontSize to actually show the face — at 9
                  // they read as a coloured smudge on most renderers.
                  tick={{ fontSize: 14, fill: tk('fg-faint') }}
                  tickFormatter={(v) => RATING_EMOJI[v - 1] ?? `${v}`}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: tk('surface-elevated'),
                    border: `1px solid ${tk('line')}`,
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelFormatter={(d) =>
                    DATE_LABEL.format(new Date(`${d}T12:00:00Z`))
                  }
                  formatter={(v: number, name: string) => [
                    v,
                    {
                      moodBefore: 'Mood before',
                      moodAfter: 'Mood after',
                      energyBefore: 'Energy before',
                      energyAfter: 'Energy after',
                    }[name] ?? name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {phaseBands.map((b, i) => (
                  <ReferenceArea
                    key={`phase-${i}`}
                    x1={b.x1}
                    x2={b.x2}
                    y1={1}
                    y2={5}
                    fill={CYCLE_PHASE_COLORS[b.phase]}
                    fillOpacity={0.1}
                    stroke="none"
                    ifOverflow="visible"
                  />
                ))}
                <Line
                  type="monotone"
                  name="Mood after"
                  dataKey="moodAfter"
                  stroke={tk('accent')}
                  strokeWidth={2}
                  dot={{ r: 2, fill: tk('accent') }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  name="Mood before"
                  dataKey="moodBefore"
                  stroke={tk('accent')}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  name="Energy after"
                  dataKey="energyAfter"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#f59e0b' }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  name="Energy before"
                  dataKey="energyBefore"
                  stroke="#f59e0b"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {phaseBands.length > 0 && <PhaseLegend />}
        </>
      )}
    </article>
  );
}

function PhaseLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.6rem] uppercase tracking-[0.14em] text-fg-faint">
      <span>Cycle:</span>
      {(Object.keys(CYCLE_PHASE_LABELS) as CyclePhase[]).map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: CYCLE_PHASE_COLORS[p] }}
          />
          {CYCLE_PHASE_LABELS[p]}
        </span>
      ))}
    </div>
  );
}

function LiftPill({
  label,
  value,
  positiveEmoji,
  negativeEmoji,
}: {
  label: string;
  value: number | null;
  positiveEmoji: string;
  negativeEmoji: string;
}) {
  const empty = value === null;
  const positive = !empty && value > 0;
  const sign = empty ? '' : value > 0 ? '+' : '';
  const display = empty ? '—' : `${sign}${value.toFixed(1)}`;
  const emoji = empty ? '·' : positive ? positiveEmoji : negativeEmoji;
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface-soft px-3 py-2">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span aria-hidden className="text-base">
          {emoji}
        </span>
        <span className="font-display text-lg font-medium tabular-nums">
          {display}
        </span>
      </span>
    </div>
  );
}

// --- Exercise drilldown ----------------------------------------------------

function ExerciseDrillDown({
  profileId,
  exerciseId,
  onSelectExercise,
  exerciseMap,
  summaries,
  range,
}: {
  profileId: string | null;
  exerciseId: string | null;
  onSelectExercise: (id: string | null) => void;
  exerciseMap: Map<string, Exercise> | undefined;
  summaries: SessionSummary[] | undefined;
  range: Range;
}) {
  // Default to whichever exercise has the most working sets in this profile.
  const defaultExerciseId = useMemo(() => {
    if (exerciseId) return exerciseId;
    if (!summaries) return null;
    const counts = new Map<string, number>();
    for (const s of summaries) {
      for (const log of s.setLogs) {
        if (log.setType === 'warmup') continue;
        if (typeof log.weight !== 'number' || typeof log.reps !== 'number') continue;
        counts.set(log.exerciseId, (counts.get(log.exerciseId) ?? 0) + 1);
      }
    }
    let best: { id: string; n: number } | null = null;
    for (const [id, n] of counts) {
      if (!best || n > best.n) best = { id, n };
    }
    return best?.id ?? null;
  }, [exerciseId, summaries]);

  const candidateExercises = useMemo(() => {
    if (!summaries || !exerciseMap) return [];
    const counts = new Map<string, number>();
    for (const s of summaries) {
      for (const log of s.setLogs) {
        if (log.setType === 'warmup') continue;
        if (typeof log.weight !== 'number' || typeof log.reps !== 'number') continue;
        counts.set(log.exerciseId, (counts.get(log.exerciseId) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([id, n]) => ({ exercise: exerciseMap.get(id), n }))
      .filter((x): x is { exercise: Exercise; n: number } => !!x.exercise)
      .sort((a, b) => b.n - a.n);
  }, [summaries, exerciseMap]);

  const history = useExerciseHistory(profileId, defaultExerciseId);

  const series = useMemo(() => {
    if (!history) return null;
    const now = new Date();
    const days = RANGE_DAYS[range];
    const filtered = history.filter(
      (l) =>
        withinRange(l.completedAt, days, now) &&
        l.setType !== 'warmup' &&
        typeof l.weight === 'number' &&
        typeof l.reps === 'number',
    );
    return buildExerciseSeries(filtered);
  }, [history, range]);

  const planned = useMemo(() => {
    if (!summaries || !defaultExerciseId) return null;
    return computeRepRangeHitRate(summaries, defaultExerciseId, range);
  }, [summaries, defaultExerciseId, range]);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-base font-medium">Per exercise</h2>
        <select
          value={defaultExerciseId ?? ''}
          onChange={(e) => onSelectExercise(e.target.value || null)}
          className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        >
          <option value="" disabled>
            Pick an exercise
          </option>
          {candidateExercises.map(({ exercise, n }) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name} ({n} sets)
            </option>
          ))}
        </select>
      </header>

      {!series || !defaultExerciseId ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          Log working sets on a barbell or weighted lift to see trends.
        </p>
      ) : series.byDay.length === 0 ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          No working sets in this window.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <DrillChart title="Estimated 1RM (kg)" data={series.byDay} dataKey="e1rm" />
          <DrillChart title="Top set weight (kg)" data={series.byDay} dataKey="topWeight" />
          <DrillChart title="Volume per session (kg)" data={series.byDay} dataKey="volume" />
          {planned && planned.attempts > 0 && (
            <RepHitRate hit={planned.hit} attempts={planned.attempts} />
          )}
        </div>
      )}
    </article>
  );
}

interface DrillPoint {
  dateKey: string;
  e1rm: number;
  topWeight: number;
  volume: number;
}

function buildExerciseSeries(logs: readonly SetLog[]): {
  byDay: DrillPoint[];
} {
  const buckets = new Map<string, SetLog[]>();
  for (const l of logs) {
    const key = localDateKey(new Date(l.completedAt), TZ);
    const arr = buckets.get(key) ?? [];
    arr.push(l);
    buckets.set(key, arr);
  }
  const days = Array.from(buckets.keys()).sort();
  const byDay: DrillPoint[] = days.map((d) => {
    const sets = buckets.get(d)!;
    let topWeight = 0;
    let volume = 0;
    let topE1rm = 0;
    for (const s of sets) {
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      if (w > topWeight) topWeight = w;
      volume += w * r;
      const e1 = epleyE1RM(w, r);
      if (e1 !== null && e1 > topE1rm) topE1rm = e1;
    }
    return { dateKey: d, e1rm: Math.round(topE1rm * 10) / 10, topWeight, volume };
  });
  return { byDay };
}

function DrillChart({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: DrillPoint[];
  dataKey: 'e1rm' | 'topWeight' | 'volume';
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
          {title}
        </span>
        <ChartShareButton
          containerRef={chartRef}
          filename={`${dataKey}.png`}
          title={title}
        />
      </div>
      <div ref={chartRef} className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={tk('line')} strokeDasharray="3 3" />
            <XAxis
              dataKey="dateKey"
              tick={{ fontSize: 9, fill: tk('fg-faint') }}
              tickFormatter={(d) => DATE_LABEL.format(new Date(`${d}T12:00:00Z`))}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 9, fill: tk('fg-faint') }}
              width={44}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: tk('surface-elevated'),
                border: `1px solid ${tk('line')}`,
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(d) =>
                DATE_LABEL.format(new Date(`${d}T12:00:00Z`))
              }
              formatter={(v: number) => [fmtKg(v), title]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={tk('accent')}
              strokeWidth={2}
              dot={{ r: 2, fill: tk('accent') }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RepHitRate({ hit, attempts }: { hit: number; attempts: number }) {
  const pct = Math.round((hit / attempts) * 100);
  return (
    <div className="flex items-baseline justify-between rounded-xl bg-surface-soft px-3 py-2">
      <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
        Rep-range hit rate
      </span>
      <span className="font-mono text-sm tabular-nums text-fg">
        {pct}% <span className="text-fg-faint">({hit}/{attempts})</span>
      </span>
    </div>
  );
}

function computeRepRangeHitRate(
  summaries: SessionSummary[],
  exerciseId: string,
  range: Range,
): { hit: number; attempts: number } {
  const now = new Date();
  const days = RANGE_DAYS[range];
  let hit = 0;
  let attempts = 0;
  for (const s of summaries) {
    if (!withinRange(s.session.startedAt, days, now)) continue;
    // Find planned reps for this exercise in this session's livePlan.
    let plan: { min: number; max: number } | null = null;
    for (const block of s.session.livePlan) {
      for (const ex of block.exercises) {
        if (ex.exerciseId === exerciseId && ex.reps) {
          plan = ex.reps;
          break;
        }
      }
      if (plan) break;
    }
    if (!plan) continue;
    for (const log of s.setLogs) {
      if (log.exerciseId !== exerciseId) continue;
      if (log.setType !== 'working' && log.setType !== 'amrap') continue;
      if (typeof log.reps !== 'number') continue;
      attempts += 1;
      if (log.reps >= plan.min && log.reps <= plan.max) hit += 1;
    }
  }
  return { hit, attempts };
}

// --- Volume by muscle group ------------------------------------------------

const MUSCLE_COLOURS: Record<string, string> = {
  glutes: tk('accent'),
  quads: '#f59e0b',
  hamstrings: '#10b981',
  back: '#3b82f6',
  chest: '#ef4444',
  shoulders: '#8b5cf6',
  core: '#14b8a6',
  triceps: '#f97316',
  biceps: '#ec4899',
  calves: '#84cc16',
  lats: '#0ea5e9',
  traps: '#a855f7',
  forearms: '#fbbf24',
  adductors: '#22d3ee',
  abductors: '#fb7185',
};

function colourForMuscle(m: string): string {
  return MUSCLE_COLOURS[m] ?? tk('fg-muted');
}

function VolumeByMuscleChart({
  summaries,
  exerciseMap,
  range,
  profileId,
}: {
  summaries: SessionSummary[] | undefined;
  exerciseMap: Map<string, Exercise> | undefined;
  range: Range;
  profileId: string | null;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const overrides = useMuscleVolumeOverrides(profileId);
  const data = useMemo(() => {
    if (!summaries || !exerciseMap) return null;
    const now = new Date();
    const days = RANGE_DAYS[range];
    const allLogs: SetLog[] = [];
    for (const s of summaries) {
      if (!withinRange(s.session.startedAt, days, now)) continue;
      for (const l of s.setLogs) allLogs.push(l);
    }
    const byMuscle = volumeByMuscle(
      allLogs,
      exerciseMap,
      undefined,
      overrides,
    );
    const arr = Array.from(byMuscle.entries())
      .map(([muscle, volume]) => ({ muscle: muscle as MuscleGroup, volume }))
      .filter((x) => x.volume > 0)
      .sort((a, b) => b.volume - a.volume);
    return arr;
  }, [summaries, exerciseMap, range, overrides]);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium">Volume by muscle</h2>
        <div className="flex items-center gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
            Primary 100% · Secondary 50%
          </span>
          <ChartShareButton
            containerRef={chartRef}
            filename={`volume-by-muscle-${range}.png`}
            title="Volume by muscle"
          />
        </div>
      </header>
      {!data ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface-soft" />
      ) : data.length === 0 ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          No working volume in this window.
        </p>
      ) : (
        <div ref={chartRef} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
            >
              <CartesianGrid stroke={tk('line')} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: tk('fg-faint') }}
                tickFormatter={(v) => fmtNum(v)}
              />
              <YAxis
                type="category"
                dataKey="muscle"
                width={70}
                tick={{ fontSize: 10, fill: tk('fg-muted') }}
                // Without this Recharts skips every other label when
                // the chart is shorter than (count × line-height) —
                // half the muscles end up unlabelled on a 224px-tall
                // 15-row chart.
                interval={0}
              />
              <Tooltip
                contentStyle={{
                  background: tk('surface-elevated'),
                  border: `1px solid ${tk('line')}`,
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v: number) => [`${fmtNum(v)} kg`, 'Volume']}
              />
              <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                {data.map((d) => (
                  <Cell key={d.muscle} fill={colourForMuscle(d.muscle)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

// --- Volume by routine label -----------------------------------------------

function VolumeByRoutineChart({
  summaries,
  range,
}: {
  summaries: SessionSummary[] | undefined;
  range: Range;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { data, labels } = useMemo(() => {
    if (!summaries) return { data: null, labels: [] as string[] };
    const now = new Date();
    const days = RANGE_DAYS[range];
    const filtered = summaries.filter(
      (s) =>
        s.session.completedAt &&
        withinRange(s.session.startedAt, days, now),
    );
    const weeks = new Map<string, Map<string, number>>();
    const labelSet = new Set<string>();
    for (const s of filtered) {
      const wk = weekKey(s.session.startedAt);
      const label = s.session.planName.trim() || 'Free';
      labelSet.add(label);
      const inner = weeks.get(wk) ?? new Map<string, number>();
      inner.set(label, (inner.get(label) ?? 0) + s.totalVolume);
      weeks.set(wk, inner);
    }
    const sortedWeeks = Array.from(weeks.keys()).sort();
    const labels = Array.from(labelSet).sort();
    const data = sortedWeeks.map((wk) => {
      const row: Record<string, string | number> = { week: wk };
      const inner = weeks.get(wk)!;
      for (const l of labels) row[l] = inner.get(l) ?? 0;
      return row;
    });
    return { data, labels };
  }, [summaries, range]);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium">Volume by routine</h2>
        <div className="flex items-center gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-fg-faint">
            Stacked weekly
          </span>
          <ChartShareButton
            containerRef={chartRef}
            filename={`volume-by-routine-${range}.png`}
            title="Volume by routine"
          />
        </div>
      </header>
      {!data ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface-soft" />
      ) : data.length === 0 ? (
        <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
          No completed sessions in this window.
        </p>
      ) : (
        <div ref={chartRef} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 0, left: 4 }}
            >
              <CartesianGrid stroke={tk('line')} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9, fill: tk('fg-faint') }}
                tickFormatter={(d) =>
                  DATE_LABEL.format(new Date(`${d}T12:00:00Z`))
                }
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 9, fill: tk('fg-faint') }}
                width={44}
                tickFormatter={(v) => fmtNum(v)}
              />
              <Tooltip
                contentStyle={{
                  background: tk('surface-elevated'),
                  border: `1px solid ${tk('line')}`,
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelFormatter={(d) =>
                  `Week of ${DATE_LABEL.format(new Date(`${d}T12:00:00Z`))}`
                }
                formatter={(v: number, name: string) => [`${fmtNum(v)} kg`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {labels.map((label, i) => (
                <Bar
                  key={label}
                  dataKey={label}
                  stackId="vol"
                  fill={routineColour(i)}
                  radius={i === labels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

const ROUTINE_COLOURS = [tk('accent'), '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function routineColour(i: number): string {
  return ROUTINE_COLOURS[i % ROUTINE_COLOURS.length]!;
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const local = new Date(`${localDateKey(d, TZ)}T12:00:00Z`);
  const monOffset = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - monOffset);
  return local.toISOString().slice(0, 10);
}

