import { describe, expect, it } from 'vitest';
import {
  SECONDARY_MUSCLE_WEIGHT,
  sessionDurationMs,
  setVolume,
  totalVolume,
  volumeByMuscle,
} from './volume';
import type { Exercise, MuscleGroup, SetLog } from '../types';

function s(partial: Partial<SetLog> & Pick<SetLog, 'id' | 'exerciseId'>): SetLog {
  return {
    sessionId: 'sess',
    blockOrder: 0,
    exerciseOrder: 0,
    setNumber: 1,
    setType: 'working',
    side: null,
    prTypes: [],
    completedAt: '2026-05-06T10:00:00.000Z',
    ...partial,
  };
}

function exercise(
  id: string,
  primary: MuscleGroup[],
  secondary: MuscleGroup[] = [],
): Exercise {
  return {
    id,
    name: id,
    category: 'glute',
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    measurementType: 'weight_reps',
    defaultRestSeconds: 90,
    perSide: false,
    usesBarbell: true,
    isCustom: false,
    profileId: null,
  };
}

describe('setVolume', () => {
  it('returns weight × reps for working sets', () => {
    expect(setVolume(s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }))).toBe(500);
  });

  it('counts drop and failure sets', () => {
    expect(setVolume(s({ id: 'a', exerciseId: 'sq', weight: 80, reps: 8, setType: 'drop' }))).toBe(640);
    expect(setVolume(s({ id: 'b', exerciseId: 'sq', weight: 80, reps: 3, setType: 'failure' }))).toBe(240);
  });

  it('counts AMRAP sets', () => {
    expect(setVolume(s({ id: 'a', exerciseId: 'sq', weight: 60, reps: 12, setType: 'amrap' }))).toBe(720);
  });

  it('excludes warmups', () => {
    expect(setVolume(s({ id: 'a', exerciseId: 'sq', weight: 60, reps: 5, setType: 'warmup' }))).toBe(0);
  });

  it('returns 0 when weight or reps are missing', () => {
    expect(setVolume(s({ id: 'a', exerciseId: 'sq', reps: 5 }))).toBe(0);
    expect(setVolume(s({ id: 'b', exerciseId: 'sq', weight: 100 }))).toBe(0);
    expect(setVolume(s({ id: 'c', exerciseId: 'sq' }))).toBe(0);
  });
});

describe('totalVolume', () => {
  it('sums setVolume across the input', () => {
    expect(
      totalVolume([
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
        s({ id: 'b', exerciseId: 'sq', weight: 60, reps: 5, setType: 'warmup' }),
        s({ id: 'c', exerciseId: 'bp', weight: 60, reps: 10 }),
      ]),
    ).toBe(500 + 0 + 600);
  });
});

describe('volumeByMuscle', () => {
  it('apportions primary at 100%, secondary at 50%', () => {
    const exMap = new Map<string, Exercise>([
      ['sq', exercise('sq', ['quads'], ['glutes'])],
    ]);
    const out = volumeByMuscle(
      [s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 })],
      exMap,
    );
    expect(out.get('quads')).toBe(500);
    expect(out.get('glutes')).toBe(250);
  });

  it('sums contributions across multiple exercises and sets', () => {
    const exMap = new Map<string, Exercise>([
      ['sq', exercise('sq', ['quads'], ['glutes'])],
      ['hth', exercise('hth', ['glutes'], ['hamstrings'])],
    ]);
    const out = volumeByMuscle(
      [
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
        s({ id: 'b', exerciseId: 'hth', weight: 80, reps: 8 }),
      ],
      exMap,
    );
    expect(out.get('quads')).toBe(500);
    // glutes: 500 × 0.5 (secondary on sq) + 640 × 1.0 (primary on hth)
    expect(out.get('glutes')).toBe(250 + 640);
    expect(out.get('hamstrings')).toBe(320);
  });

  it('respects a custom secondary weight', () => {
    const exMap = new Map<string, Exercise>([
      ['sq', exercise('sq', ['quads'], ['glutes'])],
    ]);
    const out = volumeByMuscle(
      [s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 })],
      exMap,
      0.33,
    );
    expect(out.get('glutes')).toBeCloseTo(165);
  });

  it('skips set logs whose exercise is missing from the map', () => {
    const out = volumeByMuscle(
      [s({ id: 'a', exerciseId: 'unknown', weight: 100, reps: 5 })],
      new Map(),
    );
    expect(out.size).toBe(0);
  });

  it('exposes the default secondary weight as 0.5', () => {
    expect(SECONDARY_MUSCLE_WEIGHT).toBe(0.5);
  });
});

describe('sessionDurationMs', () => {
  it('returns ms between start and completion', () => {
    expect(
      sessionDurationMs(
        '2026-05-06T10:00:00.000Z',
        '2026-05-06T11:30:00.000Z',
      ),
    ).toBe(90 * 60_000);
  });

  it('returns null for an open session', () => {
    expect(sessionDurationMs('2026-05-06T10:00:00.000Z', null)).toBeNull();
  });

  it('returns null when end is before start', () => {
    expect(
      sessionDurationMs(
        '2026-05-06T11:00:00.000Z',
        '2026-05-06T10:00:00.000Z',
      ),
    ).toBeNull();
  });
});
