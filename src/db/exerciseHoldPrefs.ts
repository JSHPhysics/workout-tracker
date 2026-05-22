// Per-exercise hold-timer memory. The user starts a hold for a
// time-based exercise (stretch, plank, dead hang) from the set row and
// can +/- 30s the running hold; the chosen length is saved here, keyed
// by (profileId, exerciseId). Next time the same exercise comes up the
// duration stepper + hold timer start at the remembered value.
//
// Deliberately separate from `exerciseRestPrefs`: a hold's length and
// the after-set rest are different concepts. Sharing one table would
// mean adjusting a stretch hold silently rewrites that exercise's rest
// timer — exactly the per-exercise rest "drift" class of bug.
//
// Storage: one row per (profile, exercise). Synthetic id derived from
// the pair so `db.exerciseHoldPrefs.put(...)` is an upsert without a
// separate find-or-update step.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ExerciseHoldPref } from '../types';

function prefId(profileId: string, exerciseId: string): string {
  return `${profileId}-${exerciseId}`;
}

/** Read the remembered hold seconds for a (profile, exercise) pair, or
 * `null` when nothing has been saved yet. Async, used outside React. */
export async function getPreferredHold(
  profileId: string,
  exerciseId: string,
): Promise<number | null> {
  const row = await db.exerciseHoldPrefs.get(prefId(profileId, exerciseId));
  return row?.holdSeconds ?? null;
}

/** Live-query variant for components. Returns `undefined` while
 * loading, `null` when no pref exists, or the saved seconds. */
export function useExerciseHoldPref(
  profileId: string | null | undefined,
  exerciseId: string | null | undefined,
): number | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !exerciseId) return null;
    const row = await db.exerciseHoldPrefs.get(prefId(profileId, exerciseId));
    return row?.holdSeconds ?? null;
  }, [profileId, exerciseId]);
}

/** Upsert the remembered hold. Fired when the user starts a hold and
 * whenever they adjust the running hold via +/- 30s. Idempotent. */
export async function setPreferredHold(
  profileId: string,
  exerciseId: string,
  holdSeconds: number,
): Promise<void> {
  // Reject zero/negatives — a non-positive hold would propagate through
  // the duration-default chain (which short-circuits on null/undefined)
  // and isn't a meaningful hold length.
  if (!Number.isFinite(holdSeconds) || holdSeconds <= 0) return;
  const row: ExerciseHoldPref = {
    id: prefId(profileId, exerciseId),
    profileId,
    exerciseId,
    holdSeconds: Math.round(holdSeconds),
    updatedAt: new Date().toISOString(),
  };
  await db.exerciseHoldPrefs.put(row);
}

/** Clear the pref for a specific exercise. Currently unused — provided
 * so a future "reset hold memory" action has a clean entry. */
export async function clearPreferredHold(
  profileId: string,
  exerciseId: string,
): Promise<void> {
  await db.exerciseHoldPrefs.delete(prefId(profileId, exerciseId));
}

/** Wipe every saved per-exercise hold preference for a profile. Mirrors
 * `clearAllPreferredRest` so a future Settings action can let a user
 * recover from drift. Returns the number of rows cleared. */
export async function clearAllPreferredHold(
  profileId: string,
): Promise<number> {
  const rows = await db.exerciseHoldPrefs.where({ profileId }).toArray();
  if (rows.length === 0) return 0;
  await db.exerciseHoldPrefs.bulkDelete(rows.map((r) => r.id));
  return rows.length;
}
