// Streak counting — current and longest stretches of consecutive
// calendar days with at least one completed session.
//
// SCOPE §7.8: "Resets at the user's local midnight (timezone-aware)."
// Inputs are completion timestamps in UTC; we project them onto the
// user's local calendar via Intl + timeZone before counting.

export interface StreakInput {
  /** ISO 8601 timestamps (UTC) of completed sessions. Order
   * insensitive — the function sorts/dedupes internally. */
  completedAt: readonly string[];
  /** IANA timezone, e.g. `'Europe/London'`. */
  timeZone: string;
  /** Pinned "today" used for current-streak calculation. Pass `Date.now()`
   * in production; tests pin a specific instant for determinism. */
  now: Date;
}

export interface StreakResult {
  current: number;
  longest: number;
}

const DAY_MS = 86_400_000;

/** Returns YYYY-MM-DD in the given timezone. Pure-string output so
 * date arithmetic can use UTC dates as a stable scaffold. */
export function localDateKey(d: Date, timeZone: string): string {
  // `en-CA` happens to format dates as YYYY-MM-DD without locale fuss.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Increment a YYYY-MM-DD key by `days`. Uses UTC midpoints under the
 * hood — safe because we never need the time-of-day, only the date. */
function addDays(key: string, days: number): string {
  const t = Date.parse(`${key}T12:00:00Z`); // midday avoids DST edges
  const next = new Date(t + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function computeStreak(input: StreakInput): StreakResult {
  const days = new Set<string>();
  for (const iso of input.completedAt) {
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    days.add(localDateKey(d, input.timeZone));
  }

  if (days.size === 0) return { current: 0, longest: 0 };

  const sorted = Array.from(days).sort(); // ASCII sort works for YYYY-MM-DD

  // Longest run of consecutive days.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (addDays(prev, 1) === curr) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak: walk backward from "today" (or yesterday if the user
  // hasn't trained today yet — a streak doesn't break until a *full
  // local day* passes with no session).
  const today = localDateKey(input.now, input.timeZone);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}
