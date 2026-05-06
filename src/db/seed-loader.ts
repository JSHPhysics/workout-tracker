import type { Exercise, RoutineTemplate } from '../types';
import {
  STRONG_CURVES_EXERCISES,
  STRONG_CURVES_ROUTINES,
} from '../seed/strongCurves';
import { SEED_PROFILES } from '../seed/profiles';
import { db } from './db';

// On first boot (and on subsequent boots if seeds have changed), upsert
// the built-in profiles, exercise library, and routine templates into
// Dexie. Idempotent — safe to run on every app load.
//
// Strategy:
//   * Profiles are seeded only if missing — never overwrite the user's
//     edits to their own profile.
//   * Built-in exercises and routines are *replaced* on every load so
//     that bumping the seed (via `pnpm seed:build`) propagates without
//     leaving stale rows. User-created exercises (`isCustom: true`) and
//     custom routines (`isSeed: false`) are left alone.

const SEED_EPOCH = '2026-05-06T00:00:00.000Z';

export async function ensureSeedLoaded(): Promise<void> {
  await db.transaction(
    'rw',
    [db.profiles, db.exercises, db.routineTemplates],
    async () => {
      // 1. Profiles — additive only.
      const existingProfileIds = new Set(await db.profiles.toCollection().primaryKeys());
      const profilesToAdd = SEED_PROFILES.filter((p) => !existingProfileIds.has(p.id));
      if (profilesToAdd.length > 0) {
        await db.profiles.bulkAdd(profilesToAdd);
      }

      // 2. Exercises — replace seed rows, leave custom rows alone.
      await db.exercises.filter((e) => !e.isCustom).delete();
      const seededExercises: Exercise[] = STRONG_CURVES_EXERCISES.map((e) => ({
        ...e,
        isCustom: false,
        profileId: null,
      }));
      await db.exercises.bulkAdd(seededExercises);

      // 3. Routine templates — replace seed rows, leave custom routines alone.
      await db.routineTemplates.filter((r) => r.isSeed).delete();
      const seededRoutines: RoutineTemplate[] = STRONG_CURVES_ROUTINES.map((r) => ({
        ...r,
        profileId: null,
        createdAt: SEED_EPOCH,
        updatedAt: SEED_EPOCH,
      }));
      await db.routineTemplates.bulkAdd(seededRoutines);
    },
  );
}
