import { describe, expect, it } from 'vitest';
import {
  baselinesFromHistory,
  detectPRs,
  type PriorBaselines,
} from './pr-detection';
import type { SetLog } from '../types';

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

const noPrior = new Map<string, PriorBaselines>();

describe('detectPRs', () => {
  it('skips warmup, drop and failure sets', () => {
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'sq', setType: 'warmup', weight: 60, reps: 5 }),
        s({ id: 'b', exerciseId: 'sq', setType: 'drop', weight: 80, reps: 8 }),
        s({ id: 'c', exerciseId: 'sq', setType: 'failure', weight: 100, reps: 3 }),
      ],
      priorByExercise: noPrior,
    });
    expect(awards).toEqual([]);
  });

  it('awards weight + e1rm + session_volume on a fresh exercise', () => {
    const awards = detectPRs({
      setLogs: [s({ id: 'x', exerciseId: 'sq', weight: 100, reps: 5 })],
      priorByExercise: noPrior,
    });
    const types = awards.map((a) => a.type).sort();
    expect(types).toEqual(['e1rm', 'session_volume', 'weight']);
    // No reps_at_weight PR — never lifted 100 kg before, so the weight
    // PR already covers it.
    expect(awards.find((a) => a.type === 'reps_at_weight')).toBeUndefined();
  });

  it('awards reps_at_weight only when the weight has been lifted before', () => {
    const prior = new Map<string, PriorBaselines>([
      [
        'bp',
        {
          bestWeight: 100,
          bestE1RM: 100 * (1 + 4 / 30),
          bestRepsByWeight: new Map([[100, 4]]),
          bestSessionVolume: 400,
        },
      ],
    ]);
    const awards = detectPRs({
      setLogs: [s({ id: 'x', exerciseId: 'bp', weight: 100, reps: 5 })],
      priorByExercise: prior,
    });
    const types = awards.map((a) => a.type).sort();
    // Same weight (no weight PR), more reps at it (reps_at_weight),
    // higher e1rm, higher session volume.
    expect(types).toEqual(['e1rm', 'reps_at_weight', 'session_volume']);
  });

  it('detects multiple weight PRs in a single ascending session', () => {
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'dl', weight: 100, reps: 5, setNumber: 1 }),
        s({ id: 'b', exerciseId: 'dl', weight: 110, reps: 5, setNumber: 2 }),
        s({ id: 'c', exerciseId: 'dl', weight: 120, reps: 3, setNumber: 3 }),
      ],
      priorByExercise: noPrior,
    });
    const weightPRs = awards.filter((a) => a.type === 'weight');
    expect(weightPRs.map((a) => a.setLogId)).toEqual(['a', 'b', 'c']);
    expect(weightPRs.map((a) => a.value)).toEqual([100, 110, 120]);
  });

  it('does not award when prior bests dominate', () => {
    const prior = new Map<string, PriorBaselines>([
      [
        'sq',
        {
          bestWeight: 150,
          bestE1RM: 200,
          bestRepsByWeight: new Map([
            [100, 10],
            [150, 5],
          ]),
          bestSessionVolume: 5000,
        },
      ],
    ]);
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
        s({ id: 'b', exerciseId: 'sq', weight: 120, reps: 4 }),
      ],
      priorByExercise: prior,
    });
    expect(awards).toEqual([]);
  });

  it('attaches session_volume award to the heaviest qualifying set', () => {
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'sq', weight: 80, reps: 8, setNumber: 1 }),
        s({ id: 'b', exerciseId: 'sq', weight: 100, reps: 5, setNumber: 2 }),
        s({ id: 'c', exerciseId: 'sq', weight: 80, reps: 8, setNumber: 3 }),
      ],
      priorByExercise: noPrior,
    });
    const volume = awards.find((a) => a.type === 'session_volume');
    expect(volume).toBeDefined();
    expect(volume!.setLogId).toBe('b'); // heaviest set in the group
    expect(volume!.value).toBeCloseTo(80 * 8 + 100 * 5 + 80 * 8);
  });

  it('respects the input order — caller is responsible for chronology', () => {
    // Documents the contract: detectPRs walks the list as given. The
    // sessions DB layer sorts by [blockOrder, exerciseOrder, setNumber]
    // before calling — see DECISIONS.md milestone 7. If a caller passes
    // the heaviest set first, intermediate weight PRs are absorbed.
    const awards = detectPRs({
      setLogs: [
        s({ id: 'c', exerciseId: 'sq', weight: 120, reps: 3, setNumber: 3 }),
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5, setNumber: 1 }),
        s({ id: 'b', exerciseId: 'sq', weight: 110, reps: 5, setNumber: 2 }),
      ],
      priorByExercise: noPrior,
    });
    const weightPRs = awards.filter((a) => a.type === 'weight');
    expect(weightPRs.map((a) => a.value)).toEqual([120]);
  });

  it('handles two exercises in the same session independently', () => {
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
        s({ id: 'b', exerciseId: 'bp', weight: 60, reps: 5 }),
      ],
      priorByExercise: noPrior,
    });
    const exercises = new Set(awards.map((a) => a.exerciseId));
    expect(exercises).toEqual(new Set(['sq', 'bp']));
  });

  it('ignores zero/missing weight or reps', () => {
    const awards = detectPRs({
      setLogs: [
        s({ id: 'a', exerciseId: 'sq', weight: 0, reps: 5 }),
        s({ id: 'b', exerciseId: 'sq', reps: 5 }), // no weight (bodyweight)
        s({ id: 'c', exerciseId: 'sq', weight: 100 }), // no reps (time-based)
      ],
      priorByExercise: noPrior,
    });
    expect(awards).toEqual([]);
  });
});

describe('baselinesFromHistory', () => {
  it('rolls up bests across qualifying history', () => {
    const history: SetLog[] = [
      s({ id: 'a', exerciseId: 'sq', weight: 100, reps: 5 }),
      s({ id: 'b', exerciseId: 'sq', weight: 100, reps: 7 }),
      s({ id: 'c', exerciseId: 'sq', weight: 110, reps: 3 }),
      s({ id: 'd', exerciseId: 'sq', weight: 60, reps: 5, setType: 'warmup' }),
    ];
    const b = baselinesFromHistory(history, [500, 700, 600]);
    expect(b.bestWeight).toBe(110);
    expect(b.bestRepsByWeight.get(100)).toBe(7);
    expect(b.bestRepsByWeight.get(110)).toBe(3);
    expect(b.bestRepsByWeight.has(60)).toBe(false); // warmup ignored
    expect(b.bestSessionVolume).toBe(700);
    // 100 × (1 + 7/30) = 123.333… beats 110 × (1 + 3/30) = 121.
    expect(b.bestE1RM).toBeCloseTo(123.3333, 3);
  });

  it('returns nulls for an empty history', () => {
    const b = baselinesFromHistory([], []);
    expect(b.bestWeight).toBeNull();
    expect(b.bestE1RM).toBeNull();
    expect(b.bestSessionVolume).toBeNull();
    expect(b.bestRepsByWeight.size).toBe(0);
  });
});
