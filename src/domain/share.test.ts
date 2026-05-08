import { describe, expect, it } from 'vitest';
import { formatWorkoutSummary, ordinal } from './share';
import type { Exercise, Session, SetLog } from '../types';

// --- Test fixtures ----------------------------------------------------

function bench(): Exercise {
  return {
    id: 'bench',
    name: 'Bench Press',
    category: 'push',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    measurementType: 'weight_reps',
    defaultRestSeconds: 90,
    perSide: false,
    usesBarbell: true,
    requiredEquipment: [],
    isCustom: false,
    profileId: null,
  };
}

function pullup(): Exercise {
  return {
    id: 'pullup',
    name: 'Pull-ups',
    category: 'pull',
    primaryMuscles: ['back'],
    secondaryMuscles: [],
    measurementType: 'bodyweight_reps',
    defaultRestSeconds: 90,
    perSide: false,
    usesBarbell: false,
    requiredEquipment: [],
    isCustom: false,
    profileId: null,
  };
}

function plank(): Exercise {
  return {
    id: 'plank',
    name: 'Plank',
    category: 'core',
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    measurementType: 'time_seconds',
    defaultRestSeconds: 60,
    perSide: false,
    usesBarbell: false,
    requiredEquipment: [],
    isCustom: false,
    profileId: null,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    profileId: 'p1',
    startedAt: '2026-05-08T08:00:00.000Z',
    completedAt: '2026-05-08T08:45:00.000Z',
    planName: 'Push Day A',
    prCount: 0,
    livePlan: [],
    ...overrides,
  };
}

function set(overrides: Partial<SetLog>): SetLog {
  return {
    id: crypto.randomUUID(),
    sessionId: 'sess-1',
    exerciseId: 'bench',
    blockOrder: 0,
    exerciseOrder: 0,
    setNumber: 1,
    setType: 'working',
    side: null,
    prTypes: [],
    completedAt: '2026-05-08T08:10:00.000Z',
    ...overrides,
  };
}

// --- Tests ------------------------------------------------------------

