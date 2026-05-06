import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { rollingAverage } from '../domain/bodyweight';
import type { BodyweightLog } from '../types';

interface Props {
  logs: readonly BodyweightLog[];
  /** Rolling-average overlay shows a smoother trend on noisy weigh-ins. */
  showRollingAverage?: boolean;
  /** Optional CSS variable name to use for the primary line; defaults to accent. */
  className?: string;
}

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const tk = (name: string, alpha = 1): string =>
  alpha === 1
    ? `rgb(var(--${name}))`
    : `rgb(var(--${name}) / ${alpha})`;

export function BodyweightChart({
  logs,
  showRollingAverage = true,
  className,
}: Props) {
  const data = useMemo(
    () =>
      rollingAverage(
        logs.map((l) => ({ date: l.date, weight: l.weight })),
        7,
      ),
    [logs],
  );

  if (data.length === 0) {
    return (
      <p className="rounded-xl bg-surface-soft/60 p-3 text-xs text-fg-muted">
        Log your first weigh-in to see the trend line.
      </p>
    );
  }

  return (
    <div className={['h-44 w-full', className ?? ''].join(' ')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={tk('line')} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: tk('fg-faint') }}
            tickFormatter={(d) => DATE_LABEL.format(new Date(`${d}T12:00:00Z`))}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 9, fill: tk('fg-faint') }}
            width={32}
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
            formatter={(v: number, name: string) => [
              `${typeof v === 'number' ? v.toFixed(1) : v} kg`,
              name === 'weight' ? 'Weight' : '7-day avg',
            ]}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={tk('accent')}
            strokeWidth={2}
            dot={{ r: 2, fill: tk('accent') }}
            isAnimationActive={false}
          />
          {showRollingAverage && (
            <Line
              type="monotone"
              dataKey="rollingAvg"
              stroke={tk('fg-muted')}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
