// Pure formatter that turns a finished session + its set logs into a
// short human-readable summary, ready to drop into WhatsApp / Discord
// / Snapchat / etc. via the OS share sheet (or clipboard fallback).
//
// Design notes:
// - Plain text only. Works everywhere; no rendering surprises across
//   apps. Light emoji use for pulse + PR markers.
// - Skips warm-up sets — nobody flexes their warm-ups.
// - Skips exercises the user planned but didn't actually log a set
//   for. The summary represents what got *done*, not what was on the
//   page.
// - Tiny, framework-free, fully unit-tested. The button component
//   wraps it with the share / clipboard glue separately.

import type { Exercise, Session, SetLog, UnitSystem } from '../types';

export interface ShareInput {
  session: Session;
  setLogs: readonly SetLog[];
  exercises: Map<string, Exercise>;
  unitSystem: UnitSystem;
  /** Optional public URL of the deployed app, appended as a footer.
   * Pass `null` (default) to omit. */
  appUrl?: string | null;
}

/** Format a finished session as a sharable plain-text summary. */
export function formatWorkoutSummary(input: ShareInput): string {
  const { session, setLogs, exercises, unitSystem, appUrl } = input;

  const lines: string[] = [];

  // --- Header ---------------------------------------------------------
  const date = new Date(session.startedAt);
  const dateStr = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  lines.push(`${session.planName} · ${dateStr}`);

  // --- Stats line -----------------------------------------------------
  const stats: string[] = [];
  const durationMs = session.completedAt
    ? Date.parse(session.completedAt) - Date.parse(session.startedAt)
    : 0;
  if (durationMs > 0) stats.push(formatDuration(durationMs));
  const volume = totalVolume(setLogs);
  if (volume > 0) stats.push(`${formatVolume(volume, unitSystem)} volume`);
  if (session.prCount > 0) {
    stats.push(`${session.prCount} PR${session.prCount === 1 ? '' : 's'} ✨`);
  }
  if (stats.length > 0) lines.push(stats.join(' · '));

  // --- Exercise lines -------------------------------------------------
  // Group set logs by (blockOrder, exerciseOrder) so we present them in
  // the order the user actually performed the workout, regardless of
  // which exercise they tapped tick on first within a slot.
  const grouped = groupByPosition(setLogs);
  if (grouped.length > 0) lines.push('');
  for (const group of grouped) {
    const exercise = exercises.get(group.exerciseId);
    if (!exercise) continue;
    const display = formatGroup(group, exercise, unitSystem);
    if (display !== null) lines.push(display);
  }

  // --- Footer ---------------------------------------------------------
  if (appUrl) {
    lines.push('');
    lines.push(`Workout Tracker · ${appUrl}`);
  }

  return lines.join('\n');
}

// --- Internals --------------------------------------------------------

interface SetGroup {
  blockOrder: number;
  exerciseOrder: number;
  exerciseId: string;
  sets: SetLog[];
}

function groupByPosition(setLogs: readonly SetLog[]): SetGroup[] {
  const map = new Map<string, SetGroup>();
  for (const s of setLogs) {
    const key = `${s.blockOrder}-${s.exerciseOrder}`;
    let g = map.get(key);
    if (!g) {
      g = {
        blockOrder: s.blockOrder,
        exerciseOrder: s.exerciseOrder,
        exerciseId: s.exerciseId,
        sets: [],
      };
      map.set(key, g);
    }
    g.sets.push(s);
  }
  // Sort outer by (blockOrder, exerciseOrder); inner by setNumber.
  const groups = Array.from(map.values()).sort(
    (a, b) =>
      a.blockOrder - b.blockOrder || a.exerciseOrder - b.exerciseOrder,
  );
  for (const g of groups) {
    g.sets.sort((a, b) => a.setNumber - b.setNumber);
  }
  return groups;
}

function formatGroup(
  group: SetGroup,
  exercise: Exercise,
  unitSystem: UnitSystem,
): string | null {
  const nonWarmups = group.sets.filter((s) => s.setType !== 'warmup');
  if (nonWarmups.length === 0) return null;
  const summary = formatSets(nonWarmups, exercise, unitSystem);
  return `${exercise.name}: ${summary}`;
}

function formatSets(
  sets: readonly SetLog[],
  exercise: Exercise,
  unitSystem: UnitSystem,
): string {
  const measurement = exercise.measurementType;
  const parts: string[] = [];
  for (const s of sets) {
    parts.push(formatSingleSet(s, measurement, unitSystem));
  }
  return parts.join(', ');
}

function formatSingleSet(
  s: SetLog,
  measurement: Exercise['measurementType'],
  unitSystem: UnitSystem,
): string {
  const isPr = s.prTypes.length > 0;
  const star = isPr ? ' ✨' : '';
  switch (measurement) {
    case 'weight_reps':
    case 'reps_each_side': {
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      const unit = unitSystem === 'lb' ? 'lb' : 'kg';
      return `${formatWeight(w)}${unit} × ${r}${star}`;
    }
    case 'bodyweight_reps': {
      const r = s.reps ?? 0;
      return `× ${r}${star}`;
    }
    case 'time_seconds': {
      const d = s.durationSeconds ?? 0;
      return `${formatSeconds(d)}${star}`;
    }
    case 'walking': {
      const parts: string[] = [];
      if (s.durationSeconds && s.durationSeconds > 0) {
        parts.push(formatSeconds(s.durationSeconds));
      }
      if (s.steps && s.steps > 0) parts.push(`${s.steps.toLocaleString()} steps`);
      return parts.length > 0 ? `${parts.join(' / ')}${star}` : `walked${star}`;
    }
    case 'distance':
    default: {
      // Generic fallback — show whichever metric is present.
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      if (w > 0 && r > 0) return `${formatWeight(w)}kg × ${r}${star}`;
      if (r > 0) return `× ${r}${star}`;
      return `set${star}`;
    }
  }
}

function formatWeight(w: number): string {
  return w % 1 === 0 ? `${w}` : w.toFixed(1);
}

function formatSeconds(total: number): string {
  // Plank-style holds are usually < 2min — read better as plain
  // seconds ("60s", "90s") than as minutes. Above that, minutes
  // become more legible.
  if (total < 120) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (secs === 0) return `${mins}min`;
  return `${mins}m${secs}s`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function totalVolume(setLogs: readonly SetLog[]): number {
  let total = 0;
  for (const s of setLogs) {
    // Skip warmups; they shouldn't pad the headline number.
    if (s.setType === 'warmup') continue;
    const w = s.weight ?? 0;
    const r = s.reps ?? 0;
    if (w > 0 && r > 0) total += w * r;
  }
  return total;
}

function formatVolume(v: number, unitSystem: UnitSystem): string {
  const unit = unitSystem === 'lb' ? 'lb' : 'kg';
  // Use thousands separators; round to nearest whole unit (decimals
  // are noise at this scale).
  return `${Math.round(v).toLocaleString('en-GB')} ${unit}`;
}
