import type { Barbell, Exercise, PlateInventory, RoutineTemplate } from '../types';
import {
  STRONG_CURVES_EXERCISES,
  STRONG_CURVES_ROUTINES,
} from '../seed/strongCurves';
import { SEED_PROFILES } from '../seed/profiles';
import { SEED_BARBELLS, SEED_PLATE_INVENTORY } from '../seed/equipment';
import { db } from './db';

// On first boot (and on subsequent boots if seeds have changed), upsert
// the built-in profiles, exercise library, routine templates, and
// per-profile equipment defaults into Dexie. Idempotent — safe to run
// on every app load.
//
// Strategy:
//   * Profiles are seeded only if missing — never overwrite the user's
//     edits to their own profile.
//   * Built-in exercises and routines are *replaced* on every load so
//     that bumping the seed (via `pnpm seed:build`) propagates without
//     leaving stale rows. User-created exercises (`isCustom: true`) and
//     custom routines (`isSeed: false`) are left alone.
//   * Equipment (barbells + plate inventory) is additive only —
//     populated for any profile that currently has none, and untouched
//     thereafter so user adjustments stick.

const SEED_EPOCH = '2026-05-06T00:00:00.000Z';

export async function ensureSeedLoaded(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.exercises,
      db.routineTemplates,
      db.barbells,
      db.plateInventory,
    ],
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

      // 4. Equipment defaults — per profile, additive only.
      const allProfileIds = (await db.profiles.toCollection().primaryKeys()) as string[];
      for (const profileId of allProfileIds) {
        const hasBars = (await db.barbells.where({ profileId }).count()) > 0;
        if (!hasBars) {
          const seededBars: Barbell[] = SEED_BARBELLS.map((b) => ({
            id: crypto.randomUUID(),
            profileId,
            name: b.name,
            weight: b.weight,
            isDefault: b.isDefault,
          }));
          await db.barbells.bulkAdd(seededBars);
        }
        const hasInventory =
          (await db.plateInventory.where({ profileId }).count()) > 0;
        if (!hasInventory) {
          const inv: PlateInventory = {
            id: crypto.randomUUID(),
            profileId,
            plates: [...SEED_PLATE_INVENTORY],
          };
          await db.plateInventory.add(inv);
        }
      }
    },
  );
}
