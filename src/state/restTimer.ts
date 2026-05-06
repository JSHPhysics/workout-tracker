import { create } from 'zustand';

// Rest timer state. Wall-clock based — `deadline` is `Date.now() +
// remaining ms`, never decremented by a tick. The component reads
// remaining = deadline − now() each frame, so backgrounding the tab
// doesn't cause drift. When paused, we stash the remaining ms instead
// of the deadline.

export type RestTimerStatus = 'idle' | 'running' | 'paused' | 'ended';

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
}

interface Actions {
  start: (seconds: number, label?: string) => void;
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
};

export const useRestTimer = create<State & Actions>((set, get) => ({
  ...initial,
  start: (seconds, label) => {
    if (seconds <= 0) return;
    const ms = Math.round(seconds * 1000);
    set({
      status: 'running',
      deadline: Date.now() + ms,
      pausedRemaining: null,
      totalMs: ms,
      label: label ?? null,
    });
  },
  extend: (seconds) => {
    const s = get();
    const addMs = Math.round(seconds * 1000);
    if (s.status === 'running' && s.deadline !== null) {
      set({ deadline: s.deadline + addMs, totalMs: s.totalMs + addMs });
    } else if (s.status === 'paused' && s.pausedRemaining !== null) {
      set({
        pausedRemaining: s.pausedRemaining + addMs,
        totalMs: s.totalMs + addMs,
      });
    } else if (s.status === 'ended') {
      // Allow "+30s" after a finished cue to re-arm the timer.
      set({
        status: 'running',
        deadline: Date.now() + addMs,
        pausedRemaining: null,
        totalMs: addMs,
      });
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
