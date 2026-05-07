// Synthetic-data utility for chart development. Wipes and repopulates
// the active profile's session history with a deterministic 12-week
// arc — ascending working weights, occasional rest days, mixed
// barbell + bodyweight + time-based work.
//
// Surfaced as a button in Settings (only visible in dev). Never call
// this against real data.

import { db } from './db';
import { finishSession } from './sessions';
import { logSet } from './setLogs';
import { createSession } from './sessions';
import type { Block, Exercise, SetType } from '../types';

interface PickedExercise {
  exercise: Exercise;
  reps: number;
  startWeight: number; // kg
  weeklyAdd: number; // kg added per week
  setCount: number;
  isWarmup?: boolean;
}

function pickWorkoutTemplate(exercises: Exercise[]): PickedExercise[] {
  const find = (matcher: (e: Exercise) => boolean): Exercise | undefined =>
    exercises.find(matcher);

  const sq =
    find((e) => /squat/i.test(e.name) && e.usesBarbell) ??
    exercises.find((e) => e.usesBarbell);
  const bp =
    find((e) => /bench press/i.test(e.name) && e.usesBarbell) ??
    exercises.find((e) => e.usesBarbell && e.id !== sq?.id);
  const dl =
    find((e) => /deadlift/i.test(e.name) && e.usesBarbell) ??
    exercises.find(
      (e) => e.usesBarbell && e.id !== sq?.id && e.id !== bp?.id,
    );
  const hipThrust =
    find((e) => /hip thrust/i.test(e.name)) ??
    find((e) => e.primaryMuscles.includes('glutes') && e.usesBarbell);
  const row =
    find((e) => /row/i.test(e.name) && e.usesBarbell) ??
    find((e) => e.primaryMuscles.includes('back') && e.usesBarbell);
  const plank = find(
    (e) => /plank/i.test(e.name) || e.measurementType === 'time_seconds',
  );

  const picks: PickedExercise[] = [];
  if (sq) picks.push({ exercise: sq, reps: 5, startWeight: 60, weeklyAdd: 2.5, setCount: 3 });
  if (bp) picks.push({ exercise: bp, reps: 5, startWeight: 40, weeklyAdd: 1.25, setCount: 3 });
  if (dl) picks.push({ exercise: dl, reps: 5, startWeight: 80, weeklyAdd: 2.5, setCount: 2 });
  if (hipThrust && hipThrust.id !== sq?.id)
    picks.push({ exercise: hipThrust, reps: 8, startWeight: 50, weeklyAdd: 2.5, setCount: 3 });
  if (row && row.id !== bp?.id)
    picks.push({ exercise: row, reps: 8, startWeight: 35, weeklyAdd: 1.25, setCount: 3 });
  if (plank && plank.measurementType === 'time_seconds')
    picks.push({ exercise: plank, reps: 0, startWeight: 0, weeklyAdd: 0, setCount: 2 });

  return picks;
}

interface SyntheticOptions {
  /** Inclusive number of past weeks to populate. Default 12. */
  weeks?: number;
  /** Days per week to train. Default 3 (Mon/Wed/Fri pattern). */
  daysPerWeek?: number;
  /** RNG seed for deterministic output. */
  seed?: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Wipe sessions/setLogs/PRs for the active profile and seed a
 * 12-week deterministic training history. Returns the number of
 * sessions created. */
export async function seedSyntheticHistory(
  profileId: string,
  options: SyntheticOptions = {},
): Promise<number> {
  const weeks = options.weeks ?? 12;
  const daysPerWeek = options.daysPerWeek ?? 3;
  const rand = lcg(options.seed ?? 42);

  const exercises = await db.exercises.toArray();
  if (exercises.length === 0) {
    throw new Error('Cannot seed synthetic data: exercise library is empty');
  }
  const picks = pickWorkoutTemplate(exercises);
  if (picks.length === 0) {
    throw new Error('Could not pick a workout template from the exercise library');
  }

  // Wipe existing data scoped to this profile so other profile is untouched.
  await db.transaction(
    'rw',
    [db.sessions, db.setLogs, db.prRecords],
    async () => {
      const existing = await db.sessions.where({ profileId }).toArray();
      for (const sess of existing) {
        await db.setLogs.where({ sessionId: sess.id }).delete();
      }
      await db.sessions.where({ profileId }).delete();
      await db.prRecords.where({ profileId }).delete();
    },
  );

  // 3 days/week → Mon (1), Wed (3), Fri (5). 4 days/week add Sat (6).
  const dayOffsets = (() => {
    const base = [1, 3, 5];
    if (daysPerWeek >= 4) base.push(6);
    if (daysPerWeek >= 5) base.push(2);
    if (daysPerWeek <= 2) base.length = daysPerWeek;
    return base.slice(0, daysPerWeek);
  })();

  // Walk back from today to weeks ago. Use last Sunday as anchor.
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - dayOfWeek);
  lastSunday.setHours(0, 0, 0, 0);

  // Routines named alternating A/B/C through the week so the
  // "volume by routine label" chart has data to show.
  const labels = ['Lower A', 'Upper A', 'Lower B', 'Upper B'];

  let sessionCount = 0;

