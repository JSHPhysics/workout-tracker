import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { EquipmentTag, Profile } from '../types';

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
