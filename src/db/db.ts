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
import type { Block } from '../types';

// Pre-v2 sessions don't have `livePlan` yet — type for the upgrader.
type V1Session = Omit<Session, 'livePlan'> & { livePlan?: Block[] };

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

// v2 — Session.livePlan added (milestone 4). No new indexes; the field
// is plain JSON inside each session row. Upgrader backfills existing
// rows: templated sessions snapshot from their routine, free sessions
// start with an empty plan. See DECISIONS.md for the live-plan rationale.
db.version(2)
  .stores({
    profiles: '&id, name',
    exercises: '&id, name, profileId, isCustom, category',
    routineTemplates: '&id, name, profileId, isSeed',
    sessions: '&id, profileId, startedAt, completedAt, [profileId+startedAt]',
    setLogs:
      '&id, sessionId, exerciseId, [sessionId+blockOrder+exerciseOrder+setNumber], completedAt',
    barbells: '&id, profileId, [profileId+isDefault]',
    plateInventory: '&id, profileId',
    bodyweightLogs: '&id, profileId, date, [profileId+date]',
    prRecords:
      '&id, profileId, exerciseId, type, achievedAt, [profileId+exerciseId+type]',
  })
  .upgrade(async (tx) => {
    const sessionsTable = tx.table('sessions');
    const routinesTable = tx.table('routineTemplates');
    const legacySessions = (await sessionsTable.toArray()) as V1Session[];
    for (const s of legacySessions) {
      if (s.livePlan) continue;
      let livePlan: Block[] = [];
      if (s.templateRef) {
        const routine = (await routinesTable.get(
          s.templateRef.routineId,
        )) as RoutineTemplate | undefined;
        const week = routine?.weeks.find(
          (w) => w.weekNumber === s.templateRef!.weekNumber,
        );
        const day = week?.days.find(
          (d) => d.dayNumber === s.templateRef!.dayNumber,
        );
        if (day?.blocks) livePlan = structuredClone(day.blocks);
      }
      await sessionsTable.update(s.id, { livePlan });
    }
  });
