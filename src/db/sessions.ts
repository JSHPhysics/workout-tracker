import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  Block,
  PlannedExercise,
  Session,
  SessionTemplateRef,
} from '../types';

interface CreateSessionInput {
  profileId: string;
  templateRef?: SessionTemplateRef;
  planName: string;
  /** Initial plan. Snapshot from a routine day for templated sessions;
   * `[]` for free sessions. */
  livePlan: Block[];
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
    livePlan: structuredClone(input.livePlan),
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

// --- Live-plan mutators ----------------------------------------------------
//
// Each one reads the session, applies a pure mutation to a clone of
// livePlan, and writes it back. Cheap because livePlan is bounded
// (handful of blocks per day) and Dexie writes a single row.

async function withLivePlan(
  sessionId: string,
  mutator: (plan: Block[]) => Block[],
): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    const next = mutator(structuredClone(s.livePlan));
    await db.sessions.update(sessionId, { livePlan: next });
  });
}

export function appendBlock(
  sessionId: string,
  block: Block,
): Promise<void> {
  return withLivePlan(sessionId, (plan) => [...plan, block]);
}

export function setBlockSkipped(
  sessionId: string,
  blockOrder: number,
  skipped: boolean,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => (i === blockOrder ? { ...b, skipped } : b)),
  );
}

export function swapExercise(
  sessionId: string,
  blockOrder: number,
  exerciseOrder: number,
  next: PlannedExercise,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => {
      if (i !== blockOrder) return b;
      return {
        ...b,
        exercises: b.exercises.map((e, j) => (j === exerciseOrder ? next : e)),
      };
    }),
  );
}

export function changeSetCount(
  sessionId: string,
  blockOrder: number,
  exerciseOrder: number,
  delta: 1 | -1,
): Promise<void> {
  return withLivePlan(sessionId, (plan) =>
    plan.map((b, i) => {
      if (i !== blockOrder) return b;
      return {
        ...b,
        exercises: b.exercises.map((e, j) =>
          j === exerciseOrder
            ? { ...e, setCount: Math.max(1, e.setCount + delta) }
            : e,
        ),
      };
    }),
  );
}

// --- Queries ---------------------------------------------------------------

export function useSession(id: string | undefined): Session | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    return (await db.sessions.get(id)) ?? null;
  }, [id]);
}

export function useProfileSessions(
  profileId: string | null | undefined,
): Session[] | undefined {
  return useLiveQuery(async () => {
    if (!profileId) return [];
    const all = await db.sessions.where({ profileId }).toArray();
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [profileId]);
}

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
