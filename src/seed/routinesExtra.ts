// Hand-written routine templates beyond Strong Curves. The Strong
// Curves seed is generated from a spreadsheet; these are written
// directly because their structure is simpler and their authors
// haven't published machine-readable source.
//
// All exercise ids referenced here must exist in either
// STRONG_CURVES_EXERCISES or the COMPOUND_EXERCISES / STRETCHING_EXERCISES
// arrays in [exercisesExtra.ts](./exercisesExtra.ts).

import type {
  Block,
  DayTemplate,
  PlannedExercise,
  RoutineTemplate,
  WeekTemplate,
} from '../types';

type RoutineSeed = Omit<RoutineTemplate, 'profileId' | 'createdAt' | 'updatedAt'>;

// --- Helpers ---------------------------------------------------------------

function single(...exercises: PlannedExercise[]): Block {
  return { type: 'single', exercises };
}

function workout(
  dayNumber: number,
  workoutLabel: string,
  blocks: Block[],
): DayTemplate {
  return { dayNumber, kind: 'workout', workoutLabel, blocks };
}

function rest(dayNumber: number): DayTemplate {
  return { dayNumber, kind: 'rest', blocks: [] };
}

// --- Mobility & Recovery ---------------------------------------------------

const mobilityDay = (dayNumber: number): DayTemplate =>
  workout(dayNumber, 'M', [
    single({ exerciseId: 'stretch-cat-cow', setCount: 1, durationSeconds: { min: 30, max: 45 } }),
    single({ exerciseId: 'stretch-downward-dog', setCount: 1, durationSeconds: { min: 30, max: 45 } }),
    single({ exerciseId: 'foam-roll-quads', setCount: 2, durationSeconds: { min: 30, max: 60 }, perSide: true }),
    single({ exerciseId: 'foam-roll-lats', setCount: 2, durationSeconds: { min: 30, max: 60 }, perSide: true }),
    single({ exerciseId: 'stretch-hip-flexor-kneeling', setCount: 2, durationSeconds: { min: 30, max: 45 }, perSide: true }),
    single({ exerciseId: 'stretch-hamstring-supine', setCount: 2, durationSeconds: { min: 30, max: 45 }, perSide: true }),
    single({ exerciseId: 'stretch-figure-four', setCount: 2, durationSeconds: { min: 30, max: 45 }, perSide: true }),
    single({ exerciseId: 'stretch-pigeon', setCount: 2, durationSeconds: { min: 30, max: 60 }, perSide: true }),
    single({ exerciseId: 'stretch-tspine-rotation', setCount: 2, durationSeconds: { min: 20, max: 30 }, perSide: true }),
    single({ exerciseId: 'stretch-child-pose', setCount: 1, durationSeconds: { min: 45, max: 60 } }),
  ]);

const MOBILITY_RECOVERY: RoutineSeed = {
  id: 'mobility-recovery',
  name: 'Mobility & Recovery',
  description:
    "A short stretching + foam-rolling sequence for between hard sessions or as a standalone recovery day. About 15 minutes; do as many days a week as you'd like.",
  isSeed: true,
  weeks: [
    { weekNumber: 1, days: [mobilityDay(1)] },
  ],
};

// --- Starting Strength (Mark Rippetoe, simplified linear-progression) ------
//
// 3-day-a-week alternating Workout A / Workout B. We model 3 weeks so
// the routine browser has a useful preview, but it's a linear
// progression — the user is expected to add weight every session, not
// follow week numbers literally.

function ssWorkoutA(dayNumber: number): DayTemplate {
  return workout(dayNumber, 'A', [
    single({
      exerciseId: 'barbell-back-squat',
      setCount: 3,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-bench-press',
      setCount: 3,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-deadlift',
      setCount: 1,
      reps: { min: 5, max: 5 },
      restSeconds: 240,
    }),
  ]);
}

function ssWorkoutB(dayNumber: number): DayTemplate {
  return workout(dayNumber, 'B', [
    single({
      exerciseId: 'barbell-back-squat',
      setCount: 3,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-overhead-press',
      setCount: 3,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'pull-up',
      setCount: 3,
      reps: { min: 5, max: 10 },
      restSeconds: 180,
    }),
  ]);
}

