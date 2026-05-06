import type { Profile } from '../types';

// Hardcoded for milestone 1. Real profile storage arrives with the Dexie
// schemas in milestone 2; the picker UI then reads from the DB instead.
export const SEED_PROFILES: readonly Profile[] = [
  {
    id: 'joshua',
    name: 'Joshua',
    accent: 'profile-josh',
    unitSystem: 'kg',
  },
  {
    id: 'partner',
    name: 'Partner',
    accent: 'profile-partner',
    unitSystem: 'kg',
  },
] as const;
