import type { Profile } from '../types';

// Hardcoded for milestone 1. Real profile storage arrives with the Dexie
// schemas in milestone 2; the picker UI then reads from the DB instead.
//
// `accent` is a static colour for the picker chip. Once a profile is
// selected, src/state/theme.ts (via setActiveProfileId) sets a
// `data-profile` attribute on <html>, and CSS variables in index.css
// re-bind the entire `accent` palette across the app.
export const SEED_PROFILES: readonly Profile[] = [
  {
    id: 'joshua',
    name: 'Joshua',
    accent: 'profile-josh',
    unitSystem: 'kg',
  },
  {
    id: 'hayley',
    name: 'Hayley',
    accent: 'profile-hayley',
    unitSystem: 'kg',
  },
] as const;
