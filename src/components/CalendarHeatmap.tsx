import { useMemo } from 'react';
import { localDateKey } from '../domain/streak';

interface Props {
  /** ISO timestamps (UTC) of completed sessions. */
  completedAt: readonly string[];
  /** IANA timezone for the local-day grouping. */
  timeZone: string;
  /** Inclusive number of past weeks to render (column count). */
  weeks?: number;
  /** Called when a date cell is tapped — receives the YYYY-MM-DD key. */
  onSelect?: (dateKey: string) => void;
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Compact 7×N calendar heatmap. Cells shaded by session count for
 * that local day. Aligned so each row is a weekday and each column
 * is a week (oldest left, current right). */
export function CalendarHeatmap({
  completedAt,
  timeZone,
  weeks = 12,
  onSelect,
}: Props) {
  const grid = useMemo(
    () => buildGrid(completedAt, timeZone, weeks),
    [completedAt, timeZone, weeks],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-1">
        <div className="flex flex-col justify-between py-[2px]">
          {DAYS.map((d, i) => (
            <span
              key={i}
              className="h-3 text-[0.55rem] font-medium uppercase leading-3 text-fg-faint"
              aria-hidden
            >
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-1">
          {grid.columns.map((col, ci) => (
            <div key={ci} className="flex flex-1 flex-col gap-1">
              {col.map((cell) => (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => onSelect?.(cell.dateKey)}
                  disabled={cell.isFuture}
                  aria-label={`${cell.dateKey} — ${cell.count} session${cell.count === 1 ? '' : 's'}`}
                  className={[
                    'h-3 w-full rounded-[3px] transition',
                    cell.isFuture
                      ? 'cursor-default bg-transparent'
                      : intensityClass(cell.count),
                    cell.isToday ? 'ring-1 ring-accent ring-offset-0' : '',
                    onSelect && !cell.isFuture && cell.count > 0
                      ? 'cursor-pointer hover:opacity-80'
                      : '',
                  ].join(' ')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-[0.16em] text-fg-faint">
        <span>{grid.startLabel}</span>
        <Legend />
        <span>{grid.endLabel}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-1">
      <span>Less</span>
      {[0, 1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          className={['h-2 w-2 rounded-[2px]', intensityClass(n)].join(' ')}
        />
      ))}
      <span>More</span>
    </span>
  );
}

function intensityClass(count: number): string {
  if (count <= 0) return 'bg-surface-soft';
  if (count === 1) return 'bg-accent/40';
  if (count === 2) return 'bg-accent/70';
  return 'bg-accent';
}

interface Cell {
  dateKey: string;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

function buildGrid(
  completedAt: readonly string[],
  timeZone: string,
  weeks: number,
): { columns: Cell[][]; startLabel: string; endLabel: string } {
  const counts = new Map<string, number>();
  for (const iso of completedAt) {
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDateKey(d, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = new Date();
  const todayKey = localDateKey(today, timeZone);

  // Anchor: the Monday of the current local week. Walk back `weeks-1`
  // Mondays from there to find the leftmost column.
  const todayLocal = new Date(`${todayKey}T12:00:00Z`);
  const dayOfWeek = todayLocal.getUTCDay(); // 0=Sun..6=Sat
  // Monday-based offset (0..6, Mon=0)
  const monOffset = (dayOfWeek + 6) % 7;
  const thisMonday = new Date(todayLocal);
  thisMonday.setUTCDate(todayLocal.getUTCDate() - monOffset);

  const columns: Cell[][] = [];
  for (let c = 0; c < weeks; c++) {
    const colMonday = new Date(thisMonday);
    colMonday.setUTCDate(thisMonday.getUTCDate() - 7 * (weeks - 1 - c));
    const col: Cell[] = [];
    for (let r = 0; r < 7; r++) {
      const cellDate = new Date(colMonday);
      cellDate.setUTCDate(colMonday.getUTCDate() + r);
      const dateKey = cellDate.toISOString().slice(0, 10);
      col.push({
        dateKey,
        count: counts.get(dateKey) ?? 0,
        isToday: dateKey === todayKey,
        isFuture: dateKey > todayKey,
      });
    }
    columns.push(col);
  }
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const startLabel = fmt.format(new Date(`${columns[0]?.[0]?.dateKey}T12:00:00Z`));
  const endLabel = 'Now';
  return { columns, startLabel, endLabel };
}
