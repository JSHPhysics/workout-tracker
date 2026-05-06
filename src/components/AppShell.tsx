import { Navigate, Outlet } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { SEED_PROFILES } from '../seed/profiles';
import { TabBar } from './TabBar';
import { ThemeToggle } from './ThemeToggle';

const ACCENT_DOT: Record<string, string> = {
  'profile-josh': 'bg-profile-josh',
  'profile-hayley': 'bg-profile-hayley',
};

export function AppShell() {
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);

  if (!activeProfileId) {
    return <Navigate to="/" replace />;
  }

  const profile = SEED_PROFILES.find((p) => p.id === activeProfileId);
  if (!profile) {
    setActiveProfileId(null);
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-full flex-col bg-cream-50 text-cream-900 dark:bg-cream-950 dark:text-cream-100">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-cream-200/70 bg-cream-50/80 px-5 py-3 backdrop-blur dark:border-cream-800/70 dark:bg-cream-950/80"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={() => setActiveProfileId(null)}
          className="-mx-2 flex min-h-[48px] items-center gap-2.5 rounded-xl px-2 transition hover:bg-cream-100 dark:hover:bg-cream-900"
          aria-label={`Switch profile (current: ${profile.name})`}
        >
          <span
            aria-hidden
            className={[
              'inline-block h-2.5 w-2.5 rounded-full',
              ACCENT_DOT[profile.accent] ?? 'bg-cream-400',
            ].join(' ')}
          />
          <span className="font-display text-base font-medium tracking-tight">
            {profile.name}
          </span>
        </button>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-8">
        <Outlet />
      </main>

      <TabBar />
    </div>
  );
}
