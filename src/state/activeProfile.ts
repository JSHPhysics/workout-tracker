import { create } from 'zustand';

interface ActiveProfileState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

const STORAGE_KEY = 'wt:activeProfileId';

function readStored(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return typeof v === 'string' && v !== '' ? v : null;
}

function writeStored(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

// Persisted across reloads via localStorage so the user lands directly
// on /today after re-opening the app, rather than the picker every
// time. Cleared when the user explicitly switches (header pill /
// Settings → Switch profile) or when the referenced profile no longer
// exists (handled in AppShell + ProfilePicker).
//
// The theme applied to <html> follows from the active profile's
// `theme` field — see `src/components/ActiveProfileTheme.tsx`, which
// observes the active profile in Dexie and re-applies `data-theme`
// whenever it changes.
export const useActiveProfile = create<ActiveProfileState>((set) => ({
  activeProfileId: readStored(),
  setActiveProfileId: (id) => {
    writeStored(id);
    set({ activeProfileId: id });
  },
}));
