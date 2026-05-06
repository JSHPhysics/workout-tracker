// PR detection — pure domain. Inputs are the new set logs from a just-
// finished session plus the per-exercise history from before that
// session. Output describes the PRs each new set unlocked, plus a
// per-exercise session_volume award (one per exercise per session).
//
// SCOPE.md §7.7 — only `working` and `amrap` sets count toward PRs.
// Warmups, drop sets and failure sets are excluded. Time-based and
// bodyweight (no-load) entries don't have a numeric "weight" axis so
// they don't qualify for the strength PR types here either.

import type { PRType, SetLog } from '../types';
import { epleyE1RM } from './e1rm';

export interface PriorBaselines {
  /** Heaviest weight ever lifted on this exercise (any rep count). */
  bestWeight: number | null;
  /** Best e1RM (kg). */
  bestE1RM: number | null;
  /** Best (max) reps achieved at each weight, weight → reps. Only
   * populated for weights matched exactly (no rounding) — straightforward
   * "I just did 5 at 100 kg, my previous best at 100 kg was 4" comparisons. */
  bestRepsByWeight: ReadonlyMap<number, number>;
  /** Best per-exercise total volume (sum of weight × reps) in any
   * single previous session. */
  bestSessionVolume: number | null;
}

export interface PRAward {
  setLogId: string;
  exerciseId: string;
  type: PRType;
  /** Numeric value the PR is for. weight=kg lifted, reps_at_weight=reps,
   * e1rm=kg, session_volume=kg·reps total. */
  value: number;
}

export interface DetectionInput {
  setLogs: readonly SetLog[];
  /** Map of exercise id → that exercise's prior baselines. Missing
   * entries are treated as a fresh slate (every qualifying lift is a PR). */
  priorByExercise: ReadonlyMap<string, PriorBaselines>;
}

const EPS = 0.0001;

function qualifies(s: SetLog): boolean {
  if (s.setType !== 'working' && s.setType !== 'amrap') return false;
  if (typeof s.weight !== 'number' || s.weight <= 0) return false;
  if (typeof s.reps !== 'number' || s.reps <= 0) return false;
  return true;
}

/** Run PR detection over a session's new logs. Returns one award per
 * (setLogId, type) achievement plus session-volume awards keyed off
 * the heaviest qualifying set per exercise (so the PR badge surfaces
 * somewhere visible). */
export function detectPRs(input: DetectionInput): PRAward[] {
  const awards: PRAward[] = [];

  // Group qualifying sets by exercise, preserving completion order.
  const byExercise = new Map<string, SetLog[]>();
  for (const s of input.setLogs) {
    if (!qualifies(s)) continue;
    const arr = byExercise.get(s.exerciseId) ?? [];
    arr.push(s);
    byExercise.set(s.exerciseId, arr);
  }

  for (const [exerciseId, sets] of byExercise) {
    const prior = input.priorByExercise.get(exerciseId) ?? {
      bestWeight: null,
      bestE1RM: null,
      bestRepsByWeight: new Map<number, number>(),
      bestSessionVolume: null,
    };

    // Track running bests within this session so back-to-back PRs all
    // surface — e.g. 100×5 then 110×5 should award two weight PRs.
    let runWeight = prior.bestWeight ?? -Infinity;
    let runE1RM = prior.bestE1RM ?? -Infinity;
    const runRepsAtWeight = new Map(prior.bestRepsByWeight);
    let sessionVolume = 0;
    let heaviestSet: SetLog | null = null;
    let heaviestKey = -Infinity;

    for (const s of sets) {
      const w = s.weight!;
      const r = s.reps!;
      sessionVolume += w * r;
      // Track the "headline" set for the session-volume award. Weight is
      // the dominant axis; ties broken by reps then completion order.
      const key = w * 1000 + r;
      if (key > heaviestKey) {
        heaviestKey = key;
        heaviestSet = s;
      }

      if (w > runWeight + EPS) {
        awards.push({ setLogId: s.id, exerciseId, type: 'weight', value: w });
        runWeight = w;
      }

      const priorRepsHere = runRepsAtWeight.get(w) ?? 0;
      if (r > priorRepsHere) {
        // Only call it a "reps at weight" PR when the user has lifted
        // this exact weight before — otherwise it's just a new lift,
        // which the weight PR already covers.
        if (priorRepsHere > 0) {
          awards.push({
            setLogId: s.id,
            exerciseId,
            type: 'reps_at_weight',
            value: r,
          });
        }
        runRepsAtWeight.set(w, r);
      }

      const e1 = epleyE1RM(w, r);
      if (e1 !== null && e1 > runE1RM + EPS) {
        awards.push({ setLogId: s.id, exerciseId, type: 'e1rm', value: e1 });
        runE1RM = e1;
      }
    }

    if (
      heaviestSet &&
      sessionVolume > 0 &&
      sessionVolume > (prior.bestSessionVolume ?? 0) + EPS
    ) {
      awards.push({
        setLogId: heaviestSet.id,
        exerciseId,
        type: 'session_volume',
        value: sessionVolume,
      });
    }
  }

  return awards;
}

/** Build PriorBaselines for a single exercise from its full historical
 * set-log + per-session-volume rollup. Pure helper — db layer wires it. */
export function baselinesFromHistory(
  history: readonly SetLog[],
  sessionVolumes: readonly number[],
): PriorBaselines {
  let bestWeight: number | null = null;
  let bestE1RM: number | null = null;
  const bestRepsByWeight = new Map<number, number>();

  for (const s of history) {
    if (!qualifies(s)) continue;
    const w = s.weight!;
    const r = s.reps!;
    if (bestWeight === null || w > bestWeight) bestWeight = w;
    const e1 = epleyE1RM(w, r);
    if (e1 !== null && (bestE1RM === null || e1 > bestE1RM)) bestE1RM = e1;
    const prev = bestRepsByWeight.get(w) ?? 0;
    if (r > prev) bestRepsByWeight.set(w, r);
  }

  let bestSessionVolume: number | null = null;
  for (const v of sessionVolumes) {
    if (bestSessionVolume === null || v > bestSessionVolume) bestSessionVolume = v;
  }

  return { bestWeight, bestE1RM, bestRepsByWeight, bestSessionVolume };
}
