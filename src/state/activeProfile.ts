import { create } from 'zustand';

interface ActiveProfileState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

// Ephemeral UI state only (per CLAUDE.md). The theme applied to the
// `<html>` element follows from the active profile's `theme` field —
// see `src/components/ActiveProfileTheme.tsx`, which observes the
// active profile in Dexie and re-applies `data-theme` whenever it
// changes (initial pick, theme edit in Settings, profile switch).
export const useActiveProfile = create<ActiveProfileState>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => {
    set({ activeProfileId: id });
  },
}));
