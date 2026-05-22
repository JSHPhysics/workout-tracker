import { describe, expect, it } from 'vitest';
import {
  BACKUP_MAGIC,
  BACKUP_SCHEMA_VERSION,
  migrateBackup,
  parseBackup,
} from './backup-format';

const validEnvelope = {
  magic: BACKUP_MAGIC,
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: '2026-05-06T10:00:00.000Z',
  data: {
    profiles: [],
    exercises: [],
    routineTemplates: [],
    sessions: [],
    setLogs: [],
    barbells: [],
    plateInventory: [],
    bodyweightLogs: [],
    prRecords: [],
    periodLogs: [],
    exerciseRestPrefs: [],
    exerciseHoldPrefs: [],
    favouriteRoutines: [],
    workoutPlans: [],
    scheduledSessions: [],
    muscleVolumeOverrides: [],
  },
};

/** A schemaVersion-1 envelope: only the nine original arrays, no v2
 * tables. Represents a backup written before the v2 expansion. */
const v1Envelope = {
  magic: BACKUP_MAGIC,
  schemaVersion: 1,
  exportedAt: '2026-05-06T10:00:00.000Z',
  data: {
    profiles: [],
    exercises: [],
    routineTemplates: [],
    sessions: [],
    setLogs: [],
    barbells: [],
    plateInventory: [],
    bodyweightLogs: [],
    prRecords: [],
  },
};

describe('parseBackup', () => {
  it('accepts a well-formed envelope', () => {
    const r = parseBackup(validEnvelope);
    expect(r.ok).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(parseBackup('hello').ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
    expect(parseBackup(42).ok).toBe(false);
  });

  it('rejects when the magic string is wrong', () => {
    const r = parseBackup({ ...validEnvelope, magic: 'something-else' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/magic/i);
  });

  it('rejects when schemaVersion is missing', () => {
    const { schemaVersion: _omit, ...rest } = validEnvelope;
    const r = parseBackup(rest);
    expect(r.ok).toBe(false);
  });

  it('rejects backups newer than the running app', () => {
    const r = parseBackup({ ...validEnvelope, schemaVersion: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/newer/i);
  });

  it('rejects when a required data array is missing', () => {
    const r = parseBackup({
      ...validEnvelope,
      data: { ...validEnvelope.data, sessions: undefined },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sessions/);
  });

  it('accepts a v1 envelope lacking the v2 tables (backward compat)', () => {
    const r = parseBackup(v1Envelope);
    expect(r.ok).toBe(true);
  });
});

describe('migrateBackup', () => {
  it('returns the envelope unchanged when already current', () => {
    const r = parseBackup(validEnvelope);
    if (!r.ok) throw new Error('expected ok');
    const migrated = migrateBackup(r.envelope);
    expect(migrated.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(migrated).toEqual(r.envelope);
  });

  it('upgrades a v1 envelope and defaults the v2 tables to []', () => {
    const r = parseBackup(v1Envelope);
    if (!r.ok) throw new Error('expected ok');
    const migrated = migrateBackup(r.envelope);
    expect(migrated.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    // The seven tables added in v2 must exist as empty arrays so the
    // importer's bulkPut calls are total.
    expect(migrated.data.periodLogs).toEqual([]);
    expect(migrated.data.exerciseRestPrefs).toEqual([]);
    expect(migrated.data.exerciseHoldPrefs).toEqual([]);
    expect(migrated.data.favouriteRoutines).toEqual([]);
    expect(migrated.data.workoutPlans).toEqual([]);
    expect(migrated.data.scheduledSessions).toEqual([]);
    expect(migrated.data.muscleVolumeOverrides).toEqual([]);
    // Original arrays preserved.
    expect(migrated.data.profiles).toEqual([]);
  });

  it('preserves existing v2 rows through migration', () => {
    const pref = {
      id: 'p1-e1',
      profileId: 'p1',
      exerciseId: 'e1',
      holdSeconds: 60,
      updatedAt: '2026-05-22T00:00:00.000Z',
    };
    const r = parseBackup({
      ...validEnvelope,
      data: { ...validEnvelope.data, exerciseHoldPrefs: [pref] },
    });
    if (!r.ok) throw new Error('expected ok');
    const migrated = migrateBackup(r.envelope);
    expect(migrated.data.exerciseHoldPrefs).toEqual([pref]);
  });
});
