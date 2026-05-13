// Per-exercise rest-timer memory. The user adjusts the running timer
// via +/- 30s on the rest bar and the new total is saved here, keyed
// by (profileId, exerciseId). Next time the same exercise comes up
// (this session or any future session), the rest timer starts at the
// remembered value instead of the seed default.
//
// Storage: one row per (profile, exercise). Synthetic id derived from
// the pair so `db.exerciseRestPrefs.put(...)` is an upsert without a
// separate find-or-update step.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ExerciseRestPref } from '../types';

function prefId(profileId: string, exerciseId: string): string {
  return `${profileId}-${exerciseId}`;
}

/** Read the remembered rest seconds for a (profile, exercise) pair, or
 * `null` when nothing has been saved yet. Async, used outside React. */
export async function getPreferredRest(
  profileId: string,
  exerciseId: string,
): Promise<number | null> {
  const row = await db.exerciseRestPrefs.get(prefId(profileId, exerciseId));
  return row?.restSeconds ?? null;
}

/** Live-query variant for components. Returns `undefined` while
 * loading, `null` when no pref exists, or the saved seconds. */
export function useExerciseRestPref(
  profileId: string | null | undefined,
  exerciseId: string | null | undefined,
): number | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !exerciseId) return null;
    const row = await db.exerciseRestPrefs.get(prefId(profileId, exerciseId));
    return row?.restSeconds ?? null;
  }, [profileId, exerciseId]);
}

/** Upsert the remembered rest. Fired whenever the user adjusts the
 * running timer via +/- 30s. Idempotent. */
export async function setPreferredRest(
  profileId: string,
  exerciseId: string,
  restSeconds: number,
): Promise<void> {
  // Reject zero as well as negatives — a 0-second pref propagates
  // through `resolvedRestSeconds`' `??` chain (which only short-
  // circuits on null/undefined) and would silently disable the rest
  // timer for that exercise.
  if (!Number.isFinite(restSeconds) || restSeconds <= 0) return;
  const row: ExerciseRestPref = {
    id: prefId(profileId, exerciseId),
    profileId,
    exerciseId,
    restSeconds: Math.round(restSeconds),
    updatedAt: new Date().toISOString(),
  };
  await db.exerciseRestPrefs.put(row);
}

/** Clear the pref for a specific exercise — currently unused but
 * provided so a future "reset rest memory" action has a clean entry. */
export async function clearPreferredRest(
  profileId: string,
  exerciseId: string,
): Promise<void> {
  await db.exerciseRestPrefs.delete(prefId(profileId, exerciseId));
}

/** Wipe every saved per-exercise rest preference for a profile. Used
 * by Settings → Rest timer → "Reset rest memory" so a user can recover
 * from drift (e.g. accidental +/- 30s adjustments having quietly
 * rewired a bunch of exercises away from their default). Returns the
 * number of rows cleared so the caller can show "reset N exercises". */
export async function clearAllPreferredRest(
  profileId: string,
): Promise<number> {
  const rows = await db.exerciseRestPrefs
    .where({ profileId })
    .toArray();
  if (rows.length === 0) return 0;
  await db.exerciseRestPrefs.bulkDelete(rows.map((r) => r.id));
  return rows.length;
}
