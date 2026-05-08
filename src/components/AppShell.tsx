import { Navigate, Outlet } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { useProfile } from '../db/profiles';
import { useWakeLock } from '../lib/wakeLock';
import { BackupNagBanner } from './BackupNag';
import { TabBar } from './TabBar';
import { ThemeToggle } from './ThemeToggle';
import { THEME_SWATCHES } from '../types';

export function AppShell() {
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);
  const profile = useProfile(activeProfileId);

  // Keep the screen on for the entire AppShell lifetime when the
  // profile has the toggle enabled. The Rest Timer / Timers screen
  // also call useWakeLock — the lock is ref-counted so they coexist
  // without one releasing it from under the other.
  useWakeLock(profile?.keepScreenOn ?? false);

  if (!activeProfileId) {
    return <Navigate to="/" replace />;
  }

  if (profile === undefined) {
    return <div className="flex min-h-full flex-col bg-bg" />;
  }

  if (profile === null) {
    setActiveProfileId(null);
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-bg/80 px-5 py-3 backdrop-blur"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={() => setActiveProfileId(null)}
          className="-mx-2 flex min-h-[48px] items-center gap-2.5 rounded-xl px-2 transition hover:bg-surface-soft"
          aria-label={`Switch profile (current: ${profile.name})`}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: THEME_SWATCHES[profile.theme] ?? '#8a8377',
            }}
          />
          <span className="font-display text-base font-medium tracking-tight">
            {profile.name}
          </span>
        </button>
        <ThemeToggle />
      </header>

      <BackupNagBanner profile={profile} />

      <main className="flex-1 overflow-y-auto px-5 py-8">
        <Outlet />
      </main>

      <TabBar />
    </div>
  );
}
