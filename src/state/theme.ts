import { useSyncExternalStore } from 'react';

// Three-state theme preference. 'system' tracks `prefers-color-scheme`
// live; 'light' / 'dark' are explicit user overrides.
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'wt:theme';

function readStored(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function osPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return osPrefersDark() ? 'dark' : 'light';
  return pref;
}

let preference: ThemePreference = readStored();
const listeners = new Set<() => void>();

function applyToDocument(): void {
  if (typeof document === 'undefined') return;
  const dark = resolve(preference) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function notify(): void {
  applyToDocument();
  listeners.forEach((l) => l());
}

// Re-apply when the OS preference changes — but only matters when the
// user has chosen 'system'.
if (typeof window !== 'undefined' && window.matchMedia) {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (preference === 'system') notify();
    });
}

export function initTheme(): void {
  applyToDocument();
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, next);
  }
  notify();
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function getResolvedTheme(): 'light' | 'dark' {
  return resolve(preference);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, getThemePreference);
}

export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getResolvedTheme, getResolvedTheme);
}
