import type { Profile } from '../types';

// Profiles are no longer auto-seeded. Fresh installs start with zero
// profiles; the ProfilePicker routes the user to ProfileCreate where
// they pick name, theme, and (optional) sex. The seed loader still
// runs through this list on every boot in case we ever want a built-
// in starter profile, but it's empty by default.
//
// Existing user profiles in IndexedDB are preserved across this
// change — the v8 Dexie migration maps their legacy `accent` field
// to the new `theme` field; nothing else changes.
export const SEED_PROFILES: readonly Profile[] = [] as const;
