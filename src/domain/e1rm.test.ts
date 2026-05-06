import { describe, expect, it } from 'vitest';
import { epleyE1RM } from './e1rm';

describe('epleyE1RM', () => {
  it('returns the lifted weight at 1 rep', () => {
    expect(epleyE1RM(100, 1)).toBe(100);
  });

  it('matches Epley for typical strength reps', () => {
    // 100 × (1 + 5/30) = 116.666…
    expect(epleyE1RM(100, 5)).toBeCloseTo(116.6667, 3);
    // 80 × (1 + 8/30) = 101.333…
    expect(epleyE1RM(80, 8)).toBeCloseTo(101.3333, 3);
  });

  it('orders heavier-fewer above lighter-more when both are 1RM-ish', () => {
    const heavy = epleyE1RM(120, 3)!;
    const light = epleyE1RM(100, 5)!;
    expect(heavy).toBeGreaterThan(light);
  });

  it('returns null for non-strength rep ranges (>12)', () => {
    expect(epleyE1RM(50, 15)).toBeNull();
    expect(epleyE1RM(40, 20)).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(epleyE1RM(0, 5)).toBeNull();
    expect(epleyE1RM(100, 0)).toBeNull();
    expect(epleyE1RM(-5, 5)).toBeNull();
    expect(epleyE1RM(100, -1)).toBeNull();
    expect(epleyE1RM(NaN, 5)).toBeNull();
    expect(epleyE1RM(100, NaN)).toBeNull();
  });
});
