import { create } from 'zustand';

interface ActiveProfileState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

function applyProfileAttr(id: string | null): void {
  if (typeof document === 'undefined') return;
  if (id) {
    document.documentElement.dataset.profile = id;
  } else {
    delete document.documentElement.dataset.profile;
  }
}

// Ephemeral UI state only (per CLAUDE.md). The persisted choice will move
// into Dexie once profile storage lands; for now the picker remembers the
// in-memory selection and mirrors it to a `data-profile` attribute on the
// <html> element so CSS variables (see index.css) can theme the rest of
// the app around the active profile's accent.
export const useActiveProfile = create<ActiveProfileState>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => {
    applyProfileAttr(id);
    set({ activeProfileId: id });
  },
}));
