import { describe, expect, it } from 'vitest';
import {
  RATING_EMOJI,
  RATING_LABELS,
  RATING_VALUES,
  averageEnergyLift,
  averageMoodLift,
  energyDelta,
  hasAnyRating,
  moodDelta,
  snapshotFromSession,
  type WellbeingSnapshot,
} from './wellbeing';

const empty: WellbeingSnapshot = {
  moodBefore: null,
  moodAfter: null,
  energyBefore: null,
  energyAfter: null,
};

describe('rating constants', () => {
  it('exposes a 5-element scale', () => {
    expect(RATING_EMOJI.length).toBe(5);
    expect(RATING_LABELS.length).toBe(5);
    expect(RATING_VALUES).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('snapshotFromSession', () => {
  it('coerces undefined session fields to null', () => {
    const s = snapshotFromSession({});
    expect(s).toEqual(empty);
  });

  it('passes set values through unchanged', () => {
    const s = snapshotFromSession({
      moodBefore: 2,
      moodAfter: 4,
      energyBefore: 3,
      energyAfter: 3,
    });
    expect(s).toEqual({
      moodBefore: 2,
      moodAfter: 4,
      energyBefore: 3,
      energyAfter: 3,
    });
  });
});

describe('moodDelta / energyDelta', () => {
  it('returns the post-minus-pre difference when both sides are set', () => {
    const s: WellbeingSnapshot = {
      moodBefore: 2,
      moodAfter: 4,
      energyBefore: 4,
      energyAfter: 3,
    };
    expect(moodDelta(s)).toBe(2);
    expect(energyDelta(s)).toBe(-1);
  });

  it('returns null when either side is missing', () => {
    expect(moodDelta({ ...empty, moodBefore: 3 })).toBeNull();
    expect(moodDelta({ ...empty, moodAfter: 4 })).toBeNull();
    expect(moodDelta(empty)).toBeNull();
  });

  it('returns 0 for an unchanged rating', () => {
    expect(moodDelta({ ...empty, moodBefore: 3, moodAfter: 3 })).toBe(0);
  });
});

describe('averageMoodLift / averageEnergyLift', () => {
  it('averages over only the snapshots with both sides recorded', () => {
    const xs: WellbeingSnapshot[] = [
      { moodBefore: 2, moodAfter: 4, energyBefore: null, energyAfter: null }, // +2
      { moodBefore: 3, moodAfter: 3, energyBefore: null, energyAfter: null }, // 0
      { moodBefore: 1, moodAfter: 4, energyBefore: null, energyAfter: null }, // +3
      { moodBefore: null, moodAfter: 5, energyBefore: null, energyAfter: null }, // skipped
    ];
    expect(averageMoodLift(xs)).toBeCloseTo((2 + 0 + 3) / 3);
  });

  it('returns null on an empty list', () => {
    expect(averageMoodLift([])).toBeNull();
    expect(averageEnergyLift([])).toBeNull();
  });

  it('returns null when no snapshot is complete', () => {
    const xs: WellbeingSnapshot[] = [
      { moodBefore: 3, moodAfter: null, energyBefore: 4, energyAfter: null },
      { moodBefore: null, moodAfter: 4, energyBefore: null, energyAfter: 3 },
    ];
    expect(averageMoodLift(xs)).toBeNull();
    expect(averageEnergyLift(xs)).toBeNull();
  });
});

describe('hasAnyRating', () => {
  it('is false for the empty snapshot', () => {
    expect(hasAnyRating(empty)).toBe(false);
  });

  it('is true when any single field is set', () => {
    expect(hasAnyRating({ ...empty, moodBefore: 1 })).toBe(true);
    expect(hasAnyRating({ ...empty, energyAfter: 5 })).toBe(true);
  });
});
