import { Link } from 'react-router-dom';
import { staleness } from './BackupSection';
import type { Profile } from '../types';

/** Subtle banner shown when the active profile's backup is over a
 * week old. Sits beneath the header on every screen. Hidden when
 * fresh (≤ 7 days). */
export function BackupNagBanner({ profile }: { profile: Profile }) {
  const stale = staleness(profile.lastBackupAt);
  if (stale.severity === 'fresh') return null;

  const message =
    stale.severity === 'urgent'
      ? "Backup's over a month old."
      : "Backup's over a week old.";

  return (
    <Link
      to="/settings"
      className={[
        'block border-b px-5 py-2 text-center text-[0.7rem] font-medium uppercase tracking-[0.16em] transition',
        stale.severity === 'urgent'
          ? 'border-accent/30 bg-accent-soft text-accent hover:bg-accent/15'
          : 'border-line bg-surface-soft text-fg-muted hover:text-fg',
      ].join(' ')}
    >
      {message}{' '}
      <span aria-hidden className="ml-1">
        →
      </span>{' '}
      Back up
    </Link>
  );
}
