import { describe, expect, it } from 'vitest';
import { computeStreak, localDateKey } from './streak';

const TZ = 'Europe/London';

// 2026-05-06 14:00 London — fixed "now" for deterministic current-streak tests.
const NOW = new Date('2026-05-06T13:00:00Z'); // 14:00 BST

function isoOn(localYmd: string, localTime = '12:00:00'): string {
  // London is BST (+01:00) on these dates, so subtract 1h to land on the
  // intended local clock-time when projected back through Intl.
  const t = Date.parse(`${localYmd}T${localTime}+01:00`);
  return new Date(t).toISOString();
}

describe('localDateKey', () => {
  it('returns YYYY-MM-DD in the given timezone', () => {
    expect(localDateKey(new Date('2026-05-06T13:00:00Z'), TZ)).toBe('2026-05-06');
  });

  it('rolls over at local midnight, not UTC', () => {
    // 23:30 UTC = 00:30 next-day London (in BST).
    expect(localDateKey(new Date('2026-05-06T23:30:00Z'), TZ)).toBe('2026-05-07');
  });
});

describe('computeStreak', () => {
  it('returns zeros for an empty history', () => {
    expect(computeStreak({ completedAt: [], timeZone: TZ, now: NOW })).toEqual({
      current: 0,
      longest: 0,
    });
  });

  it('counts a single-day session as a streak of 1', () => {
    expect(
      computeStreak({
        completedAt: [isoOn('2026-05-06')],
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ current: 1, longest: 1 });
  });

  it('counts consecutive days', () => {
    const r = computeStreak({
      completedAt: [
        isoOn('2026-05-04'),
        isoOn('2026-05-05'),
        isoOn('2026-05-06'),
      ],
      timeZone: TZ,
      now: NOW,
    });
    expect(r).toEqual({ current: 3, longest: 3 });
  });

  it('keeps current streak alive while today is unworked but yesterday was', () => {
    // "Today" is 2026-05-06 in TZ. Trained yesterday and the day before;
    // streak is alive (2) until midnight ticks over.
    const r = computeStreak({
      completedAt: [isoOn('2026-05-04'), isoOn('2026-05-05')],
      timeZone: TZ,
      now: NOW,
    });
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });

  it('breaks current streak when there is a gap day', () => {
    const r = computeStreak({
      completedAt: [isoOn('2026-05-03'), isoOn('2026-05-05'), isoOn('2026-05-06')],
      timeZone: TZ,
      now: NOW,
    });
    expect(r.current).toBe(2); // 5th + 6th
    expect(r.longest).toBe(2);
  });

  it('returns the longest run from anywhere in history', () => {
    const r = computeStreak({
      completedAt: [
        // 4-day run mid-history
        isoOn('2026-04-10'),
        isoOn('2026-04-11'),
        isoOn('2026-04-12'),
        isoOn('2026-04-13'),
        // gap
        isoOn('2026-05-06'),
      ],
      timeZone: TZ,
      now: NOW,
    });
    expect(r.current).toBe(1);
    expect(r.longest).toBe(4);
  });

  it('dedupes multiple sessions on the same calendar day', () => {
    const r = computeStreak({
      completedAt: [
        isoOn('2026-05-06', '08:00:00'),
        isoOn('2026-05-06', '18:30:00'),
      ],
      timeZone: TZ,
      now: NOW,
    });
    expect(r).toEqual({ current: 1, longest: 1 });
  });

  it('breaks current streak when the latest session is older than yesterday', () => {
    const r = computeStreak({
      completedAt: [isoOn('2026-05-01'), isoOn('2026-05-02'), isoOn('2026-05-03')],
      timeZone: TZ,
      now: NOW,
    });
    expect(r.current).toBe(0);
    expect(r.longest).toBe(3);
  });

  it('ignores invalid timestamps', () => {
    const r = computeStreak({
      completedAt: [isoOn('2026-05-06'), '', 'not-a-date'],
      timeZone: TZ,
      now: NOW,
    });
    expect(r.current).toBe(1);
  });
});
