import Dexie, { type EntityTable } from 'dexie';
import type {
  Barbell,
  BodyweightLog,
  Exercise,
  ExerciseRestPref,
  FavouriteRoutine,
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
// Pre-v7 profiles lack the warm-up generator percentages.
type V6Profile = Omit<Profile, 'warmupPercentages'> & {
  warmupPercentages?: Profile['warmupPercentages'];
};
// Pre-v8 profiles store the legacy `accent` token (e.g. 'profile-josh')
// instead of the new `theme` field. The v8 upgrader rewrites them.
type V7Profile = Omit<Profile, 'theme'> & {
  /** Legacy field. Kept here only for the migration to read; absent
   * on the current `Profile` shape. */
  accent?: string;
  theme?: Profile['theme'];
};
// Pre-v9 profiles lack the keep-screen-on toggle.
type V8Profile = Omit<Profile, 'keepScreenOn'> & {
  keepScreenOn?: Profile['keepScreenOn'];
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
  exerciseRestPrefs: EntityTable<ExerciseRestPref, 'id'>;
  favouriteRoutines: EntityTable<FavouriteRoutine, 'id'>;
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

// v7 — Profile.warmupPercentages added (warm-up generator). Plain JSON
// array column on the profile row — no index changes. The upgrader
// backfills the standard 30/45/60 % defaults on every existing profile
// so the Settings card and the in-session generator have a sensible
// starting point without forcing the user to configure first.
const WARMUP_PERCENTAGES_DEFAULT: Profile['warmupPercentages'] = [30, 45, 60];
db.version(7)
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
    const profiles = (await profilesTable.toArray()) as V6Profile[];
    for (const p of profiles) {
      if (Array.isArray(p.warmupPercentages)) continue;
      await profilesTable.update(p.id, {
        warmupPercentages: [...WARMUP_PERCENTAGES_DEFAULT],
      });
    }
  });

// v8 — Profile.theme replaces Profile.accent so themes can be picked
// independently of the profile id (the previous design tied
// `data-profile="joshua"` selectors to the seeded ids — fine for two
// fixed profiles, broken for arbitrary user-named profiles). Also adds
// optional `Profile.sex` for sex-driven defaults at creation.
//
// Migration map for legacy `accent` values:
//   'profile-josh'   → 'emerald'
//   'profile-hayley' → 'rose'
//   anything else    → 'emerald' (the default)
//
// `sex` is left undefined on legacy rows — there's no honest way to
// guess, and both surfaces it drives (period tracking, default bar)
// are still toggleable in Settings.
const ACCENT_TO_THEME: Record<string, Profile['theme']> = {
  'profile-josh': 'emerald',
  'profile-hayley': 'rose',
};
db.version(8)
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
    const profiles = (await profilesTable.toArray()) as V7Profile[];
    for (const p of profiles) {
      if (typeof p.theme === 'string') continue;
      const theme = ACCENT_TO_THEME[p.accent ?? ''] ?? 'emerald';
      // Dexie's update spec doesn't take `field: undefined` cleanly
      // under exactOptionalPropertyTypes; the cast is the documented
      // escape hatch (DECISIONS milestone 7). We intentionally do
      // *not* delete `accent` — leaving it as a harmless stale field
      // is simpler than fighting Dexie's update typing, and nothing
      // reads it any more.
      await profilesTable.update(p.id, { theme } as Partial<Profile>);
    }
  });

// v9 — Profile.keepScreenOn added (Wake Lock toggle). Plain boolean
// column, no index changes. Defaults to `false` on existing profiles
// — matches the previous behaviour (no wake lock at all) so opting
// in is an explicit user action.
db.version(9)
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
    const profiles = (await profilesTable.toArray()) as V8Profile[];
    for (const p of profiles) {
      if (typeof p.keepScreenOn === 'boolean') continue;
      await profilesTable.update(p.id, { keepScreenOn: false });
    }
  });

// v10 — Per-exercise rest-timer memory + per-profile default rest.
//
// New table `exerciseRestPrefs` keyed by a synthetic `${profileId}-${exerciseId}`
// id so put-as-upsert just works. Storing the (profileId, exerciseId)
// tuple as the row's primary key avoids a separate uniqueness index.
//
// `Profile.defaultRestSeconds` is a new optional column — left
// undefined on existing profiles. Resolution order in SetRow becomes:
//   exerciseRestPref ?? planned.restSeconds ?? profile.defaultRestSeconds
//     ?? exercise.defaultRestSeconds ?? 90s.
db.version(10).stores({
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
  // No upgrader logic — `defaultRestSeconds` is optional + absent on
  // legacy profiles is correct (the resolution chain falls through to
  // exercise.defaultRestSeconds / 90s as before).
  exerciseRestPrefs: '&id, profileId, exerciseId, [profileId+exerciseId]',
});

// v11 — Per-(profile, routine) favourite flag. Same synthetic-id
// pattern as exerciseRestPrefs / favourites are per-profile so seed
// routines can be starred independently by household members. No
// upgrader — additive.
db.version(11).stores({
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
  exerciseRestPrefs: '&id, profileId, exerciseId, [profileId+exerciseId]',
  favouriteRoutines: '&id, profileId, routineId, [profileId+routineId]',
});
