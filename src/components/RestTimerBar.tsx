import { useEffect, useRef, useState } from 'react';
import { useRestTimer } from '../state/restTimer';
import { useWakeLock } from '../lib/wakeLock';
import { cueRestEnd } from '../lib/cue';
import { CircularProgress } from './CircularProgress';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${pad(s)}` : `${s}s`;
}

/**
 * Sticky rest-timer bar. Mounts globally inside Session and stays
 * visible while the timer is running, paused, or just-ended (so the
 * user gets the cue + a chance to dismiss). Rendered as `null` when
 * idle to free up the DOM and the bottom inset.
 */
export function RestTimerBar() {
  const status = useRestTimer((s) => s.status);
  const deadline = useRestTimer((s) => s.deadline);
  const pausedRemaining = useRestTimer((s) => s.pausedRemaining);
  const totalMs = useRestTimer((s) => s.totalMs);
  const label = useRestTimer((s) => s.label);
  const extend = useRestTimer((s) => s.extend);
  const pause = useRestTimer((s) => s.pause);
  const resume = useRestTimer((s) => s.resume);
  const end = useRestTimer((s) => s.end);
  const dismiss = useRestTimer((s) => s.dismiss);

  const [now, setNow] = useState(() => Date.now());

  // Tick at ~10fps while running — smooth enough for a countdown ring.
  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [status]);

  // Re-sync immediately when the tab comes back from being hidden.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const remaining =
    status === 'running' && deadline !== null
      ? Math.max(0, deadline - now)
      : status === 'paused' && pausedRemaining !== null
        ? pausedRemaining
        : 0;

  // Trigger the end cue once when the running countdown reaches zero.
  // Using a ref so React's strict-mode double-render doesn't fire it twice.
  const cueFired = useRef(false);
  useEffect(() => {
    if (status === 'running' && remaining <= 0 && !cueFired.current) {
      cueFired.current = true;
      cueRestEnd();
      end();
    }
    if (status === 'idle' || status === 'paused') {
      cueFired.current = false;
    }
  }, [status, remaining, end]);

  // Auto-dismiss the "ended" state after a few seconds so the bar
  // doesn't loiter once the user has had time to react.
  useEffect(() => {
    if (status !== 'ended') return;
    const id = window.setTimeout(() => dismiss(), 8000);
    return () => window.clearTimeout(id);
  }, [status, dismiss]);

  // Hold the screen wake lock while the rest timer is running.
  useWakeLock(status === 'running');

  if (status === 'idle') return null;

  const progress =
    totalMs > 0
      ? status === 'ended'
        ? 1
        : 1 - remaining / totalMs
      : 0;

  const isEnded = status === 'ended';
  const isPaused = status === 'paused';

  return (
    <div
      className="fixed inset-x-0 z-30 px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          'mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-3 py-2 shadow-lift backdrop-blur',
          isEnded
            ? 'border-accent/60 bg-accent text-accent-fg'
            : 'border-line bg-surface/95 text-fg',
        ].join(' ')}
      >
        <CircularProgress
          progress={progress}
          size={48}
          stroke={4}
          trackClassName={isEnded ? 'text-accent-fg/30' : 'text-line'}
          fillClassName={isEnded ? 'text-accent-fg' : 'text-accent'}
          ariaLabel={
            isEnded ? 'Rest done' : `${formatRemaining(remaining)} remaining`
          }
        >
          <span className="font-mono text-[0.7rem] tabular-nums">
            {isEnded ? '✓' : formatRemaining(remaining)}
          </span>
        </CircularProgress>

        <div className="flex flex-1 flex-col">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em]">
            {isEnded ? 'Rest done' : isPaused ? 'Rest paused' : 'Resting'}
          </span>
          {label && (
            <span
              className={[
                'truncate text-xs',
                isEnded ? 'text-accent-fg/80' : 'text-fg-muted',
              ].join(' ')}
            >
              {label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!isEnded && (
            <button
              type="button"
              onClick={() => extend(30)}
              className={[
                'flex h-9 min-w-[2.5rem] items-center justify-center rounded-full px-2 text-[0.7rem] font-medium tracking-wide transition',
                isPaused
                  ? 'bg-surface-soft text-fg hover:bg-surface-elevated'
                  : 'bg-surface-soft text-fg hover:bg-surface-elevated',
              ].join(' ')}
              title="Add 30 seconds"
              aria-label="Add 30 seconds"
            >
              +30s
            </button>
          )}
          {!isEnded && (
            <button
              type="button"
              onClick={isPaused ? resume : pause}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-fg transition hover:bg-surface-elevated"
              aria-label={isPaused ? 'Resume rest' : 'Pause rest'}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? '▶' : '❚❚'}
            </button>
          )}
          <button
            type="button"
            onClick={isEnded ? dismiss : end}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-full transition',
              isEnded
                ? 'bg-accent-fg/10 text-accent-fg hover:bg-accent-fg/20'
                : 'bg-surface-soft text-fg hover:bg-surface-elevated',
            ].join(' ')}
            aria-label={isEnded ? 'Dismiss' : 'Skip rest'}
            title={isEnded ? 'Dismiss' : 'Skip'}
          >
            {isEnded ? '✕' : '⏭'}
          </button>
        </div>
      </div>
    </div>
  );
}
