// Versioned backup file format.
//
// Backups are the **only** durable copy of user data — IndexedDB can be
// cleared by the user or browser at any time. Treat the JSON envelope
// like a public API: bump `schemaVersion` whenever the shape changes,
// and add a migration in [src/db/backup.ts](src/db/backup.ts) so old
// backups still restore cleanly.
//
// SCOPE §10: PRRecord rows are derived state. The importer recomputes
// them from set logs after restoring; we still persist them in the
// envelope (cheap, defensive) but never trust the imported values.

import type {
  Barbell,
  BodyweightLog,
  Exercise,
  PRRecord,
  PlateInventory,
  Profile,
  RoutineTemplate,
  Session,
  SetLog,
} from '../types';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_MAGIC = 'workout-tracker.backup';

export interface BackupEnvelope {
  /** Stable string so a glance at the JSON tells you what it is. */
  magic: typeof BACKUP_MAGIC;
  /** Bump on any breaking change to the shape below. */
  schemaVersion: number;
  /** ISO 8601 (UTC). Set by the exporter. */
  exportedAt: string;
  /** App version that wrote this file (Vite's `import.meta.env.MODE`
   * is fine for now — bump to the package.json version when it
   * matters). Optional so older files without it still parse. */
  appVersion?: string;
  /** Profile that triggered the export, if scoped. `null` for a
   * full multi-profile dump. */
  profileId?: string | null;
  data: BackupData;
}

export interface BackupData {
  profiles: Profile[];
  exercises: Exercise[];
  routineTemplates: RoutineTemplate[];
  sessions: Session[];
  setLogs: SetLog[];
  barbells: Barbell[];
  plateInventory: PlateInventory[];
  bodyweightLogs: BodyweightLog[];
  /** Persisted for diagnostics; the importer recomputes these from
   * set logs and discards what's here. */
  prRecords: PRRecord[];
}

export type ParseResult =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; reason: string };

/** Validate a parsed-from-JSON value as a backup envelope. Returns a
 * tagged union so callers can distinguish "this isn't ours" from
 * "this is ours but malformed". */
export function parseBackup(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'Not a JSON object' };
  }
  const r = raw as Record<string, unknown>;
  if (r.magic !== BACKUP_MAGIC) {
    return {
      ok: false,
      reason: `Not a workout-tracker backup (missing magic "${BACKUP_MAGIC}")`,
    };
  }
  if (typeof r.schemaVersion !== 'number') {
    return { ok: false, reason: 'Missing schemaVersion' };
  }
  if (r.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Backup schema v${r.schemaVersion} is newer than this app (v${BACKUP_SCHEMA_VERSION}). Update the app and try again.`,
    };
  }
  if (typeof r.exportedAt !== 'string') {
    return { ok: false, reason: 'Missing exportedAt' };
  }
  if (!r.data || typeof r.data !== 'object') {
    return { ok: false, reason: 'Missing data envelope' };
  }
  const d = r.data as Record<string, unknown>;
  const requiredArrays = [
    'profiles',
    'exercises',
    'routineTemplates',
    'sessions',
    'setLogs',
    'barbells',
    'plateInventory',
    'bodyweightLogs',
    'prRecords',
  ];
  for (const k of requiredArrays) {
    if (!Array.isArray(d[k])) {
      return { ok: false, reason: `data.${k} is not an array` };
    }
  }
  return { ok: true, envelope: r as unknown as BackupEnvelope };
}

/** Apply per-version migrations to bring an older envelope up to the
 * current schemaVersion. Currently a no-op — first migration lands
 * with schemaVersion 2. */
export function migrateBackup(envelope: BackupEnvelope): BackupEnvelope {
  if (envelope.schemaVersion === BACKUP_SCHEMA_VERSION) return envelope;
  // Future: chain migration steps here based on schemaVersion.
  return { ...envelope, schemaVersion: BACKUP_SCHEMA_VERSION };
}
