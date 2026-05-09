// Per-(profile, exercise) muscle volume overrides. Drives the
// optional path in `domain/volume.ts → volumeByMuscle()`. When the
// user has saved an override for an exercise, the chart uses it
// instead of the seeded primary/secondary tags.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { MuscleVolumeOverride } from '../types';
import type { MuscleWeights } from '../domain/volume';

function overrideId(profileId: string, exerciseId: string): string {
  return `${profileId}-${exerciseId}`;
}

/** All overrides for a profile, keyed by exerciseId for fast lookup
 * by the volume chart. Returns `undefined` while loading. */
export function useMuscleVolumeOverrides(
  profileId: string | null | undefined,
): ReadonlyMap<string, MuscleWeights> | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return new Map<string, MuscleWeights>();
    const rows = await db.muscleVolumeOverrides
      .where({ profileId })
      .toArray();
    const out = new Map<string, MuscleWeights>();
    for (const r of rows) {
      out.set(r.exerciseId, r.weights as MuscleWeights);
    }
    return out;
  }, [profileId]);
}

/** Save (or replace) the override for an exercise. */
export async function setMuscleVolumeOverride(
  profileId: string,
  exerciseId: string,
  weights: MuscleWeights,
): Promise<void> {
  const row: MuscleVolumeOverride = {
    id: overrideId(profileId, exerciseId),
    profileId,
    exerciseId,
    weights: weights as Record<string, number>,
    updatedAt: new Date().toISOString(),
  };
  await db.muscleVolumeOverrides.put(row);
}

/** Remove the override for an exercise. The chart falls back to
 * the seeded primary/secondary apportionment. */
export async function clearMuscleVolumeOverride(
  profileId: string,
  exerciseId: string,
): Promise<void> {
  await db.muscleVolumeOverrides.delete(overrideId(profileId, exerciseId));
}
