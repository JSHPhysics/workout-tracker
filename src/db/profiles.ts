import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Profile } from '../types';

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
