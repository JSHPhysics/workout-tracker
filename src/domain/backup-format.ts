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
  ExerciseHoldPref,
  ExerciseRestPref,
  FavouriteRoutine,
  MuscleVolumeOverride,
  PRRecord,
  PeriodLog,
  PlateInventory,
  Profile,
  RoutineTemplate,
  ScheduledSession,
  Session,
  SetLog,
  WorkoutPlan,
} from '../types';

// v2 (2026-05-22): added the seven tables that v1 silently dropped on
// restore — period logs (real cycle-tracking data!), per-exercise rest
// + hold prefs, favourite routines, workout plans, scheduled sessions,
// and muscle-volume overrides. v1 files restore fine: `migrateBackup`
// defaults the new arrays to []. See DECISIONS.md.
export const BACKUP_SCHEMA_VERSION = 2;
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
  // --- Added in schemaVersion 2. Absent on v1 files; `migrateBackup`
  // defaults each to [] so older backups still restore. ---
  /** Cycle-tracking data — genuine user health data, not derived. */
  periodLogs: PeriodLog[];
  exerciseRestPrefs: ExerciseRestPref[];
  exerciseHoldPrefs: ExerciseHoldPref[];
  favouriteRoutines: FavouriteRoutine[];
  workoutPlans: WorkoutPlan[];
  scheduledSessions: ScheduledSession[];
  muscleVolumeOverrides: MuscleVolumeOverride[];
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
 * current schemaVersion.
 *
 * v1 → v2: the seven tables added in v2 are absent from v1 files. We
 * normalise `data` so every array is present (defaulting missing ones
 * to []), which makes the importer's bulkPut calls total. This is also
 * defensive against a current-version file that's missing a key (e.g.
 * hand-edited) — we always return a fully-populated `BackupData`. */
export function migrateBackup(envelope: BackupEnvelope): BackupEnvelope {
  const d = envelope.data as Partial<BackupData>;
  const data: BackupData = {
    profiles: d.profiles ?? [],
    exercises: d.exercises ?? [],
    routineTemplates: d.routineTemplates ?? [],
    sessions: d.sessions ?? [],
    setLogs: d.setLogs ?? [],
    barbells: d.barbells ?? [],
    plateInventory: d.plateInventory ?? [],
    bodyweightLogs: d.bodyweightLogs ?? [],
    prRecords: d.prRecords ?? [],
    periodLogs: d.periodLogs ?? [],
    exerciseRestPrefs: d.exerciseRestPrefs ?? [],
    exerciseHoldPrefs: d.exerciseHoldPrefs ?? [],
    favouriteRoutines: d.favouriteRoutines ?? [],
    workoutPlans: d.workoutPlans ?? [],
    scheduledSessions: d.scheduledSessions ?? [],
    muscleVolumeOverrides: d.muscleVolumeOverrides ?? [],
  };
  return { ...envelope, schemaVersion: BACKUP_SCHEMA_VERSION, data };
}
