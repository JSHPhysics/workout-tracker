// Thin wrapper around the Wake Lock API (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
// Not all browsers expose `navigator.wakeLock` (older Safari, Firefox);
// in those cases all calls are no-ops. Wake locks are also released
// automatically when the tab becomes hidden, so this module re-acquires
// on `visibilitychange` while a lock is "wanted".

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
let wanted = false;

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
  if (document.visibilityState === 'visible' && wanted && !current) {
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
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    wanted = true;
    ensureListener();
    void acquire();
    return () => {
      wanted = false;
      void release();
    };
  }, [active]);
}
