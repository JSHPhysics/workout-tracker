import { useEffect, useRef, useState } from 'react';
import {
  backupFilename,
  buildBackup,
  importBackup,
  markBackedUp,
} from '../db/backup';
import {
  autoBackupFilename,
  chooseAutoBackupFile,
  clearAutoBackupHandle,
  fsAccessSupported,
  readBackupFile,
  saveBackup,
} from '../lib/backupIo';
import { parseBackup } from '../domain/backup-format';
import {
  requestPersistentStorage,
  usePersistStatus,
} from '../lib/persistentStorage';
import type { Profile } from '../types';

interface Props {
  profile: Profile;
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const FULL_DATE = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function staleness(
  lastBackupAt: string | undefined,
  now: Date = new Date(),
): { days: number; severity: 'fresh' | 'stale' | 'urgent' } {
  if (!lastBackupAt) return { days: Infinity, severity: 'urgent' };
  const ms = now.getTime() - Date.parse(lastBackupAt);
  const days = ms / 86_400_000;
  if (days > 30) return { days, severity: 'urgent' };
  if (days > 7) return { days, severity: 'stale' };
  return { days, severity: 'fresh' };
}

export function relativeBackupLabel(lastBackupAt: string | undefined): string {
  if (!lastBackupAt) return 'Never';
  const days = (Date.now() - Date.parse(lastBackupAt)) / 86_400_000;
  if (days < 1) return RELATIVE.format(-Math.round(days * 24), 'hour');
  if (days < 30) return RELATIVE.format(-Math.round(days), 'day');
  return FULL_DATE.format(new Date(lastBackupAt));
}

export function BackupSection({ profile }: Props) {
  const [autoFile, setAutoFile] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'pick' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // Storage-persistence grant. `persistNonce` bumps after a manual
  // "Protect" tap so the hook re-reads the (possibly newly granted)
  // status. A user-gesture request also tends to fare better with
  // Chromium's grant heuristics than the silent boot attempt.
  const [persistNonce, setPersistNonce] = useState(0);
  const persistStatus = usePersistStatus(persistNonce);

  const protectStorage = async () => {
    await requestPersistentStorage();
    setPersistNonce((n) => n + 1);
  };

  // Refresh the auto-backup display whenever the profile changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const name = await autoBackupFilename();
      if (!cancelled) setAutoFile(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const exportNow = async () => {
    if (busy) return;
    setBusy('export');
    setMessage(null);
    try {
      const envelope = await buildBackup({ profileId: profile.id });
      const filename = backupFilename(envelope, profile.name);
      const result = await saveBackup(envelope, filename);
      await markBackedUp(envelope.exportedAt, profile.id);
      setMessage(
        result.via === 'fs-access'
          ? `Saved to ${result.filename}.`
          : `Downloaded ${result.filename}.`,
      );
    } catch (err) {
      setMessage(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const pickAutoFile = async () => {
    if (busy) return;
    setBusy('pick');
    setMessage(null);
    try {
      const envelope = await buildBackup({ profileId: profile.id });
      const suggested = backupFilename(envelope, profile.name);
      const name = await chooseAutoBackupFile(suggested);
      // Write the envelope into the picked file immediately so the
      // first save isn't a no-op.
      const result = await saveBackup(envelope, suggested);
      await markBackedUp(envelope.exportedAt, profile.id);
      setAutoFile(name);
      setMessage(
        result.via === 'fs-access'
          ? `Auto-backup set to ${name}.`
          : `Saved (auto-backup not supported in this browser).`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (!/abort/i.test(msg)) setMessage(`Pick failed: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const clearAutoFile = async () => {
    await clearAutoBackupHandle();
    setAutoFile(null);
    setMessage('Auto-backup target cleared.');
  };

  const onImportClick = async () => {
    if (busy) return;
    setMessage(null);
    if (fsAccessSupported()) {
      setBusy('import');
      try {
        const file = await readBackupFile();
        if (!file) {
          setBusy(null);
          return;
        }
        await consumeImportFile(file);
      } finally {
        setBusy(null);
      }
    } else {
      importInputRef.current?.click();
    }
  };

  const consumeImportFile = async (file: File) => {
    if (
      !window.confirm(
        `Restore from ${file.name}? This wipes the current local data first.`,
      )
    ) {
      return;
    }
    setBusy('import');
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const parsed = parseBackup(json);
      if (!parsed.ok) {
        setMessage(`Import failed: ${parsed.reason}`);
        return;
      }
      const result = await importBackup(parsed.envelope);
      setMessage(
        `Imported. ${result.counts.sessions} sessions, ${result.counts.setLogs} sets, ${result.prRecomputed} PRs recomputed.`,
      );
    } catch (err) {
      setMessage(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const stale = staleness(profile.lastBackupAt);
  const fsSupported = fsAccessSupported();

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-medium tracking-tight">
          Backup
        </h2>
        <p className="text-xs text-fg-muted">
          IndexedDB can be cleared by the browser. The JSON file is your
          insurance.
        </p>
      </header>

      <article
        className={[
          'flex flex-col gap-3 rounded-2xl border p-4 shadow-soft',
          stale.severity === 'urgent'
            ? 'border-accent/40 bg-accent-soft'
            : stale.severity === 'stale'
              ? 'border-line bg-surface-soft/40'
              : 'border-line bg-surface',
        ].join(' ')}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-fg-muted">
            Last backup
          </span>
          <span className="text-xs tabular-nums text-fg">
            {relativeBackupLabel(profile.lastBackupAt)}
          </span>
        </div>
        {stale.severity !== 'fresh' && (
          <p className="text-xs text-fg-muted">
            {stale.severity === 'urgent'
              ? "It's been over a month — back up now."
              : 'Your last backup is over a week old.'}
          </p>
        )}

        {autoFile && (
          <div className="flex items-baseline justify-between gap-2 rounded-xl bg-surface-soft px-3 py-2">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
              Auto-backup file
            </span>
            <span className="truncate text-xs tabular-nums text-fg">
              {autoFile}
            </span>
          </div>
        )}

        {persistStatus && persistStatus !== 'unsupported' && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-fg-muted">
                Storage protection
              </span>
              <span className="text-xs text-fg-muted">
                {persistStatus === 'persisted'
                  ? "On — the browser won't evict this app's data to reclaim space."
                  : 'Best-effort — data may be evicted under storage pressure.'}
              </span>
            </div>
            {persistStatus === 'persisted' ? (
              <span
                aria-label="Storage protection is on"
                className="shrink-0 text-sm text-accent"
              >
                ✓
              </span>
            ) : (
              <button
                type="button"
                onClick={protectStorage}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg transition hover:border-line-strong disabled:opacity-50"
              >
                Protect
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportNow}
            disabled={busy !== null}
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'export' ? 'Exporting…' : autoFile ? 'Save backup' : 'Export now'}
          </button>
          <button
            type="button"
            onClick={onImportClick}
            disabled={busy !== null}
            className="rounded-full border border-line px-4 py-2 text-xs text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === 'import' ? 'Importing…' : 'Import…'}
          </button>
          {fsSupported && (
            autoFile ? (
              <button
                type="button"
                onClick={clearAutoFile}
                disabled={busy !== null}
                className="rounded-full border border-line px-4 py-2 text-[0.7rem] uppercase tracking-[0.14em] text-fg-faint transition hover:text-accent disabled:opacity-50"
              >
                Forget file
              </button>
            ) : (
              <button
                type="button"
                onClick={pickAutoFile}
                disabled={busy !== null}
                className="rounded-full border border-line px-4 py-2 text-[0.7rem] uppercase tracking-[0.14em] text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {busy === 'pick' ? 'Picking…' : 'Set auto-backup file'}
              </button>
            )
          )}
        </div>
        {!fsSupported && (
          <p className="text-[0.65rem] text-fg-faint">
            This browser doesn't support silent auto-saves. Export
            triggers a download you save where you'd like.
          </p>
        )}
        {message && (
          <p className="text-xs text-fg-muted">{message}</p>
        )}
      </article>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void consumeImportFile(f);
          e.target.value = '';
        }}
      />
    </section>
  );
}
