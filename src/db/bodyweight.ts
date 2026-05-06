import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { BodyweightLog } from '../types';

interface UpsertInput {
  profileId: string;
  /** YYYY-MM-DD in user's local date. */
  date: string;
  weight: number;
  notes?: string;
}

/** One entry per profile per local date. Re-logging the same day
 * overwrites the existing row (a single bodyweight per day matches how
 * users mentally think about it — "Tuesday's weigh-in"). */
export async function upsertBodyweight(input: UpsertInput): Promise<string> {
  const existing = await db.bodyweightLogs
    .where('[profileId+date]')
    .equals([input.profileId, input.date])
    .first();
  if (existing) {
    // `notes: undefined` deletes the field — see DECISIONS milestone 7
    // for why the cast is necessary under exactOptionalPropertyTypes.
    const patch: Partial<BodyweightLog> = { weight: input.weight };
    if (input.notes !== undefined) {
      const trimmed = input.notes.trim();
      (patch as { notes: string | undefined }).notes =
        trimmed === '' ? undefined : trimmed;
    }
    await db.bodyweightLogs.update(existing.id, patch as Partial<BodyweightLog>);
    return existing.id;
  }
  const id = crypto.randomUUID();
  const log: BodyweightLog = {
    id,
    profileId: input.profileId,
    date: input.date,
    weight: input.weight,
    ...(input.notes !== undefined && input.notes.trim() !== ''
      ? { notes: input.notes.trim() }
      : {}),
  };
  await db.bodyweightLogs.add(log);
  return id;
}

export async function deleteBodyweight(id: string): Promise<void> {
  await db.bodyweightLogs.delete(id);
}

/** All bodyweight entries for a profile, oldest first. */
export function useBodyweightLogs(
  profileId: string | null,
): BodyweightLog[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const all = await db.bodyweightLogs.where({ profileId }).toArray();
    all.sort((a, b) => a.date.localeCompare(b.date));
    return all;
  }, [profileId]);
}

/** Most recent bodyweight on or before the given local date. Used by
 * the bodyweight-exercise volume toggle when logging push-ups & co. */
export async function latestBodyweightOnOrBefore(
  profileId: string,
  date: string,
): Promise<BodyweightLog | null> {
  const all = await db.bodyweightLogs.where({ profileId }).toArray();
  let best: BodyweightLog | null = null;
  for (const l of all) {
    if (l.date > date) continue;
    if (!best || l.date > best.date) best = l;
  }
  return best;
}

/** Live hook around the most recent entry for a profile. Updates as
 * new weigh-ins land. */
export function useLatestBodyweight(
  profileId: string | null,
): BodyweightLog | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    const all = await db.bodyweightLogs.where({ profileId }).toArray();
    if (all.length === 0) return null;
    all.sort((a, b) => b.date.localeCompare(a.date));
    return all[0] ?? null;
  }, [profileId]);
}
