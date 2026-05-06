// Browser side of save/load: File System Access API where available
// (Chrome / Edge desktop), with a download/file-input fallback for
// Safari + Firefox + iOS.
//
// Persistent handles need IndexedDB to survive a reload — we stash
// them in a tiny dedicated DB rather than the app's main Dexie
// instance so backups never accidentally reference an opaque handle
// that ends up inside the JSON envelope.

const HANDLE_DB = 'workout-tracker-meta';
const HANDLE_STORE = 'fs-handles';
const HANDLE_KEY = 'auto-backup';

export interface SaveResult {
  /** Where the file ended up: 'fs-access' for the silent FS-handle path,
   * 'download' for the browser download fallback. */
  via: 'fs-access' | 'download';
  filename: string;
}

interface FileSystemFileHandleWithPermissions {
  queryPermission?(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  name: string;
}

interface ShowSaveFilePicker {
  (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandleWithPermissions>;
}

interface ShowOpenFilePicker {
  (opts: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandleWithPermissions[]>;
}

function fsAccessAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown })
      .showSaveFilePicker === 'function'
  );
}

export function fsAccessSupported(): boolean {
  return fsAccessAvailable();
}

// --- Tiny IDB helpers for handle persistence -------------------------------

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readHandle(): Promise<FileSystemFileHandleWithPermissions | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    req.onsuccess = () =>
      resolve((req.result as FileSystemFileHandleWithPermissions) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeHandle(
  handle: FileSystemFileHandleWithPermissions | null,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = handle ? store.put(handle, HANDLE_KEY) : store.delete(HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --- Public API ------------------------------------------------------------

/** Whether an auto-backup file handle is currently set up. */
export async function hasAutoBackupHandle(): Promise<boolean> {
  const h = await readHandle();
  return h !== null;
}

/** Returns the user-facing filename of the saved auto-backup target,
 * or null when nothing is set. */
export async function autoBackupFilename(): Promise<string | null> {
  const h = await readHandle();
  return h?.name ?? null;
}

/** Prompt the user once to choose a backup file. The handle is kept in
 * IndexedDB so subsequent saves go silently to the same file. Throws
 * when the user cancels. */
export async function chooseAutoBackupFile(
  suggestedName: string,
): Promise<string> {
  if (!fsAccessAvailable()) {
    throw new Error('File System Access API is not available in this browser');
  }
  const picker = (window as unknown as { showSaveFilePicker: ShowSaveFilePicker })
    .showSaveFilePicker;
  const handle = await picker({
    suggestedName,
    types: [
      {
        description: 'Workout Tracker backup',
        accept: { 'application/json': ['.json'] },
      },
    ],
  });
  await writeHandle(handle);
  return handle.name;
}

/** Forget the auto-backup handle (the file isn't deleted). */
export async function clearAutoBackupHandle(): Promise<void> {
  await writeHandle(null);
}

/** Save a backup envelope. Tries the auto-backup handle silently
 * first, then a fresh FS-Access save dialog if the handle is gone /
 * permission denied, then a download as a last resort. */
export async function saveBackup(
  envelope: unknown,
  suggestedName: string,
): Promise<SaveResult> {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });

  if (fsAccessAvailable()) {
    const handle = await readHandle();
    if (handle) {
      const granted = await ensurePermission(handle, 'readwrite');
      if (granted) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { via: 'fs-access', filename: handle.name };
      }
    }
  }

  // Download fallback. Works everywhere; clears the URL after one tick.
  triggerDownload(blob, suggestedName);
  return { via: 'download', filename: suggestedName };
}

/** Open a backup file. Uses the FS Access picker when available,
 * otherwise resolves once the caller resolves the returned promise
 * by handing in a `File`. */
export async function readBackupFile(): Promise<File | null> {
  if (fsAccessAvailable()) {
    const picker = (window as unknown as { showOpenFilePicker: ShowOpenFilePicker })
      .showOpenFilePicker;
    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          {
            description: 'Workout Tracker backup',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      if (!handle) return null;
      const fileMethod = (
        handle as unknown as { getFile(): Promise<File> }
      ).getFile;
      return await fileMethod.call(handle);
    } catch (err) {
      // User cancel throws AbortError — surface as null.
      if ((err as DOMException)?.name === 'AbortError') return null;
      throw err;
    }
  }
  return null; // caller falls back to a hidden <input type=file>
}

// --- Internals -------------------------------------------------------------

async function ensurePermission(
  handle: FileSystemFileHandleWithPermissions,
  mode: 'readwrite' | 'read',
): Promise<boolean> {
  const cur = (await handle.queryPermission?.({ mode })) ?? 'granted';
  if (cur === 'granted') return true;
  const next = (await handle.requestPermission?.({ mode })) ?? cur;
  return next === 'granted';
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click finishes triggering the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
