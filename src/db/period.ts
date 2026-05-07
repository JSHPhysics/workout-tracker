// Period log CRUD + hooks. Mirror of bodyweight.ts's shape.
//
// Privacy note: nothing here ever leaves the device — period entries
// live in the same local Dexie store as everything else. They're
// included in JSON backups (per the "user owns their data" backup
// policy in DECISIONS milestone 10) but never transmitted anywhere.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { cyclePhaseAt, type CycleSnapshot } from '../domain/cycle';
import type { PeriodLog } from '../types';

// --- CRUD ------------------------------------------------------------------

interface AddPeriodInput {
  profileId: string;
  /** YYYY-MM-DD in user's local date — first day of the period. */
  startDate: string;
  endDate?: string;
  notes?: string;
}

export async function addPeriodLog(input: AddPeriodInput): Promise<string> {
  const id = crypto.randomUUID();
  const log: PeriodLog = {
    id,
    profileId: input.profileId,
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(input.notes && input.notes.trim() !== ''
      ? { notes: input.notes.trim() }
      : {}),
  };
  await db.periodLogs.add(log);
  return id;
}

export async function updatePeriodLog(
  id: string,
  patch: { startDate?: string; endDate?: string | null; notes?: string | null },
): Promise<void> {
  // Same Partial<PeriodLog> escape hatch as updateRpe / updateNotes —
  // documented in DECISIONS milestone 7. Allows null → field deletion
  // under exactOptionalPropertyTypes.
  const cleaned: Partial<PeriodLog> = {};
  if (patch.startDate !== undefined) cleaned.startDate = patch.startDate;
  if (patch.endDate !== undefined) {
    (cleaned as { endDate?: string | undefined }).endDate =
      patch.endDate === null || patch.endDate === '' ? undefined : patch.endDate;
  }
  if (patch.notes !== undefined) {
    const trimmed = patch.notes?.trim() ?? '';
    (cleaned as { notes?: string | undefined }).notes =
      trimmed === '' ? undefined : trimmed;
  }
  await db.periodLogs.update(id, cleaned as Partial<PeriodLog>);
}

export async function deletePeriodLog(id: string): Promise<void> {
  await db.periodLogs.delete(id);
}

// --- Queries ---------------------------------------------------------------

/** All period logs for a profile, oldest first. */
export function usePeriodLogs(
  profileId: string | null,
): PeriodLog[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const all = await db.periodLogs.where({ profileId }).toArray();
    all.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return all;
  }, [profileId]);
}

/** Cycle snapshot for the given profile at "today" (local). Returns
 * `null` while logs are loading, when none exist, or when the user
 * has period tracking disabled (the caller is responsible for that
 * gate; this hook just returns based on log presence). */
export function useCyclePhaseToday(
  profileId: string | null,
): CycleSnapshot | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    const all = await db.periodLogs.where({ profileId }).toArray();
    if (all.length === 0) return null;
    const today = new Intl.DateTimeFormat('en-CA').format(new Date());
    return cyclePhaseAt(today, all);
  }, [profileId]);
}
