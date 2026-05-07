// Mood + energy snapshot helpers. Pure — no React, no Dexie. The
// before/after deltas computed here power the Progress-screen
// "average mood lift" pills and (later) the insights pipeline.
//
// The 5-point scale runs 1 (worst) to 5 (best) so deltas read
// intuitively: positive = the workout improved things.

/** Single source of truth for the rating scale. The first entry is
 * scale value 1, the last is 5. Used by both the prompt UI and any
 * post-hoc reporting that wants a label. */
export const RATING_EMOJI = ['😞', '🙁', '😐', '🙂', '😊'] as const;
export const RATING_LABELS = ['Awful', 'Low', 'Meh', 'Good', 'Great'] as const;
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export type RatingValue = (typeof RATING_VALUES)[number];

export interface WellbeingSnapshot {
  moodBefore: number | null;
  moodAfter: number | null;
  energyBefore: number | null;
  energyAfter: number | null;
}

/** Convenience adapter from Session-row optional fields → snapshot. */
export function snapshotFromSession(session: {
  moodBefore?: number | undefined;
  moodAfter?: number | undefined;
  energyBefore?: number | undefined;
  energyAfter?: number | undefined;
}): WellbeingSnapshot {
  return {
    moodBefore: session.moodBefore ?? null,
    moodAfter: session.moodAfter ?? null,
    energyBefore: session.energyBefore ?? null,
    energyAfter: session.energyAfter ?? null,
  };
}

/** mood-after − mood-before, or null when either side is missing. */
export function moodDelta(s: WellbeingSnapshot): number | null {
  if (s.moodBefore === null || s.moodAfter === null) return null;
  return s.moodAfter - s.moodBefore;
}

export function energyDelta(s: WellbeingSnapshot): number | null {
  if (s.energyBefore === null || s.energyAfter === null) return null;
  return s.energyAfter - s.energyBefore;
}

/** Average lift over a window. Filters out snapshots that don't have
 * both sides — returns `null` when nothing qualifies (so the UI can
 * render a friendly empty state instead of a meaningless 0). */
export function averageMoodLift(
  sessions: readonly WellbeingSnapshot[],
): number | null {
  return averageDelta(sessions, moodDelta);
}

export function averageEnergyLift(
  sessions: readonly WellbeingSnapshot[],
): number | null {
  return averageDelta(sessions, energyDelta);
}

function averageDelta(
  sessions: readonly WellbeingSnapshot[],
  getter: (s: WellbeingSnapshot) => number | null,
): number | null {
  let sum = 0;
  let n = 0;
  for (const s of sessions) {
    const d = getter(s);
    if (d === null) continue;
    sum += d;
    n += 1;
  }
  return n === 0 ? null : sum / n;
}

/** True when the snapshot has any data at all (used to decide whether
 * to render the read-only Wellbeing card). */
export function hasAnyRating(s: WellbeingSnapshot): boolean {
  return (
    s.moodBefore !== null ||
    s.moodAfter !== null ||
    s.energyBefore !== null ||
    s.energyAfter !== null
  );
}
