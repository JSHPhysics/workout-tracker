// Bodyweight log helpers — rolling-average smoothing for the chart
// overlay. Pure: input is a sorted-ascending series; output is the
// same series with a `rollingAvg` field per point.

export interface BodyweightPoint {
  /** YYYY-MM-DD. */
  date: string;
  weight: number;
}

export interface SmoothedPoint extends BodyweightPoint {
  /** Trailing window mean over `windowDays` (inclusive). `null` when
   * there isn't enough data within the window to be meaningful. */
  rollingAvg: number | null;
}

const DAY_MS = 86_400_000;

/** Trailing N-day rolling average. Defaults to 7 days. The window is
 * date-based, not point-based — sparse weigh-ins (e.g. weekly only)
 * still produce a meaningful rolling line that represents "what was
 * the average over the last week?" rather than "average of the last
 * 7 entries". */
export function rollingAverage(
  points: readonly BodyweightPoint[],
  windowDays = 7,
): SmoothedPoint[] {
  return points.map((p, i) => {
    const cutoff = Date.parse(`${p.date}T12:00:00Z`) - (windowDays - 1) * DAY_MS;
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0; j--) {
      const q = points[j]!;
      const t = Date.parse(`${q.date}T12:00:00Z`);
      if (t < cutoff) break;
      sum += q.weight;
      n += 1;
    }
    const rollingAvg = n >= 2 ? sum / n : null;
    return { ...p, rollingAvg };
  });
}
