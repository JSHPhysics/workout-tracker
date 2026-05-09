// Volume calculations — total kg·reps and per-muscle apportionment.
//
// SCOPE §6.11 calls for "Volume by muscle group — stacked area or bar
// chart, last 4w/12w/all. Aggregates SetLogs via the exercise's
// primary-muscles tagging (configurable: include secondary at 50%
// weight)." DECISIONS settled the secondary weighting at 0.5×.
//
// Working/AMRAP sets count toward volume. Drop and failure sets
// also count (the work happened) — only warmups are excluded.
// Bodyweight sets count their reps with weight=bodyweight when caller
// supplies it; otherwise reps-only entries contribute zero kg·reps.

import type { Exercise, MuscleGroup, SetLog } from '../types';

export const SECONDARY_MUSCLE_WEIGHT = 0.5;

/** Map of muscle → multiplier. 1.0 means "100% of this set's volume
 * goes to this muscle"; 0.5 is the conventional secondary-muscle
 * weight; values above 1.0 are valid but unusual.
 *
 * Used by per-exercise overrides — when the user wants this app's
 * apportionment to differ from the seeded primary/secondary tags. */
export type MuscleWeights = Partial<Record<MuscleGroup, number>>;

/** The default weighting derived from an exercise's primary +
 * secondary muscle tags. Used both as the starting point for the
 * editor UI and as the fallback when no override exists. */
export function defaultMuscleWeights(
  ex: Exercise,
  secondaryWeight: number = SECONDARY_MUSCLE_WEIGHT,
): MuscleWeights {
  const out: MuscleWeights = {};
  for (const m of ex.primaryMuscles) out[m] = 1.0;
  for (const m of ex.secondaryMuscles) {
    // If a muscle is in both lists somehow, primary wins (don't
    // demote it).
    if (out[m] === undefined) out[m] = secondaryWeight;
  }
  return out;
}

/** Return true when this set should contribute to volume aggregates. */
export function countsTowardVolume(s: SetLog): boolean {
  return s.setType !== 'warmup';
}

/** kg·reps contributed by a single set log. Returns 0 for sets that
 * lack the inputs (e.g. time-based, missing weight). */
export function setVolume(s: SetLog): number {
  if (!countsTowardVolume(s)) return 0;
  if (typeof s.weight !== 'number' || typeof s.reps !== 'number') return 0;
  if (s.weight <= 0 || s.reps <= 0) return 0;
  return s.weight * s.reps;
}

/** Total kg·reps across the input set logs. */
export function totalVolume(setLogs: readonly SetLog[]): number {
  let sum = 0;
  for (const s of setLogs) sum += setVolume(s);
  return sum;
}

/** Apportion the volume of each set across the exercise's muscles.
 * By default primary muscles get 100% credit and secondary muscles
 * get 50% (`secondaryWeight`).
 *
 * `overrides` lets the user pin a custom weighting per (exercise)
 * id — when an override exists, it replaces the primary/secondary
 * default for that exercise entirely. Lets users adjust the chart
 * without changing the exercise tags themselves. Pass undefined or
 * an empty map to keep the seeded behaviour. */
export function volumeByMuscle(
  setLogs: readonly SetLog[],
  exerciseMap: ReadonlyMap<string, Exercise>,
  secondaryWeight: number = SECONDARY_MUSCLE_WEIGHT,
  overrides?: ReadonlyMap<string, MuscleWeights>,
): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  for (const s of setLogs) {
    const v = setVolume(s);
    if (v === 0) continue;
    const ex = exerciseMap.get(s.exerciseId);
    if (!ex) continue;
    const override = overrides?.get(ex.id);
    if (override) {
      for (const [muscle, weight] of Object.entries(override)) {
        if (typeof weight !== 'number' || weight === 0) continue;
        const m = muscle as MuscleGroup;
        out.set(m, (out.get(m) ?? 0) + v * weight);
      }
    } else {
      for (const m of ex.primaryMuscles) {
        out.set(m, (out.get(m) ?? 0) + v);
      }
      for (const m of ex.secondaryMuscles) {
        out.set(m, (out.get(m) ?? 0) + v * secondaryWeight);
      }
    }
  }
  return out;
}

/** Total session duration in milliseconds — `null` for in-progress
 * sessions. Used for lifetime training-time stats. */
export function sessionDurationMs(
  startedAt: string,
  completedAt: string | null,
): number | null {
  if (!completedAt) return null;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return ms > 0 ? ms : null;
}
