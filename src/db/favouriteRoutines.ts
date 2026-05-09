// Per-(profile, routine) favourite flags. Powers the ★ toggle on the
// Routines list and the favourites-first sort on the Today picker.
// Storage is one row per pair, keyed by `${profileId}-${routineId}`
// so put-as-upsert / single-key delete just work.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { FavouriteRoutine } from '../types';

function favouriteId(profileId: string, routineId: string): string {
  return `${profileId}-${routineId}`;
}

/** Live set of favourited routine ids for the active profile. Returns
 * `undefined` while loading. The Today picker / Routines list use
 * `Set.has()` for O(1) lookup when sorting + rendering. */
export function useFavouriteRoutineIds(
  profileId: string | null | undefined,
): Set<string> | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return new Set<string>();
    const rows = await db.favouriteRoutines.where({ profileId }).toArray();
    return new Set(rows.map((r) => r.routineId));
  }, [profileId]);
}

/** Add or remove a favourite. Idempotent — re-favouriting a row that's
 * already marked is a no-op. */
export async function toggleFavouriteRoutine(
  profileId: string,
  routineId: string,
  next: boolean,
): Promise<void> {
  const id = favouriteId(profileId, routineId);
  if (next) {
    const row: FavouriteRoutine = {
      id,
      profileId,
      routineId,
      createdAt: new Date().toISOString(),
    };
    await db.favouriteRoutines.put(row);
  } else {
    await db.favouriteRoutines.delete(id);
  }
}
