import type { Profile } from '../types';

// Seed profile records written to Dexie on first boot by
// src/db/seed-loader.ts. Once a profile is selected, the activeProfile
// store sets a `data-profile` attribute on <html> and CSS variables in
// index.css re-bind the entire `accent` palette across the app.
//
// We use a fixed ISO timestamp (the project epoch) so seed records are
// deterministic — re-running the seed loader on a fresh DB produces the
// same `createdAt` value.
const SEED_EPOCH = '2026-05-06T00:00:00.000Z';

export const SEED_PROFILES: readonly Profile[] = [
  {
    id: 'joshua',
    name: 'Joshua',
    accent: 'profile-josh',
    unitSystem: 'kg',
    useBodyweightForVolume: false,
    periodTrackingEnabled: false,
    equipment: [
      'bodyweight',
      'barbell',
      'dumbbells',
      'bench',
      'pull-up-bar',
      'glute-bridge-pad',
      'yoga-mat',
      'foam-roller',
      'box',
    ],
    createdAt: SEED_EPOCH,
  },
  {
    id: 'hayley',
    name: 'Hayley',
    accent: 'profile-hayley',
    unitSystem: 'kg',
    useBodyweightForVolume: false,
    periodTrackingEnabled: false,
    equipment: [
      'bodyweight',
      'barbell',
      'dumbbells',
      'bench',
      'pull-up-bar',
      'glute-bridge-pad',
      'yoga-mat',
      'foam-roller',
      'box',
    ],
    createdAt: SEED_EPOCH,
  },
] as const;
