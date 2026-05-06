import { useNavigate } from 'react-router-dom';
import { SEED_PROFILES } from '../seed/profiles';
import { useActiveProfile } from '../state/activeProfile';

const ACCENT_BG: Record<string, string> = {
  'profile-josh': 'bg-profile-josh',
  'profile-partner': 'bg-profile-partner',
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
      className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-12"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 3rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 3rem)',
      }}
    >
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Who's lifting?</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Pick your profile to get started.
        </p>
      </header>

      <ul className="flex w-full max-w-sm flex-col gap-3">
        {SEED_PROFILES.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              onClick={() => choose(profile.id)}
              className="group flex w-full min-h-[64px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <span
                aria-hidden
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-white',
                  ACCENT_BG[profile.accent] ?? 'bg-slate-500',
                ].join(' ')}
              >
                {profile.name.charAt(0)}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-base font-medium">{profile.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Units: {profile.unitSystem}
                </span>
              </span>
              <span
                aria-hidden
                className="text-slate-400 transition group-hover:translate-x-0.5 dark:text-slate-500"
              >
                →
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Local-only · No account required
      </p>
    </div>
  );
}
