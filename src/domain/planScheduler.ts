// Pure schedule generator. Given a plan + the source routine,
// produces the list of `ScheduledSession` rows it should materialise
// out to a horizon. No React, no Dexie — input is data, output is
// data, side-effect free.
//
// Concepts:
//   - "Workout day" = one element of a routine's day list whose
//     `kind === 'workout'`. Skipped over rest days entirely.
//   - "Day cycle" = the unique sequence of workout days the user
//     rotates through. For a routine with two distinct days (e.g.
//     StrongLifts A/B) the cycle has length 2 regardless of how
//     many weeks the routine has on paper.
//   - "Cadence weekdays" = the calendar weekdays the user wants to
//     train on, derived from `frequencyPerWeek` + `preferredWeekdays`.
//
// For finite plans we walk forward through the routine's
// (week, day) tuples in order, assigning each one to the next
// cadence weekday on the calendar. Bumping past `endDate` is
// allowed — finite-but-elastic per the user's spec.
//
// For rotation plans we walk forward through the day cycle
// indefinitely, emitting up to `horizonWeeks` weeks worth of dates.
// The roll-forward path will call this again with the latest
// emitted date as the new start when generation needs to continue.

import type {
  DayTemplate,
  PlanMode,
  RoutineTemplate,
  WeekTemplate,
} from '../types';

export interface PlanScheduleInput {
  /** YYYY-MM-DD in user's local TZ — first day the plan is allowed
   * to land a session. The first generated row will be the first
   * cadence weekday >= this date. */
  startDate: string;
  mode: PlanMode;
  /** 1–7. Combined with cadenceWeekdays to pick concrete dates. */
  frequencyPerWeek: number;
  /** ISO weekday numbers (0 = Sun … 6 = Sat). When empty, we
   * auto-distribute evenly across the week starting from
   * startDate's weekday. Length, when non-empty, must be at least 1
   * (we don't insist on === frequencyPerWeek — that's a UI
   * concern). */
  preferredWeekdays: number[];
  /** The routine to source week + day templates from. */
  routine: RoutineTemplate;
  /** Only used by rotation mode — caps how far ahead we generate.
   * Default 12. Finite plans ignore this; they stop when the
   * routine's tuples run out. */
  horizonWeeks?: number;
}

export interface ScheduledSlot {
  /** YYYY-MM-DD. */
  plannedDate: string;
  weekNumber: number;
  dayNumber: number;
}

/** Generate the slot list for a plan. Returns an empty array if the
 * routine has no workout days at all (defensive — UI should prevent). */
export function generateSchedule(input: PlanScheduleInput): ScheduledSlot[] {
  const { startDate, mode, routine, horizonWeeks = 12 } = input;
  const cadence = resolveCadenceWeekdays(input);
  if (cadence.length === 0) return [];

  const tuples = collectWorkoutTuples(routine);
  if (tuples.length === 0) return [];

  // Iterator over cadence calendar dates: yields the first cadence
  // weekday >= startDate, then each subsequent cadence weekday in
  // calendar order.
  const dateGen = cadenceDateGenerator(startDate, cadence);

  if (mode === 'finite') {
    // Walk every (week, day) tuple in routine order; pair each with
    // the next cadence date. End-of-routine = end of plan.
    return tuples.map((t) => ({ ...t, plannedDate: dateGen.next() }));
  }

  // rotation: cycle through unique day templates indefinitely up to
  // the horizon. We use the routine's first occurrence of each
  // (workoutLabel || dayNumber) so subsequent reps point at the
  // canonical week-1 day rather than re-using the routine's later
  // (W2 D1, W3 D1, …) repeats — those are usually progression
  // copies, not distinct workouts.
  const cycle = uniqueWorkoutCycle(tuples);
  const horizonEnd = addDays(parseLocalDate(startDate), horizonWeeks * 7);
  const slots: ScheduledSlot[] = [];
  let cycleIdx = 0;
  while (true) {
    const next = dateGen.peek();
    // Half-open horizon: a 4-week horizon means [start, start+28d) so
    // a cadence date that lands exactly on day 28 is *not* included.
    // That's the natural semantics for "the next 4 weeks".
    if (parseLocalDate(next) >= horizonEnd) break;
    const day = cycle[cycleIdx % cycle.length]!;
    slots.push({
      plannedDate: dateGen.next(),
      weekNumber: day.weekNumber,
      dayNumber: day.dayNumber,
    });
    cycleIdx += 1;
  }
  return slots;
}

