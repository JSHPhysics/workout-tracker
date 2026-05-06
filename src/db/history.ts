// Read-side query helpers for History + Progress screens. All hooks
// here scope to a profileId; pass `null` to short-circuit during
// profile-switching.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { totalVolume } from '../domain/volume';
import type { PRRecord, Session, SetLog } from '../types';

export interface SessionSummary {
  session: Session;
  totalVolume: number;
  prCount: number;
  setLogCount: number;
  /** Sorted set logs (chronological by completedAt). Useful when the
   * caller wants to render set-level detail without a second fetch. */
  setLogs: SetLog[];
}

/** All completed sessions for a profile, newest first, with cached
 * roll-ups (volume, PR count, set count, raw set logs). */
export function useProfileSessionSummaries(
  profileId: string | null,
): SessionSummary[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const sessions = await db.sessions
      .where('[profileId+startedAt]')
      .between([profileId, ''], [profileId, '￿'])
      .reverse()
      .toArray();
    const logsBySession = await groupSetLogsBy(
      sessions.map((s) => s.id),
    );
    return sessions.map((session) => {
      const logs = logsBySession.get(session.id) ?? [];
      logs.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
      return {
        session,
        totalVolume: totalVolume(logs),
        prCount: session.prCount,
        setLogCount: logs.length,
        setLogs: logs,
      };
    });
  }, [profileId]);
}

/** All set logs for the given session ids, grouped. */
async function groupSetLogsBy(
  sessionIds: readonly string[],
): Promise<Map<string, SetLog[]>> {
  const out = new Map<string, SetLog[]>();
  if (sessionIds.length === 0) return out;
  const logs = await db.setLogs
    .where('sessionId')
    .anyOf([...sessionIds])
    .toArray();
  for (const l of logs) {
    const arr = out.get(l.sessionId) ?? [];
    arr.push(l);
    out.set(l.sessionId, arr);
  }
  return out;
}

/** All PR records for a profile, newest first. */
export function useProfilePRRecords(
  profileId: string | null,
): PRRecord[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const records = await db.prRecords.where({ profileId }).toArray();
    records.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
    return records;
  }, [profileId]);
}

/** Working/AMRAP set logs for a single exercise across the profile's
 * history, sorted ascending by completedAt. Used by the per-exercise
 * drilldown charts. */
export function useExerciseHistory(
  profileId: string | null,
  exerciseId: string | null,
): SetLog[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId || !exerciseId) return [];
    const logs = await db.setLogs.where({ exerciseId }).toArray();
    // Filter by profile via the session's profileId. Avoids storing
    // profileId on every set log.
    const sessions = await db.sessions.where({ profileId }).toArray();
    const sessionIds = new Set(sessions.map((s) => s.id));
    return logs
      .filter((l) => sessionIds.has(l.sessionId))
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  }, [profileId, exerciseId]);
}
