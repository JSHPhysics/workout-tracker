import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Session, SessionTemplateRef } from '../types';

interface CreateSessionInput {
  profileId: string;
  templateRef?: SessionTemplateRef;
  planName: string;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    ...(input.templateRef ? { templateRef: input.templateRef } : {}),
    startedAt: new Date().toISOString(),
    completedAt: null,
    planName: input.planName,
    prCount: 0,
  };
  await db.sessions.add(session);
  return id;
}

export async function finishSession(id: string): Promise<void> {
  await db.sessions.update(id, { completedAt: new Date().toISOString() });
}

export async function discardSession(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.setLogs], async () => {
    await db.setLogs.where({ sessionId: id }).delete();
    await db.sessions.delete(id);
  });
}

export function useSession(id: string | undefined): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.sessions.get(id)) ?? null;
  }, [id]);
}

/** Newest-first list of all sessions for a profile. */
export function useProfileSessions(
  profileId: string | null | undefined,
): Session[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const all = await db.sessions.where({ profileId }).toArray();
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [profileId]);
}

/** Most recent in-progress session for a profile, if any. */
export function useActiveSession(
  profileId: string | null | undefined,
): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return null;
    const open = await db.sessions
      .where({ profileId })
      .filter((s) => s.completedAt === null)
      .toArray();
    if (open.length === 0) return null;
    open.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return open[0] ?? null;
  }, [profileId]);
}
