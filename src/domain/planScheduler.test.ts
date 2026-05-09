import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatLocalDate,
  generateSchedule,
  parseLocalDate,
} from './planScheduler';
import type { RoutineTemplate } from '../types';

// --- Fixtures ---------------------------------------------------------------

function workoutDay(dayNumber: number, label?: string) {
  return {
    dayNumber,
    kind: 'workout' as const,
    blocks: [],
    ...(label ? { workoutLabel: label } : {}),
  };
}

function restDay(dayNumber: number) {
  return { dayNumber, kind: 'rest' as const, blocks: [] };
}

/** Two-day rotation routine — A/B style (StrongLifts shape). */
const SL: RoutineTemplate = {
  id: 'sl',
  name: 'StrongLifts',
  description: '',
  weeks: [
    {
      weekNumber: 1,
      days: [workoutDay(1, 'A'), restDay(2), workoutDay(3, 'B'), restDay(4)],
    },
  ],
  isSeed: true,
  profileId: null,
  createdAt: '',
  updatedAt: '',
};

/** Finite 4-week routine — Bootyful Beginnings shape. */
const BB: RoutineTemplate = {
  id: 'bb',
  name: 'Bootyful',
  description: '',
  weeks: [
    {
      weekNumber: 1,
      days: [workoutDay(1, 'A'), workoutDay(2, 'B'), workoutDay(3, 'C')],
    },
    {
      weekNumber: 2,
      days: [workoutDay(1, 'A'), workoutDay(2, 'B'), workoutDay(3, 'C')],
    },
    {
      weekNumber: 3,
      days: [workoutDay(1, 'A'), workoutDay(2, 'B'), workoutDay(3, 'C')],
    },
    {
      weekNumber: 4,
      days: [workoutDay(1, 'A'), workoutDay(2, 'B'), workoutDay(3, 'C')],
    },
  ],
  isSeed: true,
  profileId: null,
  createdAt: '',
  updatedAt: '',
};

// --- Helpers tests ----------------------------------------------------------

describe('parseLocalDate / formatLocalDate', () => {
  it('round-trips a YYYY-MM-DD string', () => {
    expect(formatLocalDate(parseLocalDate('2026-05-09'))).toBe('2026-05-09');
  });
  it('addDays advances by N calendar days', () => {
    const d = parseLocalDate('2026-05-09'); // a Saturday
    expect(formatLocalDate(addDays(d, 1))).toBe('2026-05-10');
    expect(formatLocalDate(addDays(d, 7))).toBe('2026-05-16');
    expect(formatLocalDate(addDays(d, -1))).toBe('2026-05-08');
  });
});

// --- Finite mode ------------------------------------------------------------

describe('generateSchedule / finite', () => {
  it('emits one slot per (week, day) tuple, in routine order', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04', // Mon
      mode: 'finite',
      frequencyPerWeek: 3,
      preferredWeekdays: [1, 3, 5], // Mon, Wed, Fri
      routine: BB,
    });
    expect(slots).toHaveLength(12); // 4 weeks × 3 workouts/week
    // First 3: Mon/Wed/Fri of week 1
    expect(slots[0]?.plannedDate).toBe('2026-05-04');
    expect(slots[1]?.plannedDate).toBe('2026-05-06');
    expect(slots[2]?.plannedDate).toBe('2026-05-08');
    // Tuples come from the routine in order — week 1 then week 2.
    expect(slots[0]).toMatchObject({ weekNumber: 1, dayNumber: 1 });
    expect(slots[1]).toMatchObject({ weekNumber: 1, dayNumber: 2 });
    expect(slots[2]).toMatchObject({ weekNumber: 1, dayNumber: 3 });
    expect(slots[3]).toMatchObject({ weekNumber: 2, dayNumber: 1 });
    // And the next 3 are Mon/Wed/Fri of week 2.
    expect(slots[3]?.plannedDate).toBe('2026-05-11');
    expect(slots[4]?.plannedDate).toBe('2026-05-13');
    expect(slots[5]?.plannedDate).toBe('2026-05-15');
  });

  it('skips rest days entirely', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04',
      mode: 'finite',
      frequencyPerWeek: 2,
      preferredWeekdays: [1, 4], // Mon, Thu
      routine: SL, // routine has rest days at index 2 + 4
    });
    // SL only has 2 workout days per "week" — the rest days
    // shouldn't take cadence slots.
    expect(slots).toHaveLength(2);
    expect(slots[0]?.dayNumber).toBe(1);
    expect(slots[1]?.dayNumber).toBe(3);
  });
});

// --- Rotation mode ----------------------------------------------------------

