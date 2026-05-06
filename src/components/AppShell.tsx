import { Navigate, Outlet } from 'react-router-dom';
import { useActiveProfile } from '../state/activeProfile';
import { SEED_PROFILES } from '../seed/profiles';
import { TabBar } from './TabBar';
import { ThemeToggle } from './ThemeToggle';

const ACCENT_DOT: Record<string, string> = {
  'profile-josh': 'bg-profile-josh',
  'profile-partner': 'bg-profile-partner',
};

export function AppShell() {
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);

  if (!activeProfileId) {
    return <Navigate to="/" replace />;
  }

  const profile = SEED_PROFILES.find((p) => p.id === activeProfileId);
  if (!profile) {
    // Stale id — boot back to the picker.
    setActiveProfileId(null);
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={() => setActiveProfileId(null)}
          className="flex min-h-[48px] items-center gap-2 rounded-md px-2 -mx-2 hover:bg-slate-100 dark:hover:bg-slate-900"
          aria-label={`Switch profile (current: ${profile.name})`}
        >
          <span
            aria-hidden
            className={[
              'inline-block h-3 w-3 rounded-full',
              ACCENT_DOT[profile.accent] ?? 'bg-slate-400',
            ].join(' ')}
          />
          <span className="text-sm font-medium">{profile.name}</span>
        </button>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <Outlet />
      </main>

      <TabBar />
    </div>
  );
}
