import type { PlateInventoryEntry } from '../types';

// Default equipment seeded the first time a profile boots. Per
// DECISIONS.md (UK home-gym standard): two barbells (Olympic + Women's)
// and a typical pair-based plate inventory. Users adjust via Settings →
// Equipment.

export interface SeedBarbell {
  name: string;
  weight: number;
  isDefault: boolean;
}

export const SEED_BARBELLS: readonly SeedBarbell[] = [
  { name: 'Olympic 20 kg', weight: 20, isDefault: true },
  { name: "Women's 15 kg", weight: 15, isDefault: false },
] as const;

export const SEED_PLATE_INVENTORY: readonly PlateInventoryEntry[] = [
  { weight: 20, count: 4 },
  { weight: 15, count: 2 },
  { weight: 10, count: 4 },
  { weight: 5, count: 2 },
  { weight: 2.5, count: 4 },
  { weight: 1.25, count: 4 },
] as const;
