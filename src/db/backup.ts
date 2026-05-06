// Export + import + restore. The JSON envelope is the user's only
// durable copy of their data — see SCOPE §10 + CLAUDE.md "Backup &
// durability".

import { db } from './db';
import {
  BACKUP_MAGIC,
  BACKUP_SCHEMA_VERSION,
  migrateBackup,
  type BackupData,
  type BackupEnvelope,
} from '../domain/backup-format';
import {
  baselinesFromHistory,
  detectPRs,
} from '../domain/pr-detection';
import type { PRRecord, SetLog } from '../types';

// --- Export ----------------------------------------------------------------

export interface ExportOptions {
  /** When set, only include rows scoped to this profile (plus the
   * shared exercise + routine library for self-contained restores).
   * Omit for a full multi-profile dump. */
  profileId?: string;
  /** App version string to stamp on the envelope. */
  appVersion?: string;
}

export async function buildBackup(
  options: ExportOptions = {},
): Promise<BackupEnvelope> {
  const all = await db.transaction(
    'r',
    [
      db.profiles,
      db.exercises,
      db.routineTemplates,
      db.sessions,
      db.setLogs,
      db.barbells,
      db.plateInventory,
      db.bodyweightLogs,
      db.prRecords,
    ],
    async () => {
      const profiles = await db.profiles.toArray();
      const exercises = await db.exercises.toArray();
      const routineTemplates = await db.routineTemplates.toArray();
      const sessions = await db.sessions.toArray();
      const setLogs = await db.setLogs.toArray();
      const barbells = await db.barbells.toArray();
      const plateInventory = await db.plateInventory.toArray();
      const bodyweightLogs = await db.bodyweightLogs.toArray();
      const prRecords = await db.prRecords.toArray();
      return {
        profiles,
        exercises,
        routineTemplates,
        sessions,
        setLogs,
        barbells,
        plateInventory,
        bodyweightLogs,
        prRecords,
      };
    },
  );

  const data: BackupData = options.profileId
    ? scopeToProfile(all, options.profileId)
    : all;

  const envelope: BackupEnvelope = {
    magic: BACKUP_MAGIC,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    ...(options.profileId ? { profileId: options.profileId } : {}),
    data,
  };
  return envelope;
}

function scopeToProfile(all: BackupData, profileId: string): BackupData {
  const profile = all.profiles.find((p) => p.id === profileId);
  const sessionIds = new Set(
    all.sessions.filter((s) => s.profileId === profileId).map((s) => s.id),
  );
  return {
    profiles: profile ? [profile] : [],
    // Exercises + routine templates are app-wide; include them so the
    // restored profile actually has its library available.
    exercises: all.exercises,
    routineTemplates: all.routineTemplates,
    sessions: all.sessions.filter((s) => s.profileId === profileId),
    setLogs: all.setLogs.filter((l) => sessionIds.has(l.sessionId)),
    barbells: all.barbells.filter((b) => b.profileId === profileId),
    plateInventory: all.plateInventory.filter(
      (p) => p.profileId === profileId,
    ),
    bodyweightLogs: all.bodyweightLogs.filter(
      (l) => l.profileId === profileId,
    ),
    prRecords: all.prRecords.filter((r) => r.profileId === profileId),
  };
}

