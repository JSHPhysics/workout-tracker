import Dexie, { type EntityTable } from 'dexie';
import type {
  Barbell,
  BodyweightLog,
  Exercise,
  PRRecord,
  PeriodLog,
  PlateInventory,
  Profile,
  RoutineTemplate,
  Session,
  SetLog,
} from '../types';
import type { Block } from '../types';

// Pre-v2 sessions don't have `livePlan` yet — type for the upgrader.
type V1Session = Omit<Session, 'livePlan'> & { livePlan?: Block[] };
// Pre-v3 profiles lack the bodyweight toggle.
type V2Profile = Omit<Profile, 'useBodyweightForVolume' | 'equipment'> & {
  useBodyweightForVolume?: boolean;
  equipment?: Profile['equipment'];
};
// Pre-v4 profiles lack the equipment list. Pre-v4 exercises lack the
// requiredEquipment / instructions / diagram trio.
type V3Profile = Omit<Profile, 'equipment' | 'periodTrackingEnabled'> & {
  equipment?: Profile['equipment'];
  periodTrackingEnabled?: Profile['periodTrackingEnabled'];
};
type V3Exercise = Omit<
  Exercise,
  'requiredEquipment' | 'instructions' | 'diagram'
> & {
  requiredEquipment?: Exercise['requiredEquipment'];
  instructions?: Exercise['instructions'];
  diagram?: Exercise['diagram'];
};
// Pre-v6 profiles lack the period-tracking toggle.
type V5Profile = Omit<Profile, 'periodTrackingEnabled'> & {
  periodTrackingEnabled?: Profile['periodTrackingEnabled'];
};

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
  periodLogs: EntityTable<PeriodLog, 'id'>;
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

// v3 — Profile.useBodyweightForVolume added (milestone 9). No schema
// change to indexes; the upgrader backfills the new field to `false`
// so existing profiles keep their previous (non-counted) behaviour
// until the user explicitly enables it in Settings.
db.version(3)
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
    const profilesTable = tx.table('profiles');
    const profiles = (await profilesTable.toArray()) as V2Profile[];
    for (const p of profiles) {
      if (typeof p.useBodyweightForVolume === 'boolean') continue;
      await profilesTable.update(p.id, { useBodyweightForVolume: false });
    }
  });

// v4 — Profile.equipment + Exercise.{requiredEquipment,instructions,diagram}
// added (post-12 expansion). Backfills:
//   • Profiles default to a generous "everything I might own" list so
//     the exercise picker filter doesn't spring on existing users with
//     a wall of hidden lifts. They can trim it in Settings.
//   • Exercises default to []  for requiredEquipment — the seed
//     loader replaces seed rows on every boot with the enriched
//     library, so this is just a safety net for any user-custom rows.
const FULL_EQUIPMENT_DEFAULT: Profile['equipment'] = [
  'bodyweight',
  'barbell',
  'dumbbells',
  'kettlebell',
  'bench',
  'pull-up-bar',
  'cable-machine',
  'resistance-bands',
  'glute-bridge-pad',
  'foam-roller',
  'yoga-mat',
  'medicine-ball',
  'box',
  'machine',
];
db.version(4)
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
    const profilesTable = tx.table('profiles');
    const profiles = (await profilesTable.toArray()) as V3Profile[];
    for (const p of profiles) {
      if (Array.isArray(p.equipment)) continue;
      await profilesTable.update(p.id, { equipment: FULL_EQUIPMENT_DEFAULT });
    }
    const exercisesTable = tx.table('exercises');
    const exercises = (await exercisesTable.toArray()) as V3Exercise[];
    for (const e of exercises) {
      if (Array.isArray(e.requiredEquipment)) continue;
      await exercisesTable.update(e.id, { requiredEquipment: [] });
    }
  });

// v5 — Session.{moodBefore,energyBefore,moodAfter,energyAfter} added
// (mood/energy logging feature). All four fields are optional plain
// JSON columns — no index changes, no upgrader logic, no backfill.
// Existing sessions continue to read as `undefined` for all four,
// which the UI renders as "Not recorded" and (per the dispatch logic
// in Session.tsx) suppresses the post-finish prompt's pre-fill.
db.version(5).stores({
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
});

// v6 — Period/cycle tracking added (opt-in per profile). New
// `periodLogs` table indexed by [profileId+startDate] for the
// chronologically-ordered queries the cycle calculator needs. The
// upgrader backfills `periodTrackingEnabled: false` on every existing
// profile so the new UI surfaces stay invisible until the user opts
// in via Settings.
db.version(6)
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
    periodLogs: '&id, profileId, startDate, [profileId+startDate]',
  })
  .upgrade(async (tx) => {
    const profilesTable = tx.table('profiles');
    const profiles = (await profilesTable.toArray()) as V5Profile[];
    for (const p of profiles) {
      if (typeof p.periodTrackingEnabled === 'boolean') continue;
      await profilesTable.update(p.id, { periodTrackingEnabled: false });
    }
  });
