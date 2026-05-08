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
  'stretching',
  'other',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EQUIPMENT_TAGS = [
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
] as const;
export type EquipmentTag = (typeof EQUIPMENT_TAGS)[number];

export const EQUIPMENT_LABELS: Record<EquipmentTag, string> = {
  'bodyweight': 'Bodyweight',
  'barbell': 'Barbell + plates',
  'dumbbells': 'Dumbbells',
  'kettlebell': 'Kettlebell',
  'bench': 'Bench',
  'pull-up-bar': 'Pull-up bar',
  'cable-machine': 'Cable machine',
  'resistance-bands': 'Resistance bands',
  'glute-bridge-pad': 'Hip thrust pad',
  'foam-roller': 'Foam roller',
  'yoga-mat': 'Yoga mat',
  'medicine-ball': 'Medicine ball',
  'box': 'Plyo box / step',
  'machine': 'Selectorised machine',
};

export const MEASUREMENT_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'time_seconds',
  'distance',
  'reps_each_side',
  /** Walking — duration (in seconds, displayed as minutes) plus an
   * optional step count. Doesn't contribute to weight×reps volume or
   * PR detection; tracked separately for cardio aggregates. */
  'walking',
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const SET_TYPES = ['working', 'warmup', 'drop', 'failure', 'amrap'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const PR_TYPES = ['weight', 'reps_at_weight', 'e1rm', 'session_volume'] as const;
export type PRType = (typeof PR_TYPES)[number];

// --- Profile + equipment ----------------------------------------------------

/** Theme tokens. Each value resolves to a `[data-theme="..."]` selector
 * in index.css that re-binds the surface + accent CSS variables. New
 * themes go here and in index.css together. */
export const THEMES = [
  'emerald',
  'teal',
  'sky',
  'indigo',
  'violet',
  'fuchsia',
  'rose',
  'ember',
  'amber',
  'slate',
] as const;
export type Theme = (typeof THEMES)[number];

/** Human-readable labels for the theme picker. Kept short — they sit
 * alongside a colour swatch and don't need to be self-explanatory. */
export const THEME_LABELS: Record<Theme, string> = {
  emerald: 'Emerald',
  teal: 'Teal',
  sky: 'Sky',
  indigo: 'Indigo',
  violet: 'Violet',
  fuchsia: 'Fuchsia',
  rose: 'Rose',
  ember: 'Ember',
  amber: 'Amber',
  slate: 'Slate',
};

/** Hex previews used by the theme picker (the live theme rebinds CSS
 * variables, but the picker tile needs a literal swatch colour). */
export const THEME_SWATCHES: Record<Theme, string> = {
  emerald: '#22c55e',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  rose: '#c52f63',
  ember: '#ef4444',
  amber: '#f59e0b',
  slate: '#64748b',
};

/** Biological sex, captured at profile creation. Drives sensible
 * defaults for period tracking + barbell choice; can be left
 * undefined (existing legacy profiles, or users who prefer not to
 * answer — both surfaces remain manually editable in Settings). */
export type Sex = 'female' | 'male';

export interface Profile {
  id: string;
  name: string;
  /** Theme token — see {@link THEMES}. Resolves to `[data-theme="..."]`
   * in index.css. */
  theme: Theme;
  /** Optional. When set to 'female', new profiles get period tracking
   * on by default and the women's 15 kg bar set as default; otherwise
   * the Olympic 20 kg bar is the default. Independent of theme. */
  sex?: Sex;
  unitSystem: UnitSystem;
  activeRoutineId?: string;
  lastBackupAt?: string;
  /** When true, bodyweight-only exercises pull the most recent
   * BodyweightLog entry as their per-rep load (so push-ups & co
   * actually count toward volume aggregates). */
  useBodyweightForVolume: boolean;
  /** When true, the period/cycle tracking surfaces are visible: the
   * Today-screen day/phase chip, the Mood & Energy chart phase bands,
   * and per-PR-row phase chips. Per-profile and opt-in by default. */
  periodTrackingEnabled: boolean;
  /** When true, the app holds a Screen Wake Lock for as long as it's
   * the foregrounded tab — the device won't dim or sleep mid-workout.
   * Auto-released by the browser when the tab backgrounds; we
   * re-acquire on visibilitychange. Per-profile so a household device
   * can have different preferences. */
  keepScreenOn: boolean;
  /** What's in the user's gym. Drives the exercise picker filter:
   * exercises whose `requiredEquipment` aren't fully covered by
   * this list are hidden by default. Empty list = "I have nothing,
   * show me bodyweight only". `bodyweight` is implicit but we still
   * persist it so the picker filter reads cleanly. */
  equipment: EquipmentTag[];
  /** Percentages used by the warm-up generator on the session screen.
   * Each entry is a percent of the user-supplied target working weight;
   * order is the order the warm-up sets are pre-logged in. Default
   * `[30, 45, 60]` (3 sets at 30 / 45 / 60 % of target). Editable in
   * Settings → Preferences; weights snap to 2.5 kg. */
  warmupPercentages: number[];
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
  /** Equipment that has to be available for this exercise. Empty
   * implies bodyweight-only; an entry of `'bodyweight'` is fine but
   * redundant. The picker filter requires every tag in this list to
   * be present in the user's `Profile.equipment`. */
  requiredEquipment: EquipmentTag[];
  /** Numbered "how to" steps surfaced in the exercise detail sheet.
   * Optional — exercises without instructions just show a friendly
   * placeholder. */
  instructions?: string[];
  /** Slug into the static SVG diagram library (see
   * `src/components/ExerciseDiagram.tsx`). When unset or unknown the
   * detail sheet shows the brand placeholder. */
  diagram?: string;
  /** Optional external "watch a demo" URL. Currently used to deep-link
   * into spotebi.com's exercise guide pages — they have animated
   * demonstrations that are far better than our line-art placeholders.
   * The detail sheet renders this as a "Watch demo ↗" link. */
  demoUrl?: string;
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
  /** Warm-up sets generated by the in-session "+ Warm-ups" affordance,
   * occupying setNumbers 1..N. These are *suggested* weights/reps —
   * the row renders un-ticked with these as the stepper defaults, and
   * the user taps tick to commit them as a real SetLog (with
   * `setType: 'warmup'`). Stored on the live plan rather than
   * pre-logged so undoing a tick falls back to the suggested values
   * instead of the autofill working weight. */
  warmupSets?: { weight: number; reps: number }[];
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
  /** 1–5 ratings captured at session start (pre-workout prompt).
   * Optional — the user can skip the prompt or fill in later from
   * the read-only session view. */
  moodBefore?: number;
  energyBefore?: number;
  /** 1–5 ratings captured on Finish (post-workout prompt). */
  moodAfter?: number;
  energyAfter?: number;
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
  /** Step count, currently used by walking-type exercises. Optional —
   * a walk logged purely by duration leaves this unset. */
  steps?: number;
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

// --- Period log -------------------------------------------------------------

export interface PeriodLog {
  id: string;
  profileId: string;
  /** YYYY-MM-DD in user's local date — first day of the period. */
  startDate: string;
  /** YYYY-MM-DD — last day of the period. Optional; when set, the
   * cycle phase calculator uses this as the menstrual-phase end. */
  endDate?: string;
  notes?: string;
}

export const CYCLE_PHASES = [
  'menstrual',
  'follicular',
  'ovulation',
  'luteal',
] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

export const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

/** Subtle palette tuned to read on both light and dark surfaces and
 * across both profile accents. Used for the Mood & Energy chart
 * phase bands and the per-PR-row chips. */
export const CYCLE_PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual: '#fb7185',
  follicular: '#10b981',
  ovulation: '#f59e0b',
  luteal: '#8b5cf6',
};

// --- Helpers ----------------------------------------------------------------

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
