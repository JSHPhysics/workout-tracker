import Dexie, { type EntityTable } from 'dexie';
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

// Single Dexie instance for the app. Each Dexie table is typed via
// `EntityTable<T, primaryKey>`; the second generic argument is the name
// of the primary-key field.
//
// Schema migrations are additive — never edit a previous `version()`
// call. Add a new `.version(N).stores({...})` chain instead, and
// document the migration in DECISIONS.md.

export type WorkoutDB = Dexie & {
  profiles: EntityTable<Profile, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  routineTemplates: EntityTable<RoutineTemplate, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  setLogs: EntityTable<SetLog, 'id'>;
  barbells: EntityTable<Barbell, 'id'>;
  plateInventory: EntityTable<PlateInventory, 'id'>;
  bodyweightLogs: EntityTable<BodyweightLog, 'id'>;
  prRecords: EntityTable<PRRecord, 'id'>;
};

// Names index entries:
//   "id"                 — primary key
//   "&id"                — primary key with a uniqueness constraint
//   "name"               — secondary index for quick filtering
//   "[profileId+...]"    — compound index, ordered as listed
//
// We index profileId on profile-scoped tables so per-profile queries
// stay fast even with multi-profile data, and we index session/exercise
// on SetLog so the workout log can be drilled into either way.

export const db = new Dexie('workout-tracker') as WorkoutDB;

db.version(1).stores({
  profiles: '&id, name',
  exercises: '&id, name, profileId, isCustom, category',
  routineTemplates: '&id, name, profileId, isSeed',
  sessions: '&id, profileId, startedAt, completedAt, [profileId+startedAt]',
  setLogs:
    '&id, sessionId, exerciseId, [sessionId+blockOrder+exerciseOrder+setNumber], completedAt',
  barbells: '&id, profileId, [profileId+isDefault]',
  plateInventory: '&id, profileId',
  bodyweightLogs: '&id, profileId, date, [profileId+date]',
  prRecords: '&id, profileId, exerciseId, type, achievedAt, [profileId+exerciseId+type]',
});