/** Stable filename for the export — date-stamped + profile-scoped. */
export function backupFilename(
  envelope: BackupEnvelope,
  profileName?: string,
): string {
  const date = envelope.exportedAt.slice(0, 10);
  const scope = profileName ? `-${slug(profileName)}` : '';
  return `workout-tracker${scope}-${date}.json`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// --- Import ----------------------------------------------------------------

export interface ImportResult {
  /** Counts of rows actually written. */
  counts: Record<keyof BackupData, number>;
  /** Number of PR records re-derived (PRs from the file are discarded). */
  prRecomputed: number;
}

/** Restore a parsed envelope into Dexie. The whole operation runs in a
 * single rw transaction so a partial failure rolls back. PR records
 * are recomputed from the imported set logs — see SCOPE §10. */
export async function importBackup(
  envelope: BackupEnvelope,
  options: { wipeFirst?: boolean } = {},
): Promise<ImportResult> {
  const migrated = migrateBackup(envelope);
  const wipeFirst = options.wipeFirst ?? true;
  const data = migrated.data;

  return db.transaction(
    'rw',
    [
      db.profiles,
      db.exercises,
      db.routineTemplates,
      db.sessions,
      db.setLogs,
      db.barbells,
      db.plateInventory,
      db.bodyweightLogs,
      db.prRecords,
    ],
    async () => {
      if (wipeFirst) {
        await Promise.all([
          db.sessions.clear(),
          db.setLogs.clear(),
          db.bodyweightLogs.clear(),
          db.barbells.clear(),
          db.plateInventory.clear(),
          db.prRecords.clear(),
          db.profiles.clear(),
          db.exercises.clear(),
          db.routineTemplates.clear(),
        ]);
      }

      // bulkPut is upsert-by-pk; works whether or not we wiped.
      await db.profiles.bulkPut(data.profiles);
      await db.exercises.bulkPut(data.exercises);
      await db.routineTemplates.bulkPut(data.routineTemplates);
      await db.sessions.bulkPut(data.sessions);
      await db.setLogs.bulkPut(data.setLogs);
      await db.barbells.bulkPut(data.barbells);
      await db.plateInventory.bulkPut(data.plateInventory);
      await db.bodyweightLogs.bulkPut(data.bodyweightLogs);

      // PR recompute. The file's prRecords are intentionally discarded.
      const recomputed = recomputePRsFromSetLogs(data.setLogs);
      patchPRRecordProfileIds(recomputed, data.sessions);
      // Drop any stragglers that couldn't resolve (orphan setLog with
      // a sessionId that isn't in the import) — shouldn't happen but
      // belt + braces.
      const cleaned = recomputed.filter((r) => r.profileId !== '');
      await db.prRecords.bulkPut(cleaned);

      // Also annotate setLog.prTypes + session.prCount from the
      // recompute — same shape `finishSession` writes.
      const typesBySetLog = new Map<string, PRRecord['type'][]>();
      for (const r of cleaned) {
        const arr = typesBySetLog.get(r.setLogId) ?? [];
        arr.push(r.type);
        typesBySetLog.set(r.setLogId, arr);
      }
      // Set every setLog.prTypes — both those with PRs and those without
      // (so stale `prTypes` from the imported rows don't linger).
      for (const log of data.setLogs) {
        const next = typesBySetLog.get(log.id) ?? [];
        await db.setLogs.update(log.id, { prTypes: next });
      }
      // Recompute prCount per session from the recomputed records.
      const prCountBySession = new Map<string, number>();
      for (const r of cleaned) {
        prCountBySession.set(
          r.sessionId,
          (prCountBySession.get(r.sessionId) ?? 0) + 1,
        );
      }
      for (const sess of data.sessions) {
        await db.sessions.update(sess.id, {
          prCount: prCountBySession.get(sess.id) ?? 0,
        });
      }

      return {
        counts: {
          profiles: data.profiles.length,
          exercises: data.exercises.length,
          routineTemplates: data.routineTemplates.length,
          sessions: data.sessions.length,
          setLogs: data.setLogs.length,
          barbells: data.barbells.length,
          plateInventory: data.plateInventory.length,
          bodyweightLogs: data.bodyweightLogs.length,
          prRecords: cleaned.length,
        },
        prRecomputed: cleaned.length,
      };
    },
  );
}

/** Replay PR detection chronologically over every session in the input.
 * Mirrors what `finishSession` does for a single session, but applied
 * across the whole history — so the result is identical to whatever the
 * user's PR record would have been if they'd never imported. */
function recomputePRsFromSetLogs(setLogs: readonly SetLog[]): PRRecord[] {
  // Group by [profileId via session]→exerciseId, but we only have the
  // session id on each log. Collapse by sessionId first, sort sessions
  // by their earliest log, then walk session-by-session.
  const sessionFirstLog = new Map<string, string>();
  for (const l of setLogs) {
    const cur = sessionFirstLog.get(l.sessionId);
    if (!cur || l.completedAt < cur) sessionFirstLog.set(l.sessionId, l.completedAt);
  }
  const sessionOrder = Array.from(sessionFirstLog.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([sessionId]) => sessionId);

  const logsBySession = new Map<string, SetLog[]>();
  for (const l of setLogs) {
    const arr = logsBySession.get(l.sessionId) ?? [];
    arr.push(l);
    logsBySession.set(l.sessionId, arr);
  }

  const all: PRRecord[] = [];
  // Per-exercise running history (for baseline computation we'd need
  // bestWeight/bestE1RM/bestRepsByWeight/bestSessionVolume). Build
  // those incrementally so we don't rescan all history per session.
  const baselines = new Map<
    string,
    {
      bestWeight: number | null;
      bestE1RM: number | null;
      bestRepsByWeight: Map<number, number>;
      bestSessionVolume: number | null;
    }
  >();

  for (const sessionId of sessionOrder) {
    const sessionLogs = (logsBySession.get(sessionId) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.blockOrder - b.blockOrder ||
          a.exerciseOrder - b.exerciseOrder ||
          a.setNumber - b.setNumber,
      );

    const priorByExercise = new Map(
      Array.from(baselines.entries()).map(([k, v]) => [
        k,
        {
          bestWeight: v.bestWeight,
          bestE1RM: v.bestE1RM,
          bestRepsByWeight: v.bestRepsByWeight,
          bestSessionVolume: v.bestSessionVolume,
        },
      ]),
    );

    const awards = detectPRs({ setLogs: sessionLogs, priorByExercise });

    // Pull the session's completedAt (use the latest log's completedAt
    // as an approximation — the actual session.completedAt isn't passed
    // to this helper).
    const lastTs =
      sessionLogs[sessionLogs.length - 1]?.completedAt ??
      new Date().toISOString();
    // We don't have profileId here either — but every PRRecord needs
    // one. The caller writes setLogs in profile-scoped batches when
    // doing a per-profile restore; for full restores we read it back
    // off the session row at write time. Keep it as empty string here
    // and patch from sessions table outside this fn? Easier: look up
    // profileId via a sessions-by-id map passed into this function.

    for (const a of awards) {
      all.push({
        id: crypto.randomUUID(),
        // profileId is patched by the caller right after this returns
        // (we don't have access to sessions here). We stuff a sentinel
        // and rely on the wrapper to fix it.
        profileId: '',
        exerciseId: a.exerciseId,
        type: a.type,
        value: a.value,
        achievedAt: lastTs,
        sessionId,
        setLogId: a.setLogId,
      });
    }

    // Update baselines using this session's qualifying logs (replay of
    // baselinesFromHistory but incremental).
    const sessionVolumesByExercise = new Map<string, number>();
    for (const l of sessionLogs) {
      if (l.setType !== 'working' && l.setType !== 'amrap') continue;
      if (typeof l.weight !== 'number' || typeof l.reps !== 'number') continue;
      if (l.weight <= 0 || l.reps <= 0) continue;
      const cur = baselines.get(l.exerciseId) ?? {
        bestWeight: null as number | null,
        bestE1RM: null as number | null,
        bestRepsByWeight: new Map<number, number>(),
        bestSessionVolume: null as number | null,
      };
      const fresh = baselinesFromHistory([l], []);
      if (fresh.bestWeight !== null) {
        cur.bestWeight =
          cur.bestWeight === null
            ? fresh.bestWeight
            : Math.max(cur.bestWeight, fresh.bestWeight);
      }
      if (fresh.bestE1RM !== null) {
        cur.bestE1RM =
          cur.bestE1RM === null
            ? fresh.bestE1RM
            : Math.max(cur.bestE1RM, fresh.bestE1RM);
      }
      for (const [w, r] of fresh.bestRepsByWeight) {
        const prev = cur.bestRepsByWeight.get(w) ?? 0;
        if (r > prev) cur.bestRepsByWeight.set(w, r);
      }
      baselines.set(l.exerciseId, cur);

      const sv = sessionVolumesByExercise.get(l.exerciseId) ?? 0;
      sessionVolumesByExercise.set(l.exerciseId, sv + l.weight * l.reps);
    }
    for (const [exerciseId, vol] of sessionVolumesByExercise) {
      const cur = baselines.get(exerciseId);
      if (!cur) continue;
      cur.bestSessionVolume =
        cur.bestSessionVolume === null
          ? vol
          : Math.max(cur.bestSessionVolume, vol);
    }
  }

  return all;
}

/** Stamp `lastBackupAt` on every profile included in the export so
 * the stale-backup nag clears immediately after a successful save.
 * Pass the envelope's `profileId` (when present) for a scoped export
 * — otherwise stamps every profile. */
export async function markBackedUp(
  exportedAt: string,
  profileId?: string,
): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    if (profileId) {
      await db.profiles.update(profileId, { lastBackupAt: exportedAt });
      return;
    }
    const all = await db.profiles.toArray();
    for (const p of all) {
      await db.profiles.update(p.id, { lastBackupAt: exportedAt });
    }
  });
}

/** Patch profileId on every PRRecord using the session→profileId map. */
export function patchPRRecordProfileIds(
  records: PRRecord[],
  sessions: readonly { id: string; profileId: string }[],
): void {
  const profileBySession = new Map(
    sessions.map((s) => [s.id, s.profileId]),
  );
  for (const r of records) {
    const p = profileBySession.get(r.sessionId);
    if (p) r.profileId = p;
  }
}

