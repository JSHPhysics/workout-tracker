import { useSyncExternalStore } from 'react';

// Persistent flag that surfaces normally-hidden developer affordances
// (currently: the synthetic-history seeder + the exercise review tool)
// inside the deployed/production app. Gated by a constant activation
// code so the wife's casual snooping doesn't accidentally flip it on.
//
// This is *not* security. The code lives in the JS bundle and anyone
// reading the source could find it — that's fine. The point is to be
// a soft, intentional gate so the dev surface stays out of the way
// for non-dev users without forcing me to run `pnpm dev` locally to
// audit data on the deployed PWA.
//
// When `import.meta.env.DEV` is true (local Vite dev server) the dev
// tools are always visible regardless — this flag only matters in
// production builds.

const STORAGE_KEY = 'wt:dev-mode';
/** Stored verbatim. Case-sensitive. Whitespace trimmed before compare. */
const ACTIVATION_CODE = 'TANK';

function readStored(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

let enabled: boolean = readStored();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** Try to enable dev mode with the supplied code. Returns true when
 * the code matched (state flips to enabled and listeners fire); false
 * when it didn't (state unchanged). */
export function tryUnlockDevMode(code: string): boolean {
  if (code.trim() !== ACTIVATION_CODE) return false;
  if (!enabled) {
    enabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '1');
    }
    notify();
  }
  return true;
}

export function disableDevMode(): void {
  if (!enabled) return;
  enabled = false;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  notify();
}

export function isDevModeEnabled(): boolean {
  return enabled;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive: re-renders when dev mode toggles. */
export function useDevMode(): boolean {
  return useSyncExternalStore(subscribe, isDevModeEnabled, isDevModeEnabled);
}
