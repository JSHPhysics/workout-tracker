// Profile shape used by the in-memory placeholder picker in milestone 1.
// The persisted shape (per SCOPE.md §4.3) lives in src/db/ once schemas land.

export type UnitSystem = 'kg' | 'lb';

export interface Profile {
  id: string;
  name: string;
  /** Tailwind colour token, e.g. 'profile-josh'. */
  accent: string;
  unitSystem: UnitSystem;
}
