// Canonical domain shapes. Mirrors SCOPE.md §4.3.
// Dexie schemas (see src/db) and the Strong Curves seed (src/seed)
// both reference these types — keep them in lock-step.

// --- Enumerations -----------------------------------------------------------

export type UnitSystem = 'kg' | 'lb';

export const MUSCLE_GROUPS = [
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'forearms',
  'adductors',
  'abductors',
  'traps',
  'lats',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EXERCISE_CATEGORIES = [
  'glute',
  'quad',
  'hip-hinge',
  'push',
  'pull',
  'core',
  'accessory',
  'warmup',
  'activation',
  'cardio',
  'other',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const MEASUREMENT_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'time_seconds',
  'distance',
  'reps_each_side',
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const SET_TYPES = ['working', 'warmup', 'drop', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const PR_TYPES = ['weight', 'reps_at_weight', 'e1rm', 'session_volume'] as const;
export type PRType = (typeof PR_TYPES)[number];

// --- Profile + equipment ----------------------------------------------------

export interface Profile {
  id: string;
  name: string;
  /** Token referencing a colour bound by `[data-profile]` in index.css. */
  accent: string;
  unitSystem: UnitSystem;
  activeRoutineId?: string;
  lastBackupAt?: string;
  /** When true, bodyweight-only exercises pull the most recent
   * BodyweightLog entry as their per-rep load (so push-ups & co
   * actually count toward volume aggregates). */
  useBodyweightForVolume: boolean;
  createdAt: string;
}

export interface Barbell {
  id: string;
  profileId: string;
  name: string;
  weight: number;
  isDefault: boolean;
}

export interface PlateInventoryEntry {
  weight: number;
  count: number;
  color?: string;
}

export interface PlateInventory {
  id: string;
  profileId: string;
  plates: PlateInventoryEntry[];
}

// --- Exercises --------------------------------------------------------------

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  measurementType: MeasurementType;
  defaultRestSeconds: number;
  perSide: boolean;
  usesBarbell: boolean;
  isCustom: boolean;
  /** null for seed/built-in library entries; profile id otherwise. */
  profileId: string | null;
}

// --- Routine templates ------------------------------------------------------

export type BlockType = 'single' | 'superset';

export interface RepRange {
  min: number;
  max: number;
}

export interface DurationRange {
  /** Both in seconds. */
  min: number;
  max: number;
}

export interface PlannedExercise {
  exerciseId: string;
  setCount: number;
  reps?: RepRange;
  durationSeconds?: DurationRange;
  perSide?: boolean;
  notes?: string;
  /** Override the exercise's defaultRestSeconds for this slot. */
  restSeconds?: number;
}

export interface Block {
  type: BlockType;
  exercises: PlannedExercise[];
  /** Session-only flag — set when the user marks this block as skipped
   * mid-workout. Has no meaning on routine templates. */
  skipped?: boolean;
}

export type DayKind = 'workout' | 'rest';

export interface DayTemplate {
  dayNumber: number;
  kind: DayKind;
  /** "A" / "B" / "C" / etc. when `kind === 'workout'`. */
  workoutLabel?: string;
  warmups?: string[];
  activations?: string[];
  blocks: Block[];
}

export interface WeekTemplate {
  weekNumber: number;
  days: DayTemplate[];
}

export interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  weeks: WeekTemplate[];
  /** True for built-in routines shipped via seed; immutable. */
  isSeed: boolean;
  /** null for seed entries; profile id otherwise. */
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Sessions + logs --------------------------------------------------------

export interface SessionTemplateRef {
  routineId: string;
  weekNumber: number;
  dayNumber: number;
}

export interface Session {
  id: string;
  profileId: string;
  templateRef?: SessionTemplateRef;
  /** UTC ISO 8601, set on Start. */
  startedAt: string;
  /** UTC ISO 8601, set on Finish. */
  completedAt: string | null;
  planName: string;
  notes?: string;
  /** Cached count of new PRs achieved this session. */
  prCount: number;
  /** Per-session plan. For templated sessions this starts as a snapshot
   * of the routine day's blocks; for free sessions it starts empty.
   * Mid-workout edits (add/swap/skip/add-set) mutate this in place so
   * the on-screen plan reflects what's actually being done, leaving
   * the source routine template untouched. */
  livePlan: Block[];
}

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  blockOrder: number;
  exerciseOrder: number;
  setNumber: number;
  setType: SetType;
  weight?: number;
  barWeight?: number;
  reps?: number;
  durationSeconds?: number;
  rpe?: number;
  notes?: string;
  side: 'left' | 'right' | null;
  prTypes: PRType[];
  completedAt: string;
}

export interface PRRecord {
  id: string;
  profileId: string;
  exerciseId: string;
  type: PRType;
  value: number;
  achievedAt: string;
  sessionId: string;
  setLogId: string;
}

// --- Bodyweight log ---------------------------------------------------------

export interface BodyweightLog {
  id: string;
  profileId: string;
  weight: number;
  /** YYYY-MM-DD in user's local date. */
  date: string;
  notes?: string;
}

// --- Helpers ----------------------------------------------------------------

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
