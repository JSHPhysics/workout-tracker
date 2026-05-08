import { useEffect } from 'react';
import { useActiveProfile } from '../state/activeProfile';
import { useProfile } from '../db/profiles';

/** Applies `data-theme=<token>` to `<html>` whenever the active
 * profile's `theme` field changes (initial pick, theme edit in
 * Settings, profile switch). When no profile is active the attribute
 * is removed and the cascade falls back to the `:root` default
 * (emerald) defined in src/index.css.
 *
 * Renders nothing. Mount once near the root of the tree (App.tsx). */
export function ActiveProfileTheme(): null {
  const activeProfileId = useActiveProfile((s) => s.activeProfileId);
  const profile = useProfile(activeProfileId);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // Housekeeping: the pre-v8 design stamped `data-profile=<id>` on
    // <html>; clear any lingering value from a previous deploy so it
    // doesn't fight the new `[data-theme="..."]` cascade.
    if ('profile' in root.dataset) delete root.dataset.profile;
    if (profile?.theme) {
      root.dataset.theme = profile.theme;
    } else {
      delete root.dataset.theme;
    }
  }, [profile?.theme]);

  return null;
}