const STARTING_STRENGTH: RoutineSeed = {
  id: 'starting-strength',
  name: 'Starting Strength',
  description:
    "Mark Rippetoe's beginner barbell programme. Three 5×3 compound sessions a week, alternating Workout A and B. Add 2.5–5 kg every session for as long as you can. Three weeks shown — the programme runs until linear progress stalls, then transitions to intermediate work. Pull-ups stand in for the original power-clean to keep the equipment list short.",
  isSeed: true,
  weeks: ((): WeekTemplate[] => {
    const weeks: WeekTemplate[] = [];
    for (let w = 1; w <= 3; w++) {
      const days: DayTemplate[] =
        w % 2 === 1
          ? [
              ssWorkoutA(1),
              rest(2),
              ssWorkoutB(3),
              rest(4),
              ssWorkoutA(5),
              rest(6),
              rest(7),
            ]
          : [
              ssWorkoutB(1),
              rest(2),
              ssWorkoutA(3),
              rest(4),
              ssWorkoutB(5),
              rest(6),
              rest(7),
            ];
      weeks.push({ weekNumber: w, days });
    }
    return weeks;
  })(),
};

// --- 5/3/1 Boring But Big (Jim Wendler) ------------------------------------
//
// 4-week wave: 65/75/85% for 5/5/5+, 70/80/90% for 3/3/3+, 75/85/95%
// for 5/3/1+, then a deload at 40/50/60% for 5/5/5. Followed by 5x10
// of the same lift at 50–60% (the "Boring But Big" template).
//
// Recommended programme is a 4-day split: Day 1 Press, Day 2
// Deadlift, Day 3 Bench, Day 4 Squat, with assistance work supplied
// by BBB + a row. Rep ranges in the editor reflect the *target*; the
// percentages need a 1RM on hand and are noted in the description.

function fivethreeoneDay(
  dayNumber: number,
  label: string,
  mainId: string,
  bbbId: string,
  topReps: { min: number; max: number },
): DayTemplate {
  return workout(dayNumber, label, [
    single({
      exerciseId: mainId,
      setCount: 3,
      reps: topReps,
      restSeconds: 180,
    }),
    single({
      exerciseId: bbbId,
      setCount: 5,
      reps: { min: 10, max: 10 },
      restSeconds: 90,
    }),
    single({
      exerciseId: 'barbell-bent-over-row',
      setCount: 5,
      reps: { min: 10, max: 10 },
      restSeconds: 60,
    }),
  ]);
}

function fivethreeoneWeek(
  weekNumber: number,
  topReps: { min: number; max: number },
): WeekTemplate {
  return {
    weekNumber,
    days: [
      fivethreeoneDay(1, 'OHP', 'barbell-overhead-press', 'barbell-overhead-press', topReps),
      rest(2),
      fivethreeoneDay(3, 'DL', 'barbell-deadlift', 'barbell-deadlift', topReps),
      rest(4),
      fivethreeoneDay(5, 'BP', 'barbell-bench-press', 'barbell-bench-press', topReps),
      rest(6),
      fivethreeoneDay(7, 'SQ', 'barbell-back-squat', 'barbell-back-squat', topReps),
    ],
  };
}

const FIVETHREEONE_BBB: RoutineSeed = {
  id: 'five-three-one-bbb',
  name: '5/3/1 Boring But Big',
  description:
    "Jim Wendler's intermediate programme. Four-day split (Press / Deadlift / Bench / Squat) over a 4-week wave: 5s, 3s, 5/3/1+, deload. Each main lift session is followed by 5×10 (Boring But Big) of the same lift at 50–60% of your training max, plus a rowing accessory. Set targets shown — the percentage prescriptions live in your training-max calculator.",
  isSeed: true,
  weeks: [
    fivethreeoneWeek(1, { min: 5, max: 5 }),
    fivethreeoneWeek(2, { min: 3, max: 3 }),
    fivethreeoneWeek(3, { min: 1, max: 5 }),
    fivethreeoneWeek(4, { min: 5, max: 5 }), // deload — same target reps but lighter loads
  ],
};

// --- StrongLifts 5×5 ------------------------------------------------------
//
// Mehdi's beginner barbell programme. 3 days/week alternating Workout A
// and Workout B; add 2.5 kg/session (1.25 kg on the press). Two-week
// cycle so the routine browser shows the full A-B-A → B-A-B alternation.

