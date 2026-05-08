// Thin wrapper around the Wake Lock API
// (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
// Not all browsers expose `navigator.wakeLock` (older Safari, Firefox);
// in those cases all calls are no-ops. Wake locks are also released
// automatically when the tab becomes hidden, so this module re-acquires
// on `visibilitychange` while at least one consumer wants the lock.
//
// Multiple consumers can hold the lock simultaneously — the rest timer
// holds it while running, the AppShell holds it while the user has the
// "keep screen on" preference enabled, etc. We ref-count: the lock is
// released only when *every* consumer's effect has cleaned up. Without
// the counter, the rest timer ending would tear the lock out from under
// the AppShell-held one.

import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(event: 'release', cb: () => void): void;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function api(): WakeLockApi | null {
  const nav = navigator as unknown as { wakeLock?: WakeLockApi };
  return nav.wakeLock ?? null;
}

let current: WakeLockSentinelLike | null = null;
/** How many `useWakeLock(true)` effects are currently mounted. The
 * lock is desired while this is > 0, and released when it falls back
 * to 0. */
let wanters = 0;

async function acquire(): Promise<void> {
  const w = api();
  if (!w || current) return;
  try {
    const sentinel = await w.request('screen');
    sentinel.addEventListener('release', () => {
      // Browser auto-released (e.g. tab hidden). Drop our handle so a
      // re-acquire works the next time the tab becomes visible.
      if (current === sentinel) current = null;
    });
    current = sentinel;
  } catch {
    // Permission denied / unavailable. Best-effort — workout flow
    // still works without a wake lock.
  }
}

async function release(): Promise<void> {
  const sentinel = current;
  current = null;
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      // ignore
    }
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && wanters > 0 && !current) {
    void acquire();
  }
}

let listenerAttached = false;
function ensureListener(): void {
  if (listenerAttached) return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  listenerAttached = true;
}

/**
 * React hook — keeps the screen awake while `active` is true. Releases
 * automatically when `active` flips to false or the component unmounts.
 * Multiple consumers can hold the lock simultaneously; the underlying
 * `WakeLockSentinel` is only released when every consumer's effect
 * has cleaned up (ref-counted).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    wanters += 1;
    ensureListener();
    void acquire();
    return () => {
      wanters = Math.max(0, wanters - 1);
      if (wanters === 0) {
        void release();
      }
    };
  }, [active]);
}
