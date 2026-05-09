import { describe, expect, it } from 'vitest';
import {
  SECONDARY_MUSCLE_WEIGHT,
  defaultMuscleWeights,
  sessionDurationMs,
  setVolume,
  totalVolume,
  volumeByMuscle,
} from './volume';
import type { MuscleWeights } from './volume';
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
    requiredEquipment: [],
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

  it('honours per-exercise overrides instead of the seeded apportionment', () => {
    // Squat: default = quads 100%, glutes 50%. Override flips it
    // entirely — pretend the user wants this lift to count 100% to
    // glutes and only 25% to quads.
    const squat = exercise('sq', ['quads'], ['glutes']);
    const overrides: ReadonlyMap<string, MuscleWeights> = new Map([
      ['sq', { glutes: 1.0, quads: 0.25 }],
    ]);
    const out = volumeByMuscle(
      [s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 })],
      new Map([['sq', squat]]),
      undefined,
      overrides,
    );
    // 100×5 = 500 total volume. glutes = 500, quads = 125.
    expect(out.get('glutes')).toBeCloseTo(500);
    expect(out.get('quads')).toBeCloseTo(125);
  });

  it('falls back to default apportionment for exercises NOT in the override map', () => {
    const squat = exercise('sq', ['quads'], ['glutes']);
    const dl = exercise('dl', ['hamstrings'], ['glutes', 'back']);
    const overrides: ReadonlyMap<string, MuscleWeights> = new Map([
      // Only override squat; deadlift uses defaults.
      ['sq', { glutes: 1.0 }],
    ]);
    const out = volumeByMuscle(
      [
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
        s({ id: 'b', exerciseId: 'dl', weight: 120, reps: 5 }),
      ],
      new Map([
        ['sq', squat],
        ['dl', dl],
      ]),
      undefined,
      overrides,
    );
    // squat 500 → glutes 500, quads 0 (override drops it)
    // dl   600 → hamstrings 600, glutes 300, back 300 (default)
    expect(out.get('glutes')).toBeCloseTo(800); // 500 + 300
    expect(out.get('hamstrings')).toBeCloseTo(600);
    expect(out.get('quads')).toBeUndefined();
    expect(out.get('back')).toBeCloseTo(300);
  });

  it('skips muscles whose override weight is zero', () => {
    const squat = exercise('sq', ['quads'], ['glutes']);
    const overrides: ReadonlyMap<string, MuscleWeights> = new Map([
      ['sq', { quads: 1.0, glutes: 0 }],
    ]);
    const out = volumeByMuscle(
      [s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 })],
      new Map([['sq', squat]]),
      undefined,
      overrides,
    );
    expect(out.get('quads')).toBeCloseTo(500);
    expect(out.get('glutes')).toBeUndefined();
  });
});

describe('defaultMuscleWeights', () => {
  it('builds a map from primary 1.0 + secondary 0.5', () => {
    const ex = exercise('sq', ['quads', 'glutes'], ['hamstrings', 'core']);
    const w = defaultMuscleWeights(ex);
    expect(w).toEqual({
      quads: 1.0,
      glutes: 1.0,
      hamstrings: 0.5,
      core: 0.5,
    });
  });

  it('keeps primary credit when a muscle is in both lists', () => {
    const ex = exercise('odd', ['glutes'], ['glutes']);
    expect(defaultMuscleWeights(ex)).toEqual({ glutes: 1.0 });
  });

  it('honours a custom secondaryWeight argument', () => {
    const ex = exercise('sq', ['quads'], ['glutes']);
    expect(defaultMuscleWeights(ex, 0.75)).toEqual({
      quads: 1.0,
      glutes: 0.75,
    });
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