// --- Internals --------------------------------------------------------------

interface WorkoutTuple {
  weekNumber: number;
  dayNumber: number;
  /** Label or dayNumber identity used for cycle de-dup. */
  identity: string;
}

function collectWorkoutTuples(routine: RoutineTemplate): WorkoutTuple[] {
  const out: WorkoutTuple[] = [];
  for (const week of routine.weeks) {
    for (const day of week.days) {
      if (day.kind !== 'workout') continue;
      out.push({
        weekNumber: week.weekNumber,
        dayNumber: day.dayNumber,
        identity: workoutIdentity(week, day),
      });
    }
  }
  return out;
}

function workoutIdentity(week: WeekTemplate, day: DayTemplate): string {
  // Prefer workoutLabel ("A", "B", "Pull") over the bare day number,
  // since multi-week routines often repeat the same labels. Fall back
  // to the index so identity is always defined.
  return day.workoutLabel ?? `D${day.dayNumber}`;
  // weekNumber intentionally unused — we want week-2's "Workout A"
  // to count as the same cycle slot as week-1's "Workout A".
  void week;
}

function uniqueWorkoutCycle(tuples: WorkoutTuple[]): WorkoutTuple[] {
  const seen = new Set<string>();
  const out: WorkoutTuple[] = [];
  for (const t of tuples) {
    if (seen.has(t.identity)) continue;
    seen.add(t.identity);
    out.push(t);
  }
  return out;
}

function resolveCadenceWeekdays(input: PlanScheduleInput): number[] {
  const { preferredWeekdays, frequencyPerWeek, startDate } = input;
  if (preferredWeekdays.length > 0) {
    // Sort + de-dupe, keeping the user's choices verbatim.
    return Array.from(new Set(preferredWeekdays)).sort((a, b) => a - b);
  }
  // Auto-distribute: spread `frequencyPerWeek` slots across the week
  // starting from the start date's weekday. Even spacing
  // (Math.round(i * 7 / freq)) gives e.g. 3/wk -> [start, start+2, start+5].
  const startWeekday = parseLocalDate(startDate).getDay();
  const freq = Math.min(7, Math.max(1, frequencyPerWeek));
  const out = new Set<number>();
  for (let i = 0; i < freq; i++) {
    out.add((startWeekday + Math.round((i * 7) / freq)) % 7);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** Generator over calendar dates that fall on any of `weekdays`,
 * starting from the first such date >= startDate (inclusive). */
function cadenceDateGenerator(startDate: string, weekdays: number[]) {
  const set = new Set(weekdays);
  let cursor = parseLocalDate(startDate);
  // Advance to the first matching weekday.
  while (!set.has(cursor.getDay())) {
    cursor = addDays(cursor, 1);
  }
  return {
    peek: (): string => formatLocalDate(cursor),
    next: (): string => {
      const out = formatLocalDate(cursor);
      // Step at least one day, then walk forward to the next match.
      cursor = addDays(cursor, 1);
      while (!set.has(cursor.getDay())) {
        cursor = addDays(cursor, 1);
      }
      return out;
    },
  };
}

/** Parse YYYY-MM-DD as local-noon — midnight introduces DST jitter. */
export function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** YYYY-MM-DD in local TZ. Mirrors the helper in
 * LogPastWorkoutModal — kept inline so this module stays
 * dependency-free at the unit-test boundary. */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}
