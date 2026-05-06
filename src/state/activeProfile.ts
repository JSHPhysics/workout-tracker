import { create } from 'zustand';

interface ActiveProfileState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

// Ephemeral UI state only (per CLAUDE.md). The persisted choice will move
// into Dexie once profile storage lands; for now the picker simply
// remembers the in-memory selection across navigations.
export const useActiveProfile = create<ActiveProfileState>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => set({ activeProfileId: id }),
}));
