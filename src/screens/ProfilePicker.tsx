import { useNavigate } from 'react-router-dom';
import { SEED_PROFILES } from '../seed/profiles';
import { useActiveProfile } from '../state/activeProfile';
import { ThemeToggle } from '../components/ThemeToggle';

const ACCENT_BG: Record<string, string> = {
  'profile-josh': 'bg-profile-josh',
  'profile-hayley': 'bg-profile-hayley',
};

const ACCENT_RING: Record<string, string> = {
  'profile-josh': 'group-hover:ring-profile-josh/40',
  'profile-hayley': 'group-hover:ring-profile-hayley/40',
};

export function ProfilePicker() {
  const navigate = useNavigate();
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);

  const choose = (id: string) => {
    setActiveProfileId(id);
    navigate('/today');
  };

  return (
    <div
      className="relative flex min-h-full flex-col bg-cream-50 px-6 dark:bg-cream-950"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-cream-500 dark:text-cream-400">
          Workout · Tracker
        </span>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-12">
        <header className="text-center">
          <h1 className="font-display text-5xl font-light leading-[1.05] tracking-tight text-cream-900 dark:text-cream-50">
            Who&apos;s
            <br />
            <span className="italic text-cream-700 dark:text-cream-200">lifting</span>{' '}
            today?
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-sm text-cream-600 dark:text-cream-400">
            Pick a profile. The app themes itself around you.
          </p>
        </header>

        <ul className="flex w-full max-w-sm flex-col gap-3">
          {SEED_PROFILES.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => choose(profile.id)}
                className={[
                  'group flex w-full min-h-[72px] items-center gap-4 rounded-2xl border border-cream-200 bg-white px-5 py-4 text-left shadow-soft ring-2 ring-transparent transition',
                  'hover:-translate-y-0.5 hover:shadow-lift',
                  'dark:border-cream-800 dark:bg-cream-900 dark:shadow-none dark:hover:bg-cream-800',
                  ACCENT_RING[profile.accent] ?? '',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'flex h-12 w-12 items-center justify-center rounded-full font-display text-xl font-medium text-white',
                    ACCENT_BG[profile.accent] ?? 'bg-cream-500',
                  ].join(' ')}
                >
                  {profile.name.charAt(0)}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-medium tracking-tight text-cream-900 dark:text-cream-50">
                    {profile.name}
                  </span>
                  <span className="text-xs text-cream-500 dark:text-cream-400">
                    {profile.unitSystem.toUpperCase()} · ready
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-cream-400 transition group-hover:translate-x-0.5 dark:text-cream-500"
                >
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-[0.7rem] uppercase tracking-[0.2em] text-cream-400 dark:text-cream-500">
        Local-only · No account required
      </p>
    </div>
  );
}
