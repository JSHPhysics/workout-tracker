import { create } from 'zustand';
import { setPreferredRest } from '../db/exerciseRestPrefs';
import { setPreferredHold } from '../db/exerciseHoldPrefs';

// Rest timer state. Wall-clock based — `deadline` is `Date.now() +
// remaining ms`, never decremented by a tick. The component reads
// remaining = deadline − now() each frame, so backgrounding the tab
// doesn't cause drift. When paused, we stash the remaining ms instead
// of the deadline.

export type RestTimerStatus = 'idle' | 'running' | 'paused' | 'ended';

/** What the running countdown represents. 'rest' is the after-set rest
 * cue; 'hold' is a duration timer the user starts for a time-based
 * exercise (a stretch hold, plank, dead hang). Drives the bar's wording
 * only — the countdown/cue machinery is identical. */
export type RestTimerKind = 'rest' | 'hold';

/** Identifies which exercise the running rest belongs to. When set,
 * adjustments via +/- 30s are persisted as the user's preferred rest
 * for that (profile, exercise) and recalled next session. Cleared on
 * dismiss. */
export interface RestTimerContext {
  profileId: string;
  exerciseId: string;
}

interface State {
  status: RestTimerStatus;
  /** Wall-clock ms when timer ends. null when paused or idle. */
  deadline: number | null;
  /** Remaining ms when paused. null otherwise. */
  pausedRemaining: number | null;
  /** Configured total in ms — for ring progress and label. */
  totalMs: number;
  /** Optional label shown on the bar (e.g. "After Bench Press · Set 2"). */
  label: string | null;
  /** Context for persistence-on-adjust. null when the timer was
   * started without an exercise scope (e.g. standalone Timers screen). */
  context: RestTimerContext | null;
  /** Whether this countdown is an after-set rest or an active hold. */
  kind: RestTimerKind;
}

interface Actions {
  start: (
    seconds: number,
    label?: string,
    context?: RestTimerContext,
    kind?: RestTimerKind,
  ) => void;
  /** Add `seconds` to the running total. Negative values shorten — the
   * total clamps at 0. When a context is set, the new total is
   * persisted as the user's preferred rest for that exercise. */
  extend: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  /** Mark the timer as ended (used internally + by Skip). */
  end: () => void;
  dismiss: () => void;
}

const initial: State = {
  status: 'idle',
  deadline: null,
  pausedRemaining: null,
  totalMs: 0,
  label: null,
  context: null,
  kind: 'rest',
};

/** Persist the new total to per-exercise prefs, routed by kind so a
 * hold adjustment writes the hold memory and a rest adjustment writes
 * the rest memory — never crossing the streams. Fire-and-forget; the
 * timer keeps running regardless of whether the write resolves. */
function persistTotal(
  context: RestTimerContext | null,
  kind: RestTimerKind,
  totalMs: number,
) {
  if (!context) return;
  const seconds = Math.round(totalMs / 1000);
  if (seconds <= 0) return;
  if (kind === 'hold') {
    void setPreferredHold(context.profileId, context.exerciseId, seconds);
  } else {
    void setPreferredRest(context.profileId, context.exerciseId, seconds);
  }
}

export const useRestTimer = create<State & Actions>((set, get) => ({
  ...initial,
  start: (seconds, label, context, kind) => {
    if (seconds <= 0) return;
    const ms = Math.round(seconds * 1000);
    set({
      status: 'running',
      deadline: Date.now() + ms,
      pausedRemaining: null,
      totalMs: ms,
      label: label ?? null,
      context: context ?? null,
      kind: kind ?? 'rest',
    });
  },
  extend: (seconds) => {
    const s = get();
    const addMs = Math.round(seconds * 1000);
    if (s.status === 'running' && s.deadline !== null) {
      const newTotal = Math.max(0, s.totalMs + addMs);
      const newDeadline = Math.max(Date.now(), s.deadline + addMs);
      set({ deadline: newDeadline, totalMs: newTotal });
      persistTotal(s.context, s.kind, newTotal);
    } else if (s.status === 'paused' && s.pausedRemaining !== null) {
      const newTotal = Math.max(0, s.totalMs + addMs);
      const newRemaining = Math.max(0, s.pausedRemaining + addMs);
      set({ pausedRemaining: newRemaining, totalMs: newTotal });
      persistTotal(s.context, s.kind, newTotal);
    } else if (s.status === 'ended') {
      // Allow "+30s" after a finished cue to re-arm the timer.
      // Negative deltas in this state are no-ops — there's nothing to
      // shorten.
      if (addMs <= 0) return;
      set({
        status: 'running',
        deadline: Date.now() + addMs,
        pausedRemaining: null,
        totalMs: addMs,
      });
      // Deliberately NOT persisting here. "+30s after Rest done"
      // means "give me a brief extension this time", not "shrink the
      // saved rest for this exercise forever". The previous version
      // wrote `addMs` (e.g. 30 s) through `persistTotal`, which
      // permanently rewired the per-exercise pref to whatever the
      // user tapped post-rest — surfacing as "the rest timer ignores
      // my default and barely pops up before disappearing".
    }
  },
  pause: () => {
    const s = get();
    if (s.status !== 'running' || s.deadline === null) return;
    const remaining = Math.max(0, s.deadline - Date.now());
    set({ status: 'paused', deadline: null, pausedRemaining: remaining });
  },
  resume: () => {
    const s = get();
    if (s.status !== 'paused' || s.pausedRemaining === null) return;
    set({
      status: 'running',
      deadline: Date.now() + s.pausedRemaining,
      pausedRemaining: null,
    });
  },
  end: () => {
    set({ status: 'ended', deadline: null, pausedRemaining: null });
  },
  dismiss: () => {
    set({ ...initial });
  },
}));
