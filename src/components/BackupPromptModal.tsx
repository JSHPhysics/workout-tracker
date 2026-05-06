import { useState } from 'react';
import {
  backupFilename,
  buildBackup,
  markBackedUp,
} from '../db/backup';
import { saveBackup } from '../lib/backupIo';
import { relativeBackupLabel } from './BackupSection';
import type { Profile } from '../types';

interface Props {
  profile: Profile;
  /** Called whether the user backs up or skips. */
  onClose: () => void;
}

/** Shown after a workout finishes when the profile's backup is stale.
 * One tap to save (uses the auto-backup file silently when set,
 * downloads otherwise), or "Later" to dismiss. */
export function BackupPromptModal({ profile, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const backup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const envelope = await buildBackup({ profileId: profile.id });
      const filename = backupFilename(envelope, profile.name);
      const result = await saveBackup(envelope, filename);
      await markBackedUp(envelope.exportedAt, profile.id);
      setDone(
        result.via === 'fs-access'
          ? `Saved to ${result.filename}.`
          : `Downloaded ${result.filename}.`,
      );
    } catch (err) {
      setDone(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Backup reminder"
      className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 px-5 py-10 backdrop-blur sm:items-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-lift">
        <header className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-accent">
            Stay safe
          </span>
          <h2 className="font-display text-2xl font-light leading-tight">
            Back up now?
          </h2>
          <p className="text-sm text-fg-muted">
            Last backup: {relativeBackupLabel(profile.lastBackupAt)}.
            IndexedDB can be cleared without warning.
          </p>
        </header>

        {done && <p className="text-xs text-fg-muted">{done}</p>}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            {done ? 'Close' : 'Later'}
          </button>
          {!done && (
            <button
              type="button"
              onClick={backup}
              disabled={busy}
              autoFocus
              className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Back up'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
