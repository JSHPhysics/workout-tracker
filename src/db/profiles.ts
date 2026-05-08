import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { SEED_BARBELLS, SEED_PLATE_INVENTORY } from '../seed/equipment';
import type {
  Barbell,
  EquipmentTag,
  PlateInventory,
  Profile,
  Sex,
  Theme,
} from '../types';

export async function listProfiles(): Promise<Profile[]> {
  return db.profiles.orderBy('name').toArray();
}

export function useProfiles(): Profile[] | undefined {
  return useLiveQuery(() => listProfiles(), []);
}

export function useProfile(id: string | null): Profile | null | undefined {
  // useLiveQuery returns undefined while loading, the value otherwise.
  // We coerce null id to a `null` synchronous result so consumers can
  // distinguish "no profile selected" from "still loading".
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.profiles.get(id)) ?? null;
  }, [id]);
}

export async function setUseBodyweightForVolume(
  profileId: string,
  enabled: boolean,
): Promise<void> {
  await db.profiles.update(profileId, { useBodyweightForVolume: enabled });
}

/** Replace the profile's equipment list. Caller is responsible for
 * ensuring `bodyweight` is always present (the picker filter treats
 * it as implicit, but persisting it makes the toggle UI read cleanly). */
export async function setProfileEquipment(
  profileId: string,
  equipment: EquipmentTag[],
): Promise<void> {
  await db.profiles.update(profileId, { equipment });
}

/** Per-profile opt-in for the period/cycle tracking surfaces. When
 * `false`, the Today chip / chart bands / PR Timeline phase chips
 * are hidden. Existing logs are preserved across toggles. */
export async function setPeriodTrackingEnabled(
  profileId: string,
  enabled: boolean,
): Promise<void> {
  await db.profiles.update(profileId, { periodTrackingEnabled: enabled });
}

/** Replace the warm-up generator percentages for the profile. The
 * generator pre-logs one warm-up set per entry, in the given order, at
 * `target * pct / 100` (snapped to 2.5 kg). We store the raw integer
 * percentages — the snap and the unit conversion happen at use-time. */
export async function setWarmupPercentages(
  profileId: string,
  percentages: number[],
): Promise<void> {
  await db.profiles.update(profileId, { warmupPercentages: percentages });
}

/** A sane "everything I might own" equipment list seeded for new
 * profiles. Trims down to "what I actually have" via Settings →
 * Available equipment. Bodyweight is implicit but persisted so the
 * picker filter reads cleanly. */
const NEW_PROFILE_EQUIPMENT: EquipmentTag[] = [
  'bodyweight',
  'barbell',
  'dumbbells',
  'bench',
  'pull-up-bar',
  'glute-bridge-pad',
  'yoga-mat',
  'foam-roller',
  'box',
];

interface CreateProfileInput {
  name: string;
  theme: Theme;
  /** Optional. Drives whether period tracking starts on and which
   * barbell is default. Independent of theme. */
  sex?: Sex;
}

/** Create a new profile with sex-driven defaults and seed its
 * equipment inventory in a single transaction. Returns the new
 * profile's id (a slug derived from the name; falls back to a UUID
 * if the slug would collide with an existing profile or be empty).
 *
 * What gets created:
 *   • The Profile row itself, with reasonable defaults.
 *   • One pair of barbells (Olympic 20 kg + Women's 15 kg). For
 *     `sex === 'female'` the 15 kg bar is the default; otherwise the
 *     Olympic is.
 *   • A standard plate inventory.
 *
 * Existing seed-loader equipment seeding logic was a per-boot
 * "seed if missing" loop — fine, but a freshly-created profile would
 * have to wait for the next boot before equipment showed up. Doing
 * it inline here means the profile is fully usable immediately. */
export async function createProfile(input: CreateProfileInput): Promise<string> {
  const trimmed = input.name.trim();
  if (trimmed === '') throw new Error('Profile name is required.');

  const id = await uniqueProfileId(trimmed);
  const womenBarDefault = input.sex === 'female';
  const profile: Profile = {
    id,
    name: trimmed,
    theme: input.theme,
    ...(input.sex ? { sex: input.sex } : {}),
    unitSystem: 'kg',
    useBodyweightForVolume: false,
    periodTrackingEnabled: input.sex === 'female',
    equipment: [...NEW_PROFILE_EQUIPMENT],
    warmupPercentages: [30, 45, 60],
    createdAt: new Date().toISOString(),
  };

  await db.transaction(
    'rw',
    [db.profiles, db.barbells, db.plateInventory],
    async () => {
      await db.profiles.add(profile);
      const bars: Barbell[] = SEED_BARBELLS.map((b) => ({
        id: crypto.randomUUID(),
        profileId: id,
        name: b.name,
        weight: b.weight,
        isDefault: womenBarDefault ? b.weight === 15 : b.isDefault,
      }));
      await db.barbells.bulkAdd(bars);
      const inv: PlateInventory = {
        id: crypto.randomUUID(),
        profileId: id,
        plates: [...SEED_PLATE_INVENTORY],
      };
      await db.plateInventory.add(inv);
    },
  );

  return id;
}

/** Convert a name to a URL-/CSS-safe id. We slug for readability —
 * "Sarah O'Connor" → "sarah-oconnor" — and append `-2` / `-3` / …
 * if a profile with that slug already exists. Empty / all-symbols
 * names fall back to a UUID so the unique-id contract holds. */
async function uniqueProfileId(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritic combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base === '') return crypto.randomUUID();
  let candidate = base;
  let suffix = 1;
  // Linear scan is fine — profile counts are tiny (a household).
  while ((await db.profiles.get(candidate)) !== undefined) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
