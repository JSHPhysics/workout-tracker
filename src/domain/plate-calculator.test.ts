import { describe, expect, it } from 'vitest';
import { calculatePlates, type PlateInventoryEntry } from './plate-calculator';

const UK_HOME_GYM: PlateInventoryEntry[] = [
  { weight: 20, count: 4 },
  { weight: 15, count: 2 },
  { weight: 10, count: 4 },
  { weight: 5, count: 2 },
  { weight: 2.5, count: 4 },
  { weight: 1.25, count: 4 },
];

describe('calculatePlates', () => {
  it('returns just-the-bar when target equals bar weight', () => {
    const r = calculatePlates({
      target: 20,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([]);
    expect(r.load.total).toBe(20);
  });

  it('reports under-bar when target is below the bar', () => {
    const r = calculatePlates({
      target: 15,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('under-bar');
    expect(r.load.total).toBe(20);
  });

  it('loads exactly with one plate per side', () => {
    const r = calculatePlates({
      target: 60,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([20]);
    expect(r.load.total).toBe(60);
  });

  it('loads heaviest first, multiple plates per side', () => {
    const r = calculatePlates({
      target: 100,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([20, 20]);
    expect(r.load.total).toBe(100);
  });

  it('handles fractional plates exactly', () => {
    // Target 27.5 → per side 3.75 → 2.5 + 1.25
    const r = calculatePlates({
      target: 27.5,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([2.5, 1.25]);
    expect(r.load.total).toBe(27.5);
  });

  it('returns the closest achievable when target is between increments', () => {
    // Target 23 with bar=20 → per side 1.5; achievable per side: 1.25
    // (under) or 2.5 (over). Distances: 0.25 vs 1.0 → pick 1.25 under.
    const r = calculatePlates({
      target: 23,
      barWeight: 20,
      inventory: [
        { weight: 2.5, count: 4 },
        { weight: 1.25, count: 4 },
      ],
    });
    expect(r.kind).toBe('closest');
    if (r.kind === 'closest') {
      expect(r.load.perSide).toEqual([1.25]);
      expect(r.load.total).toBe(22.5);
      expect(r.delta).toBeCloseTo(-0.5);
    }
  });

  it('prefers a closer up-candidate when overshoot is smaller than undershoot', () => {
    // Target 24 with bar=20, per side 2 → achievable 1.25 (under, 2.5 off
    // total) or 2.5 (over, 1.0 off total) → pick 2.5.
    const r = calculatePlates({
      target: 24,
      barWeight: 20,
      inventory: [
        { weight: 2.5, count: 4 },
        { weight: 1.25, count: 4 },
      ],
    });
    expect(r.kind).toBe('closest');
    if (r.kind === 'closest') {
      expect(r.load.perSide).toEqual([2.5]);
      expect(r.load.total).toBe(25);
      expect(r.delta).toBeCloseTo(1);
    }
  });

  it('respects inventory limits', () => {
    // Only 1 pair (count 2) of 20kg — per side max 1 × 20.
    const r = calculatePlates({
      target: 100,
      barWeight: 20,
      inventory: [
        { weight: 20, count: 2 },
        { weight: 10, count: 4 },
      ],
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([20, 10, 10]);
    expect(r.load.total).toBe(100);
  });

  it('reports empty inventory when there are no usable pairs', () => {
    const r = calculatePlates({
      target: 50,
      barWeight: 20,
      // count 1 = no pair, ignored.
      inventory: [{ weight: 10, count: 1 }],
    });
    expect(r.kind).toBe('empty-inventory');
    expect(r.load.total).toBe(20);
  });

  it('rounds odd plate counts down to the nearest pair', () => {
    // count 9 → 4 plates per side (one orphan ignored).
    const r = calculatePlates({
      target: 60,
      barWeight: 20,
      inventory: [{ weight: 5, count: 9 }],
    });
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([5, 5, 5, 5]);
    expect(r.load.total).toBe(60);
  });

  it('reports closest when inventory is exhausted before the target', () => {
    // count 5 → only 2 plates per side. Target 60 (per side 20) is
    // unreachable; closest is 2 × 5 = 10 per side → total 40.
    const r = calculatePlates({
      target: 60,
      barWeight: 20,
      inventory: [{ weight: 5, count: 5 }],
    });
    expect(r.kind).toBe('closest');
    if (r.kind === 'closest') {
      expect(r.load.perSide).toEqual([5, 5]);
      expect(r.load.total).toBe(40);
      expect(r.delta).toBeCloseTo(-20);
    }
  });

  it('returns under-bar even with non-empty inventory', () => {
    const r = calculatePlates({
      target: 10,
      barWeight: 20,
      inventory: UK_HOME_GYM,
    });
    expect(r.kind).toBe('under-bar');
  });

  it('handles a 15kg bar with the same inventory', () => {
    const r = calculatePlates({
      target: 25,
      barWeight: 15,
      inventory: UK_HOME_GYM,
    });
    // Per side 5 → one 5kg plate.
    expect(r.kind).toBe('exact');
    expect(r.load.perSide).toEqual([5]);
    expect(r.load.total).toBe(25);
  });
});