describe('generateSchedule / rotation', () => {
  it('cycles through unique workout days indefinitely up to the horizon', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04', // Mon
      mode: 'rotation',
      frequencyPerWeek: 3,
      preferredWeekdays: [1, 3, 5], // M/W/F
      routine: SL,
      horizonWeeks: 4, // smaller for assertion clarity
    });
    // 3 sessions/week × 4 weeks = 12 cadence slots.
    expect(slots).toHaveLength(12);
    // Cycle is [A, B] (StrongLifts), so order is A B A B A B …
    expect(slots[0]).toMatchObject({ dayNumber: 1 }); // A
    expect(slots[1]).toMatchObject({ dayNumber: 3 }); // B
    expect(slots[2]).toMatchObject({ dayNumber: 1 }); // A
    expect(slots[3]).toMatchObject({ dayNumber: 3 }); // B
    expect(slots[4]).toMatchObject({ dayNumber: 1 }); // A
  });

  it('de-dupes the cycle by workoutLabel — repeated weeks pick the first occurrence', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04',
      mode: 'rotation',
      frequencyPerWeek: 3,
      preferredWeekdays: [1, 3, 5],
      routine: BB, // 4 weeks of A/B/C — cycle should be just A/B/C
      horizonWeeks: 1,
    });
    // 3 cadence dates in 1 week — should be A, B, C, all from week 1.
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.weekNumber)).toEqual([1, 1, 1]);
    expect(slots.map((s) => s.dayNumber)).toEqual([1, 2, 3]);
  });

  it('honours horizonWeeks as a calendar cap', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04',
      mode: 'rotation',
      frequencyPerWeek: 5,
      preferredWeekdays: [1, 2, 3, 4, 5], // weekdays
      routine: SL,
      horizonWeeks: 2,
    });
    expect(slots).toHaveLength(10);
    // No date should be more than 14 days past the start.
    const start = parseLocalDate('2026-05-04');
    for (const s of slots) {
      const days =
        (parseLocalDate(s.plannedDate).getTime() - start.getTime()) /
        (24 * 60 * 60 * 1000);
      expect(days).toBeLessThanOrEqual(14);
    }
  });
});

// --- Cadence resolution -----------------------------------------------------

describe('generateSchedule / cadence', () => {
  it('auto-distributes when no preferredWeekdays given (3/wk → start, +2, +5)', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04', // Mon = 1
      mode: 'rotation',
      frequencyPerWeek: 3,
      preferredWeekdays: [],
      routine: SL,
      horizonWeeks: 1,
    });
    // 1, round(7/3)=2, round(14/3)=5 → weekdays 1, 3, 6 (Mon, Wed, Sat)
    expect(slots[0]?.plannedDate).toBe('2026-05-04'); // Mon
    expect(slots[1]?.plannedDate).toBe('2026-05-06'); // Wed
    expect(slots[2]?.plannedDate).toBe('2026-05-09'); // Sat
  });

  it('skips ahead to the first cadence weekday >= startDate', () => {
    const slots = generateSchedule({
      startDate: '2026-05-05', // Tue
      mode: 'rotation',
      frequencyPerWeek: 1,
      preferredWeekdays: [5], // Fri
      routine: SL,
      horizonWeeks: 1,
    });
    // First Friday on or after Tue 5 May = Fri 8 May.
    expect(slots[0]?.plannedDate).toBe('2026-05-08');
  });

  it('starts on the start date when it already matches a cadence weekday', () => {
    const slots = generateSchedule({
      startDate: '2026-05-04', // Mon
      mode: 'rotation',
      frequencyPerWeek: 1,
      preferredWeekdays: [1], // Mon
      routine: SL,
      horizonWeeks: 1,
    });
    expect(slots[0]?.plannedDate).toBe('2026-05-04');
  });
});

// --- Defensive --------------------------------------------------------------

describe('generateSchedule / edge cases', () => {
  it('returns empty for a routine with no workout days', () => {
    const empty: RoutineTemplate = {
      ...SL,
      weeks: [{ weekNumber: 1, days: [restDay(1), restDay(2)] }],
    };
    expect(
      generateSchedule({
        startDate: '2026-05-04',
        mode: 'rotation',
        frequencyPerWeek: 3,
        preferredWeekdays: [1, 3, 5],
        routine: empty,
      }),
    ).toEqual([]);
  });

  it('returns empty when frequency + preferred resolves to no cadence', () => {
    // A near-impossible combination: explicit empty preferredWeekdays
    // would auto-distribute, so we have to trick it with frequency 0.
    // Currently freq is clamped 1–7 internally but we still want this
    // to be a stable no-op edge case.
    const slots = generateSchedule({
      startDate: '2026-05-04',
      mode: 'rotation',
      frequencyPerWeek: 0,
      preferredWeekdays: [],
      routine: SL,
      horizonWeeks: 0,
    });
    expect(slots).toEqual([]);
  });
});