function slWorkoutA(dayNumber: number): DayTemplate {
  return workout(dayNumber, 'A', [
    single({
      exerciseId: 'barbell-back-squat',
      setCount: 5,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-bench-press',
      setCount: 5,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-bent-over-row',
      setCount: 5,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
  ]);
}

function slWorkoutB(dayNumber: number): DayTemplate {
  return workout(dayNumber, 'B', [
    single({
      exerciseId: 'barbell-back-squat',
      setCount: 5,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-overhead-press',
      setCount: 5,
      reps: { min: 5, max: 5 },
      restSeconds: 180,
    }),
    single({
      exerciseId: 'barbell-deadlift',
      setCount: 1,
      reps: { min: 5, max: 5 },
      restSeconds: 240,
    }),
  ]);
}

const STRONGLIFTS_5X5: RoutineSeed = {
  id: 'stronglifts-5x5',
  name: 'StrongLifts 5×5',
  description:
    "Mehdi's beginner barbell programme. Three sessions a week alternating Workout A (Squat / Bench / Row) and Workout B (Squat / OHP / Deadlift). Every set is 5 reps; add 2.5 kg every session (1.25 kg on the press) for as long as the bar moves. Two weeks shown so the A-B-A → B-A-B alternation reads clearly — keep going until the linear progression stalls, then deload 10% and re-attempt.",
  isSeed: true,
  weeks: [
    {
      weekNumber: 1,
      days: [
        slWorkoutA(1),
        rest(2),
        slWorkoutB(3),
        rest(4),
        slWorkoutA(5),
        rest(6),
        rest(7),
      ],
    },
    {
      weekNumber: 2,
      days: [
        slWorkoutB(1),
        rest(2),
        slWorkoutA(3),
        rest(4),
        slWorkoutB(5),
        rest(6),
        rest(7),
      ],
    },
  ],
};

// --- r/flexibility "Starting to Stretch" ----------------------------------
//
// Beginner full-body flexibility programme, 2-3×/week, ~30 minutes.
// 10 stretches: 5 upper body + 5 lower body, "bump and hold" method
// (gently easing into each stretch, holding ~60 seconds, breathing
// deeply). Per-side stretches are noted; the picker doubles them up
// because PlannedExercise.perSide is set on the stretch itself.

const STARTING_TO_STRETCH_DAY: DayTemplate = workout(1, 'S', [
  // Upper body
  single({
    exerciseId: 'stretch-shoulder-backbend',
    setCount: 1,
    durationSeconds: { min: 45, max: 60 },
  }),
  single({
    exerciseId: 'stretch-standing-backbend',
    setCount: 1,
    durationSeconds: { min: 45, max: 60 },
  }),
  single({
    exerciseId: 'stretch-rear-hand-clasp',
    setCount: 1,
    durationSeconds: { min: 45, max: 60 },
    perSide: true,
  }),
  single({
    exerciseId: 'stretch-lying-cross',
    setCount: 1,
    durationSeconds: { min: 45, max: 60 },
    perSide: true,
  }),
  single({
    exerciseId: 'stretch-wrist-biceps',
    setCount: 1,
    durationSeconds: { min: 30, max: 45 },
  }),
  // Lower body
  single({
    exerciseId: 'stretch-one-leg-pike',
    setCount: 1,
    durationSeconds: { min: 60, max: 90 },
    perSide: true,
  }),
  single({
    exerciseId: 'stretch-hip-flexor-kneeling',
    setCount: 1,
    durationSeconds: { min: 60, max: 90 },
    perSide: true,
  }),
  single({
    exerciseId: 'stretch-pancake',
    setCount: 1,
    durationSeconds: { min: 60, max: 120 },
  }),
  single({
    exerciseId: 'stretch-butterfly',
    setCount: 1,
    durationSeconds: { min: 60, max: 90 },
  }),
  single({
    exerciseId: 'stretch-calf',
    setCount: 1,
    durationSeconds: { min: 45, max: 60 },
    perSide: true,
  }),
]);

const STARTING_TO_STRETCH: RoutineSeed = {
  id: 'starting-to-stretch',
  name: 'Starting to Stretch',
  description:
    "The r/flexibility beginner full-body flexibility programme. Ten stretches — five upper body, five lower — using the bump-and-hold method: ease gently into each stretch, breathe deeply, hold around a minute. About 30 minutes total; 2–3 days/week is the sweet spot. Per-side stretches show one set in the planner — log it on each side.",
  isSeed: true,
  weeks: [
    { weekNumber: 1, days: [STARTING_TO_STRETCH_DAY] },
  ],
};

// --- Daily Walk -----------------------------------------------------------

const DAILY_WALK: RoutineSeed = {
  id: 'daily-walk',
  name: 'Daily Walk',
  description:
    'Single-block routine for tracking walks. Log duration, steps, or both — useful as a stand-alone or alongside lifting on rest days. Repeat the day as often as you like.',
  isSeed: true,
  weeks: [
    {
      weekNumber: 1,
      days: [
        workout(1, 'W', [
          single({
            exerciseId: 'walking',
            setCount: 1,
            durationSeconds: { min: 1500, max: 2700 }, // 25-45 min
          }),
        ]),
      ],
    },
  ],
};

// --- Public list -----------------------------------------------------------

export const EXTRA_ROUTINES: ReadonlyArray<RoutineSeed> = [
  MOBILITY_RECOVERY,
  STARTING_TO_STRETCH,
  DAILY_WALK,
  STARTING_STRENGTH,
  STRONGLIFTS_5X5,
  FIVETHREEONE_BBB,
];