describe('formatWorkoutSummary', () => {
  it('formats a basic weight_reps session', () => {
    const out = formatWorkoutSummary({
      session: session({ prCount: 1 }),
      setLogs: [
        set({ setNumber: 1, weight: 60, reps: 8 }),
        set({ setNumber: 2, weight: 65, reps: 6, prTypes: ['weight'] }),
        set({ setNumber: 3, weight: 65, reps: 5 }),
      ],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    expect(out).toContain('Push Day A · 8 May 2026');
    expect(out).toContain('45 min');
    expect(out).toContain('1,195 kg volume'); // 60×8 + 65×6 + 65×5
    expect(out).toContain('1 PR ✨');
    expect(out).toContain('Bench Press: 60kg × 8, 65kg × 6 ✨, 65kg × 5');
  });

  it('skips warm-up sets entirely from the exercise summary', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        set({ setNumber: 1, setType: 'warmup', weight: 30, reps: 8 }),
        set({ setNumber: 2, setType: 'warmup', weight: 40, reps: 8 }),
        set({ setNumber: 3, weight: 60, reps: 8 }),
      ],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    expect(out).toContain('Bench Press: 60kg × 8');
    expect(out).not.toContain('30kg');
    expect(out).not.toContain('40kg');
    // Volume should also exclude warmups.
    expect(out).toContain('480 kg volume');
  });

  it('omits exercises that have no working sets logged', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        // Only warmups for bench — should be omitted entirely.
        set({ setNumber: 1, setType: 'warmup', weight: 30, reps: 8 }),
      ],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    expect(out).not.toContain('Bench Press');
  });

  it('formats bodyweight_reps without a weight number', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        set({
          exerciseId: 'pullup',
          setNumber: 1,
          reps: 8,
        }),
        set({
          exerciseId: 'pullup',
          setNumber: 2,
          reps: 7,
        }),
      ],
      exercises: new Map([['pullup', pullup()]]),
      unitSystem: 'kg',
    });
    expect(out).toContain('Pull-ups: × 8, × 7');
  });

  it('formats distance-type cardio with km + duration', () => {
    const run: Exercise = {
      id: 'running',
      name: 'Running',
      category: 'cardio',
      primaryMuscles: ['quads'],
      secondaryMuscles: [],
      measurementType: 'distance',
      defaultRestSeconds: 0,
      perSide: false,
      usesBarbell: false,
      requiredEquipment: [],
      isCustom: false,
      profileId: null,
    };
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        set({
          exerciseId: 'running',
          setNumber: 1,
          distance: 5000,
          durationSeconds: 1500,
        }),
      ],
      exercises: new Map([['running', run]]),
      unitSystem: 'kg',
    });
    // 5000 m → 5.0 km. 1500s → 25min. Volume row should be omitted —
    // weight×reps doesn't apply.
    expect(out).toContain('Running: 5.0 km / 25min');
    expect(out).not.toContain('volume');
  });

  it('formats time_seconds in mins+secs', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        set({
          exerciseId: 'plank',
          setNumber: 1,
          durationSeconds: 60,
        }),
        set({
          exerciseId: 'plank',
          setNumber: 2,
          durationSeconds: 90,
        }),
      ],
      exercises: new Map([['plank', plank()]]),
      unitSystem: 'kg',
    });
    expect(out).toContain('Plank: 60s, 90s');
  });

  it('groups sets by block + exercise position regardless of completion order', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [
        // Logged second exercise first (e.g. user jumped around).
        set({
          blockOrder: 1,
          exerciseOrder: 0,
          exerciseId: 'pullup',
          reps: 8,
          setNumber: 1,
        }),
        set({
          blockOrder: 0,
          exerciseOrder: 0,
          exerciseId: 'bench',
          weight: 60,
          reps: 8,
          setNumber: 1,
        }),
      ],
      exercises: new Map([
        ['bench', bench()],
        ['pullup', pullup()],
      ]),
      unitSystem: 'kg',
    });
    const benchIdx = out.indexOf('Bench Press');
    const pullupIdx = out.indexOf('Pull-ups');
    expect(benchIdx).toBeGreaterThan(-1);
    expect(pullupIdx).toBeGreaterThan(-1);
    expect(benchIdx).toBeLessThan(pullupIdx);
  });

  it('uses lb when the profile is on imperial', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [set({ weight: 135, reps: 5 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'lb',
    });
    expect(out).toContain('135lb × 5');
    expect(out).toContain('675 lb volume');
  });

  it('formats > 60min duration as h+m', () => {
    const out = formatWorkoutSummary({
      session: session({
        startedAt: '2026-05-08T08:00:00.000Z',
        completedAt: '2026-05-08T09:35:00.000Z',
      }),
      setLogs: [set({ weight: 60, reps: 8 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    expect(out).toContain('1h 35m');
  });

  it('omits stats line when nothing useful to say', () => {
    const out = formatWorkoutSummary({
      session: session({ completedAt: null, prCount: 0 }),
      setLogs: [],
      exercises: new Map(),
      unitSystem: 'kg',
    });
    // Header only — no second line.
    expect(out.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('appends footer when appUrl is provided', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [set({ weight: 60, reps: 8 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
      appUrl: 'https://example.com/workouts',
    });
    expect(out).toContain('Workout Tracker · https://example.com/workouts');
  });

  it('prepends "for the first time" headline when completionNumber is 1', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [set({ weight: 60, reps: 8 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
      completionNumber: 1,
    });
    const lines = out.split('\n');
    expect(lines[0]).toBe('Just completed Push Day A for the first time');
    // Date moves to its own line below the headline.
    expect(lines[1]).toBe('8 May 2026');
  });

  it('prepends ordinal headline when completionNumber > 1', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [set({ weight: 60, reps: 8 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
      completionNumber: 42,
    });
    const lines = out.split('\n');
    expect(lines[0]).toBe('Just completed my 42nd Push Day A');
    expect(lines[1]).toBe('8 May 2026');
  });

  it('falls back to existing terse header when completionNumber is null', () => {
    const out = formatWorkoutSummary({
      session: session(),
      setLogs: [set({ weight: 60, reps: 8 })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
      completionNumber: null,
    });
    const lines = out.split('\n');
    expect(lines[0]).toBe('Push Day A · 8 May 2026');
  });

  it('uses singular "PR" for one PR and plural "PRs" for many', () => {
    const single = formatWorkoutSummary({
      session: session({ prCount: 1 }),
      setLogs: [set({ weight: 60, reps: 8, prTypes: ['weight'] })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    const multi = formatWorkoutSummary({
      session: session({ prCount: 3 }),
      setLogs: [set({ weight: 60, reps: 8, prTypes: ['weight'] })],
      exercises: new Map([['bench', bench()]]),
      unitSystem: 'kg',
    });
    expect(single).toContain('1 PR ✨');
    expect(single).not.toContain('1 PRs');
    expect(multi).toContain('3 PRs ✨');
  });
});

describe('ordinal', () => {
  it('handles the basic 1/2/3 → st/nd/rd', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
  });
  it('uses "th" for 4 through 10', () => {
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(7)).toBe('7th');
    expect(ordinal(10)).toBe('10th');
  });
  it('treats 11/12/13 as exceptions ("th", not st/nd/rd)', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });
  it('handles the 21/22/23 family ("st"/"nd"/"rd" again)', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
    expect(ordinal(42)).toBe('42nd');
    expect(ordinal(101)).toBe('101st');
  });
  it('treats 111/112/113 as exceptions too', () => {
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(112)).toBe('112th');
    expect(ordinal(113)).toBe('113th');
  });
});
