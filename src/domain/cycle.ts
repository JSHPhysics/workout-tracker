// Menstrual cycle phase calculation. Pure — no React, no Dexie.
//
// Model:
//   1. Each `PeriodLog` records the start date (and optional end) of
//      a period. The user logs these manually in the app.
//   2. Cycle length is the gap between consecutive starts. With 2+
//      logs we average the most-recent gaps; with 0–1 we fall back
//      to a 28-day default.
//   3. For a given query date, the *current cycle* is the most recent
//      log whose `startDate <= queryDate`. Day-of-cycle = days since
//      that startDate + 1.
//   4. Phase boundaries within a cycle are anchored to ovulation
//      sitting ~14 days before the *next* period (the luteal phase
//      is more stable than the follicular). Menstrual phase ends on
//      the logged `endDate` if present, otherwise day 5 by convention.
//
// Limitations: this is calendar math, not biology. Highly irregular
// cycles will produce noisy phase predictions. The UI surfaces the
// computed values as context, not advice.

import type { CyclePhase, PeriodLog } from '../types';

export const DEFAULT_CYCLE_LENGTH_DAYS = 28;
export const DEFAULT_PERIOD_LENGTH_DAYS = 5;

const DAY_MS = 86_400_000;

export interface CycleSnapshot {
  /** 1-indexed day of the current cycle. */
  dayOfCycle: number;
  /** Estimated total length of the current cycle. */
  cycleLength: number;
  phase: CyclePhase;
  /** YYYY-MM-DD of the period that opened the current cycle. */
  cycleStart: string;
  /** True when day-of-cycle exceeds the predicted cycleLength —
   * the user is "late" relative to the rolling-average prediction.
   * UI may want to flag this gently. */
  overdue: boolean;
}

/** YYYY-MM-DD addition. Pure date math; uses UTC midpoints to dodge
 * DST boundaries. */
function addDays(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

/** Number of whole days from a → b (b minus a). Negative when b < a. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  return Math.round((tb - ta) / DAY_MS);
}

/** Average gap between consecutive period starts, looking at the
 * most recent `windowCount` cycles. Returns null when fewer than
 * two logs are available. */
export function averageCycleLength(
  logs: readonly PeriodLog[],
  windowCount = 4,
): number | null {
  if (logs.length < 2) return null;
  const sorted = [...logs].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(daysBetween(sorted[i - 1]!.startDate, sorted[i]!.startDate));
  }
  const window = gaps.slice(-windowCount);
  const sum = window.reduce((s, g) => s + g, 0);
  return Math.round(sum / window.length);
}

/** Compute the cycle snapshot at `date`. Returns null when there are
 * no logged periods, or when `date` predates the earliest log. */
export function cyclePhaseAt(
  date: string,
  logs: readonly PeriodLog[],
): CycleSnapshot | null {
  if (logs.length === 0) return null;
  const sorted = [...logs].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  // Find the most recent log whose start is on or before `date`.
  let current: PeriodLog | null = null;
  for (const log of sorted) {
    if (log.startDate <= date) current = log;
    else break;
  }
  if (!current) return null;

  const cycleLength = averageCycleLength(sorted) ?? DEFAULT_CYCLE_LENGTH_DAYS;
  const dayOfCycle = daysBetween(current.startDate, date) + 1;
  const overdue = dayOfCycle > cycleLength;
  const phase = phaseForDay(dayOfCycle, cycleLength, current.endDate);

  return {
    dayOfCycle,
    cycleLength,
    phase,
    cycleStart: current.startDate,
    overdue,
  };
}

/** Phase boundaries within a single cycle. Ovulation centred on
 * `cycleLength - 14` (the luteal phase is the stable end). */
export function phaseForDay(
  dayOfCycle: number,
  cycleLength: number,
  endDate: string | undefined,
  cycleStart?: string,
): CyclePhase {
  // Menstrual: day 1 → endDate (if logged + computable), else day 5.
  let menstrualEnd = DEFAULT_PERIOD_LENGTH_DAYS;
  if (endDate && cycleStart) {
    menstrualEnd = Math.max(1, daysBetween(cycleStart, endDate) + 1);
  }
  if (dayOfCycle <= menstrualEnd) return 'menstrual';

  // Ovulation: ±1 day around (cycleLength − 14).
  const ovulationDay = Math.max(menstrualEnd + 1, cycleLength - 14);
  if (dayOfCycle >= ovulationDay - 1 && dayOfCycle <= ovulationDay + 1) {
    return 'ovulation';
  }
  if (dayOfCycle < ovulationDay - 1) return 'follicular';
  return 'luteal';
}

/** Predicted next period start (for the chip / overdue indicator). */
export function predictedNextStart(
  logs: readonly PeriodLog[],
): string | null {
  if (logs.length === 0) return null;
  const sorted = [...logs].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const last = sorted[sorted.length - 1]!;
  const cycleLength =
    averageCycleLength(sorted) ?? DEFAULT_CYCLE_LENGTH_DAYS;
  return addDays(last.startDate, cycleLength);
}

// Re-exports for tests + callers that don't want to import from `../types`.
export { addDays as _addDaysForTest, daysBetween as _daysBetweenForTest };
