import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Barbell, PlateInventory, PlateInventoryEntry } from '../types';

// --- Barbells --------------------------------------------------------------

export async function listBarbells(profileId: string): Promise<Barbell[]> {
  const all = await db.barbells.where({ profileId }).toArray();
  return all.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.weight - a.weight;
  });
}

export async function addBarbell(input: {
  profileId: string;
  name: string;
  weight: number;
  isDefault?: boolean;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.transaction('rw', db.barbells, async () => {
    if (input.isDefault) {
      await db.barbells
        .where({ profileId: input.profileId })
        .modify({ isDefault: false });
    }
    await db.barbells.add({
      id,
      profileId: input.profileId,
      name: input.name,
      weight: input.weight,
      isDefault: !!input.isDefault,
    });
  });
  return id;
}

export async function updateBarbell(
  id: string,
  patch: Partial<Pick<Barbell, 'name' | 'weight'>>,
): Promise<void> {
  await db.barbells.update(id, patch);
}

export async function setDefaultBarbell(id: string): Promise<void> {
  await db.transaction('rw', db.barbells, async () => {
    const target = await db.barbells.get(id);
    if (!target) return;
    await db.barbells
      .where({ profileId: target.profileId })
      .modify({ isDefault: false });
    await db.barbells.update(id, { isDefault: true });
  });
}

export async function deleteBarbell(id: string): Promise<void> {
  await db.transaction('rw', db.barbells, async () => {
    const target = await db.barbells.get(id);
    if (!target) return;
    await db.barbells.delete(id);
    // If we just deleted the default, promote the heaviest remaining.
    if (target.isDefault) {
      const rest = await db.barbells
        .where({ profileId: target.profileId })
        .toArray();
      if (rest.length > 0) {
        rest.sort((a, b) => b.weight - a.weight);
        await db.barbells.update(rest[0]!.id, { isDefault: true });
      }
    }
  });
}

export function useBarbells(profileId: string | null | undefined): Barbell[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    return listBarbells(profileId);
  }, [profileId]);
}

export function useDefaultBarbell(
  profileId: string | null | undefined,
): Barbell | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    const bars = await listBarbells(profileId);
    return bars.find((b) => b.isDefault) ?? bars[0] ?? null;
  }, [profileId]);
}

// --- Plate inventory -------------------------------------------------------

export async function getPlateInventory(
  profileId: string,
): Promise<PlateInventory | null> {
  return (
    (await db.plateInventory.where({ profileId }).first()) ?? null
  );
}

export async function setPlatesForProfile(
  profileId: string,
  plates: PlateInventoryEntry[],
): Promise<void> {
  // One inventory row per profile — upsert.
  const existing = await getPlateInventory(profileId);
  // Defensive: never persist zero-count entries; sort desc by weight so
  // downstream consumers can rely on canonical order.
  const cleaned = plates
    .filter((p) => p.weight > 0 && p.count > 0)
    .sort((a, b) => b.weight - a.weight);
  if (existing) {
    await db.plateInventory.update(existing.id, { plates: cleaned });
  } else {
    await db.plateInventory.add({
      id: crypto.randomUUID(),
      profileId,
      plates: cleaned,
    });
  }
}

export function usePlateInventory(
  profileId: string | null | undefined,
): PlateInventory | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    return getPlateInventory(profileId);
  }, [profileId]);
}
