import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CYCLE_LENGTH_DAYS,
  averageCycleLength,
  cyclePhaseAt,
  phaseForDay,
  predictedNextStart,
} from './cycle';
import type { PeriodLog } from '../types';

function log(id: string, startDate: string, endDate?: string): PeriodLog {
  return {
    id,
    profileId: 'hayley',
    startDate,
    ...(endDate ? { endDate } : {}),
  };
}

describe('averageCycleLength', () => {
  it('returns null with fewer than two logs', () => {
    expect(averageCycleLength([])).toBeNull();
    expect(averageCycleLength([log('a', '2026-04-01')])).toBeNull();
  });

  it('averages gaps between consecutive starts', () => {
    const logs = [
      log('a', '2026-01-01'),
      log('b', '2026-01-29'), // 28
      log('c', '2026-02-26'), // 28
      log('d', '2026-03-26'), // 28
    ];
    expect(averageCycleLength(logs)).toBe(28);
  });

  it('handles irregular cycles (mean of gaps)', () => {
    const logs = [
      log('a', '2026-01-01'),
      log('b', '2026-01-30'), // 29
      log('c', '2026-02-25'), // 26
      log('d', '2026-03-26'), // 29
    ];
    // Mean of [29, 26, 29] = 28
    expect(averageCycleLength(logs)).toBe(28);
  });

  it('windows to the most recent N cycles', () => {
    const logs = [
      log('a', '2026-01-01'),
      log('b', '2026-01-21'), // 20 — anomaly
      log('c', '2026-02-21'), // 31
      log('d', '2026-03-21'), // 28
      log('e', '2026-04-19'), // 29
    ];
    // Default window = 4 → last 4 gaps if we had them, but we have 4
    // total: [20, 31, 28, 29], mean = 27
    expect(averageCycleLength(logs, 4)).toBe(27);
    // Tighter window of 2 ignores the early anomaly entirely.
    expect(averageCycleLength(logs, 2)).toBe(29); // (28 + 29) / 2 = 28.5 → 29
  });
});

describe('phaseForDay', () => {
  it('classifies a textbook 28-day cycle', () => {
    const cl = 28;
    expect(phaseForDay(1, cl, undefined)).toBe('menstrual');
    expect(phaseForDay(5, cl, undefined)).toBe('menstrual');
    expect(phaseForDay(6, cl, undefined)).toBe('follicular');
    expect(phaseForDay(13, cl, undefined)).toBe('ovulation');
    expect(phaseForDay(14, cl, undefined)).toBe('ovulation');
    expect(phaseForDay(15, cl, undefined)).toBe('ovulation');
    expect(phaseForDay(16, cl, undefined)).toBe('luteal');
    expect(phaseForDay(28, cl, undefined)).toBe('luteal');
  });

  it('uses the logged endDate to set the menstrual end', () => {
    // Period ran Apr 1–4 (4 days) → menstrual phase ends day 4
    const start = '2026-04-01';
    const end = '2026-04-04';
    expect(phaseForDay(4, 28, end, start)).toBe('menstrual');
    expect(phaseForDay(5, 28, end, start)).toBe('follicular');
  });

  it('shifts ovulation for shorter cycles', () => {
    // 25-day cycle → ovulation centred on day 11 (25−14)
    expect(phaseForDay(10, 25, undefined)).toBe('ovulation');
    expect(phaseForDay(11, 25, undefined)).toBe('ovulation');
    expect(phaseForDay(12, 25, undefined)).toBe('ovulation');
    expect(phaseForDay(13, 25, undefined)).toBe('luteal');
  });

  it('shifts ovulation for longer cycles', () => {
    // 32-day cycle → ovulation centred on day 18
    expect(phaseForDay(17, 32, undefined)).toBe('ovulation');
    expect(phaseForDay(18, 32, undefined)).toBe('ovulation');
    expect(phaseForDay(19, 32, undefined)).toBe('ovulation');
    expect(phaseForDay(20, 32, undefined)).toBe('luteal');
  });
});

describe('cyclePhaseAt', () => {
  const logs: PeriodLog[] = [
    log('a', '2026-04-01', '2026-04-05'),
    log('b', '2026-04-29'),
  ];

  it('returns null when no logs', () => {
    expect(cyclePhaseAt('2026-04-15', [])).toBeNull();
  });

  it('returns null when query date predates first log', () => {
    expect(cyclePhaseAt('2026-03-01', logs)).toBeNull();
  });

  it('reports day-of-cycle from the most recent qualifying log', () => {
    const r = cyclePhaseAt('2026-04-15', logs)!;
    expect(r.cycleStart).toBe('2026-04-01');
    expect(r.dayOfCycle).toBe(15); // Apr 1 → Apr 15 = 14 days, +1 = 15
    expect(r.cycleLength).toBe(28); // single gap = 28 days
    expect(r.phase).toBe('ovulation'); // day 15 of 28-day cycle
    expect(r.overdue).toBe(false);
  });

  it('switches to the next cycle once a new period starts', () => {
    const r = cyclePhaseAt('2026-04-29', logs)!;
    expect(r.cycleStart).toBe('2026-04-29');
    expect(r.dayOfCycle).toBe(1);
    expect(r.phase).toBe('menstrual');
  });

  it('flags overdue when day-of-cycle exceeds the average', () => {
    // Last log = Apr 29; cycleLength = 28; query 60 days later → day 61
    const r = cyclePhaseAt('2026-06-28', logs)!;
    expect(r.dayOfCycle).toBe(61);
    expect(r.overdue).toBe(true);
    expect(r.phase).toBe('luteal');
  });

  it('falls back to the default cycle length when only one log exists', () => {
    const single: PeriodLog[] = [log('a', '2026-04-01')];
    const r = cyclePhaseAt('2026-04-08', single)!;
    expect(r.cycleLength).toBe(DEFAULT_CYCLE_LENGTH_DAYS);
    expect(r.dayOfCycle).toBe(8);
    expect(r.phase).toBe('follicular');
  });
});

describe('predictedNextStart', () => {
  it('returns null with no logs', () => {
    expect(predictedNextStart([])).toBeNull();
  });

  it('adds the average cycle length to the most recent start', () => {
    const logs = [
      log('a', '2026-01-01'),
      log('b', '2026-01-29'),
      log('c', '2026-02-26'),
    ];
    expect(predictedNextStart(logs)).toBe('2026-03-26');
  });

  it('uses the default 28 days when only one log exists', () => {
    expect(predictedNextStart([log('a', '2026-04-01')])).toBe('2026-04-29');
  });
});
