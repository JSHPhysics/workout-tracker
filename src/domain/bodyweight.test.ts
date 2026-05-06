import { describe, expect, it } from 'vitest';
import { rollingAverage } from './bodyweight';

describe('rollingAverage', () => {
  it('returns null until at least two points are inside the window', () => {
    const out = rollingAverage(
      [
        { date: '2026-05-01', weight: 80 },
        { date: '2026-05-08', weight: 81 }, // outside the trailing 7-day window
      ],
      7,
    );
    expect(out[0]?.rollingAvg).toBeNull();
    // 8 May is exactly 7 days after 1 May; cutoff is 8 May − 6 days = 2 May,
    // so 1 May falls outside and the window contains only the new point.
    expect(out[1]?.rollingAvg).toBeNull();
  });

  it('averages all points inside the trailing window', () => {
    const out = rollingAverage(
      [
        { date: '2026-05-01', weight: 80 },
        { date: '2026-05-03', weight: 82 },
        { date: '2026-05-05', weight: 81 },
        { date: '2026-05-07', weight: 79 },
      ],
      7,
    );
    expect(out[0]?.rollingAvg).toBeNull(); // single point
    expect(out[1]?.rollingAvg).toBe((80 + 82) / 2);
    expect(out[2]?.rollingAvg).toBe((80 + 82 + 81) / 3);
    expect(out[3]?.rollingAvg).toBe((80 + 82 + 81 + 79) / 4);
  });

  it('drops points that fall outside the trailing window', () => {
    const out = rollingAverage(
      [
        { date: '2026-04-20', weight: 90 }, // outside
        { date: '2026-05-01', weight: 80 },
        { date: '2026-05-04', weight: 82 },
        { date: '2026-05-07', weight: 81 },
      ],
      7,
    );
    expect(out[3]?.rollingAvg).toBe((80 + 82 + 81) / 3);
  });

  it('respects a custom window', () => {
    const out = rollingAverage(
      [
        { date: '2026-05-01', weight: 80 },
        { date: '2026-05-15', weight: 82 },
        { date: '2026-05-29', weight: 84 },
      ],
      30,
    );
    expect(out[2]?.rollingAvg).toBe((80 + 82 + 84) / 3);
  });

  it('preserves date and weight on the output', () => {
    const out = rollingAverage(
      [{ date: '2026-05-01', weight: 80 }],
      7,
    );
    expect(out[0]).toMatchObject({ date: '2026-05-01', weight: 80 });
  });
});
