import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProfile, useProfiles } from '../db/profiles';
import { useActiveProfile } from '../state/activeProfile';
import { ThemeToggle } from '../components/ThemeToggle';
import { THEMES, THEME_LABELS, THEME_SWATCHES } from '../types';
import type { Sex, Theme } from '../types';

const SEX_OPTIONS: { value: Sex; label: string; sub: string }[] = [
  {
    value: 'female',
    label: 'Female',
    sub: 'Period & cycle tracking on; women’s 15 kg bar default.',
  },
  {
    value: 'male',
    label: 'Male',
    sub: 'Olympic 20 kg bar default; period tracking off.',
  },
];

/** First-launch and "+ New profile" form. Captures name, theme, and
 * (optional) biological sex; everything else gets sensible defaults
 * via `createProfile`. The form auto-themes the live preview as the
 * user picks — picking "Sky" recolours the page accent immediately,
 * even before submitting, so the choice feels concrete. */
export function ProfileCreate() {
  const navigate = useNavigate();
  const profiles = useProfiles();
  const setActiveProfileId = useActiveProfile((s) => s.setActiveProfileId);

  const [name, setName] = useState('');
  const [theme, setTheme] = useState<Theme>('emerald');
  const [sex, setSex] = useState<Sex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-preview the picked theme on the document by setting the
  // attribute directly. Cleanup on unmount so we don't leak the
  // preview if the user navigates away without saving.
  // (Run inside an effect via the hook below.)
  useThemePreview(theme);

  const canSubmit = name.trim() !== '' && !busy;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createProfile({
        name,
        theme,
        ...(sex ? { sex } : {}),
      });
      setActiveProfileId(id);
      navigate('/today');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  // Show a Cancel link only when there's already at least one profile —
  // first-launch users can't escape this screen until they finish.
  const hasExistingProfiles = (profiles?.length ?? 0) > 0;

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
          New profile
        </span>
        <ThemeToggle />
      </div>

      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-10"
      >
        <header>
          <h1 className="font-display text-4xl font-light leading-[1.05] tracking-tight text-fg">
            Make your{' '}
            <span className="italic text-fg-soft">profile</span>.
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            Three quick choices. Everything else has sensible defaults you
            can tweak in Settings.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="profile-name"
            className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted"
          >
            Your name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            autoFocus
            maxLength={40}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Theme
          </span>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const active = t === theme;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  aria-pressed={active}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-2xl border bg-surface px-2 py-3 text-xs transition',
                    active
                      ? 'border-accent shadow-soft'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className="h-6 w-6 rounded-full"
                    style={{ background: THEME_SWATCHES[t] }}
                  />
                  <span className={active ? 'text-fg' : ''}>
                    {THEME_LABELS[t]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
            Biological sex (optional)
          </span>
          <p className="-mt-1 text-xs text-fg-muted">
            Sets period tracking and the default barbell. Both are
            toggleable later in Settings — leave blank if you'd rather
            configure them yourself.
          </p>
          <div className="flex flex-col gap-2">
            {SEX_OPTIONS.map((opt) => {
              const active = opt.value === sex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSex(active ? null : opt.value)}
                  aria-pressed={active}
                  className={[
                    'flex flex-col items-start gap-0.5 rounded-2xl border bg-surface px-3 py-2.5 text-left text-sm transition',
                    active
                      ? 'border-accent shadow-soft'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  ].join(' ')}
                >
                  <span className={active ? 'font-medium text-fg' : 'font-medium'}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-fg-muted">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <p className="text-xs text-accent" role="alert">
            {error}
          </p>
        )}

        <div className="mt-auto flex items-center justify-end gap-3 pt-2">
          {hasExistingProfiles && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] text-fg-muted transition hover:text-fg"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Create profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Live-preview the in-flight theme by stamping `data-theme` on the
 * document. Restored on unmount so we don't leak the preview if the
 * user backs out without submitting (ActiveProfileTheme re-applies
 * the active profile's theme on next mount, but the explicit restore
 * avoids a flash of the preview theme during navigation). */
function useThemePreview(theme: Theme): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
    };
  }, [theme]);
}