  for (let weekIdx = 0; weekIdx < weeks; weekIdx++) {
    // weekIdx 0 = oldest (most weeks ago); weeks-1 = current week.
    const weeksAgo = weeks - 1 - weekIdx;
    for (let d = 0; d < dayOffsets.length; d++) {
      const dayOffset = dayOffsets[d]!;
      const sessionDay = new Date(lastSunday);
      sessionDay.setDate(lastSunday.getDate() - 7 * weeksAgo + dayOffset);
      // Don't create future sessions (in case current-week day is later).
      if (sessionDay > today) continue;

      // Vary start time so calendar-day rollovers behave naturally.
      sessionDay.setHours(17, Math.floor(rand() * 30), 0, 0);
      const startedAt = sessionDay.toISOString();

      const planName = labels[d % labels.length]!;
      const livePlan: Block[] = picks.map((p) => ({
        type: 'single',
        exercises: [
          {
            exerciseId: p.exercise.id,
            setCount: p.setCount,
            reps: { min: p.reps, max: p.reps },
          },
        ],
      }));
      const sessionId = await createSession({
        profileId,
        planName,
        livePlan,
      });
      // Backdate startedAt — createSession stamps "now".
      await db.sessions.update(sessionId, { startedAt });

      // Log the sets in plan order. Add a small per-set jitter so
      // charts have texture rather than perfectly straight lines.
      let logTime = sessionDay.getTime();
      for (let bi = 0; bi < picks.length; bi++) {
        const p = picks[bi]!;
        for (let setNumber = 1; setNumber <= p.setCount; setNumber++) {
          logTime += 90_000 + Math.floor(rand() * 60_000);
          // Inject one warmup set on big lifts roughly every other workday
          const setType: SetType =
            setNumber === 1 && bi < 3 && rand() > 0.6 ? 'warmup' : 'working';
          if (p.exercise.measurementType === 'time_seconds') {
            await logSet({
              sessionId,
              exerciseId: p.exercise.id,
              blockOrder: bi,
              exerciseOrder: 0,
              setNumber,
              setType: 'working',
              durationSeconds: 30 + Math.floor(rand() * 30),
            });
          } else {
            const baseWeight = p.startWeight + p.weeklyAdd * weekIdx;
            const weight =
              setType === 'warmup'
                ? Math.max(20, Math.round(baseWeight * 0.5))
                : Math.round(baseWeight * 2) / 2; // snap to 0.5 kg
            const reps = setType === 'warmup' ? Math.min(p.reps, 8) : p.reps;
            await logSet({
              sessionId,
              exerciseId: p.exercise.id,
              blockOrder: bi,
              exerciseOrder: 0,
              setNumber,
              setType,
              weight,
              reps,
              ...(rand() > 0.5 ? { rpe: 6 + Math.floor(rand() * 5) * 0.5 } : {}),
            });
          }
          // Backdate the just-written setLog to keep history coherent.
          const last = await db.setLogs
            .where({ sessionId })
            .filter(
              (s) => s.blockOrder === bi && s.setNumber === setNumber,
            )
            .first();
          if (last) {
            await db.setLogs.update(last.id, {
              completedAt: new Date(logTime).toISOString(),
            });
          }
        }
      }

      // Finish the session — runs PR detection + stamps completedAt.
      // We then overwrite completedAt with the synthetic timestamp.
      await finishSession(sessionId);
      const finalTime = logTime + 60_000;
      // Synthetic mood + energy. Plausible-looking distributions:
      //   • Mood lifts about +0.6 on average (workouts are good for you).
      //   • Energy dips about -0.2 (fatigue), but with high variance.
      //   • Skip ~10% of sessions entirely (left undefined) so the chart
      //     also exercises the "missing data" rendering path.
      const skipWellbeing = rand() < 0.1;
      if (!skipWellbeing) {
        const moodBefore = clampRating(2.5 + (rand() - 0.5) * 2.5);
        const energyBefore = clampRating(2.8 + (rand() - 0.5) * 2.5);
        const moodAfter = clampRating(moodBefore + 0.6 + (rand() - 0.5) * 1.5);
        const energyAfter = clampRating(
          energyBefore - 0.2 + (rand() - 0.5) * 1.8,
        );
        await db.sessions.update(sessionId, {
          completedAt: new Date(finalTime).toISOString(),
          moodBefore,
          energyBefore,
          moodAfter,
          energyAfter,
        });
      } else {
        await db.sessions.update(sessionId, {
          completedAt: new Date(finalTime).toISOString(),
        });
      }
      sessionCount += 1;
    }
  }

  return sessionCount;
}

/** Round to nearest integer, clamp 1..5. */
function clampRating(v: number): number {
  return Math.min(5, Math.max(1, Math.round(v)));
}

/** Reference to the seed loader so the active routine can stay
 * sensible after wiping. */
export async function clearSessionData(profileId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.setLogs, db.prRecords],
    async () => {
      const sessions = await db.sessions.where({ profileId }).toArray();
      for (const sess of sessions) {
        await db.setLogs.where({ sessionId: sess.id }).delete();
      }
      await db.sessions.where({ profileId }).delete();
      await db.prRecords.where({ profileId }).delete();
    },
  );
}

