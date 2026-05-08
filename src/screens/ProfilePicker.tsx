import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfiles } from '../db/profiles';
import { useActiveProfile } from '../state/activeProfile';
import { ThemeToggle } from '../components/ThemeToggle';
import { THEME_SWATCHES } from '../types';

/** Type guard for the `switch: true` location-state flag the app uses
 * to ask the picker to *show* rather than auto-redirect (header pill
 * + Settings → Switch profile). */
function isSwitchState(value: unknown): value is { switch: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'switch' in value &&
    (value as { switch: unknown }).switch === true
  );
}

export function ProfilePicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);
  const profiles = useProfiles();
  const wantsSwitch = isSwitchState(location.state);

  // First-launch redirect: as soon as Dexie confirms there are zero
  // profiles, route to the creation form. Loading (`undefined`) is
  // not the same as empty — we only redirect once the live query has
  // resolved.
  useEffect(() => {
    if (profiles && profiles.length === 0) {
      navigate('/profiles/new', { replace: true });
    }
  }, [profiles, navigate]);

  // Auto-resume to /today when there's already a stored active
  // profile — most users open the app to do a workout, not to
  // re-pick. Bypassed when the user came here via Switch profile.
  // Stale stored ids (profile deleted) are cleared so the picker
  // shows normally.
  useEffect(() => {
    if (!profiles || profiles.length === 0) return;
    if (wantsSwitch) return;
    if (!activeProfileId) return;
    const exists = profiles.some((p) => p.id === activeProfileId);
    if (exists) {
      navigate('/today', { replace: true });
    } else {
      setActiveProfileId(null);
    }
  }, [profiles, activeProfileId, wantsSwitch, navigate, setActiveProfileId]);

  const choose = (id: string) => {
    setActiveProfileId(id);
    navigate('/today');
  };

  return (
    <div
      className="relative flex min-h-full flex-col bg-bg px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
          Workout · Tracker
        </span>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-12">
        <header className="text-center">
          <h1 className="font-display text-5xl font-light leading-[1.05] tracking-tight text-fg">
            Who&apos;s
            <br />
            <span className="italic text-fg-soft">lifting</span> today?
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-sm text-fg-muted">
            Pick a profile. The app themes itself around you.
          </p>
        </header>

        <ul className="flex w-full max-w-sm flex-col gap-3">
          {(profiles ?? []).map((profile) => {
            const swatch = THEME_SWATCHES[profile.theme] ?? '#888888';
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => choose(profile.id)}
                  className="group flex w-full min-h-[72px] items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 items-center justify-center rounded-full font-display text-xl font-medium text-white"
                    style={{ background: swatch }}
                  >
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-medium tracking-tight text-fg">
                      {profile.name}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {profile.unitSystem.toUpperCase()} · ready
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="text-fg-faint transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </button>
              </li>
            );
          })}
          {profiles === undefined && (
            <li
              aria-hidden
              className="h-[72px] animate-pulse rounded-2xl border border-line bg-surface-soft"
            />
          )}
          {profiles && profiles.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => navigate('/profiles/new')}
                className="flex w-full min-h-[60px] items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-transparent px-5 py-4 text-sm text-fg-muted transition hover:border-line-strong hover:text-fg"
              >
                <span aria-hidden className="text-base">
                  +
                </span>
                <span>New profile</span>
              </button>
            </li>
          )}
        </ul>
      </div>

      <p className="text-center text-[0.7rem] uppercase tracking-[0.2em] text-fg-faint">
        Local-only · No account required
      </p>
    </div>
  );
}
