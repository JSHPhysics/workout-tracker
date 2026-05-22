// Storage-persistence helper. By default a browser treats a site's
// IndexedDB as "best-effort" and may silently evict it to reclaim disk
// under storage pressure — which is how a user's whole profile can
// vanish without them clearing anything. `navigator.storage.persist()`
// asks the browser to mark this origin "persistent", exempting it from
// that automatic eviction. On Chromium the grant is decided silently
// from engagement heuristics (no prompt); on Firefox it may prompt once.

import { useEffect, useState } from 'react';

export type PersistStatus = 'persisted' | 'best-effort' | 'unsupported';

/** Whether the StorageManager persistence API is available. */
function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.persist === 'function' &&
    typeof navigator.storage.persisted === 'function'
  );
}

/** Ask the browser to make this origin's storage persistent. Idempotent
 * and safe to call on every boot: if already granted, `persisted()`
 * short-circuits so we never re-prompt. Returns the resulting status and
 * never throws. */
export async function requestPersistentStorage(): Promise<PersistStatus> {
  if (!supported()) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    const granted = await navigator.storage.persist();
    return granted ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/** Read the current status WITHOUT requesting (no prompt, no heuristic
 * grant). For surfacing state in the UI. Never throws. */
export async function getPersistStatus(): Promise<PersistStatus> {
  if (!supported()) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/** React hook for the Settings UI. `undefined` while the async check is
 * in flight, then the status. Bump `nonce` to re-check (e.g. after a
 * manual "Protect" tap re-requests the grant). */
export function usePersistStatus(nonce = 0): PersistStatus | undefined {
  const [status, setStatus] = useState<PersistStatus | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getPersistStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  return status;
}
