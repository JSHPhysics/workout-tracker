// PWA "Add to Home Screen" plumbing. The browser fires
// `beforeinstallprompt` when the manifest + service worker pass its
// install-eligibility heuristics; we hold the event and re-emit it
// from `install()` when the user taps a button. After install,
// `appinstalled` clears the state.
//
// Currently fires on Chrome / Edge / Samsung Internet on Android +
// desktop Chromium. iOS Safari has no equivalent — users add via
// Share → Add to Home Screen, which the UI explains via the
// `iosInstallable` flag below.

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unsupported';

export interface InstallState {
  /** True when `beforeinstallprompt` has fired AND the app isn't
   * already installed. The Settings card uses this to show the
   * in-app Install button. */
  canInstall: boolean;
  /** True when the page is running in the installed PWA shell —
   * either `display-mode: standalone` (Android / desktop) or
   * `navigator.standalone` (iOS). */
  installed: boolean;
  /** True on iOS Safari, where there's no programmatic install but
   * the user can still add via the share sheet. UI shows
   * instructions instead of a button. */
  iosInstallable: boolean;
  /** Trigger the native install prompt. Returns the user's choice or
   * 'unsupported' if no event has been captured yet. */
  install(): Promise<InstallOutcome>;
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari pre-PWA spec: `navigator.standalone` is true when
  // launched from the home screen.
  const nav = navigator as { standalone?: boolean };
  return nav.standalone === true;
}

function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone / iPad / iPod, but not Chrome on iOS (which still uses
  // Safari's webkit but doesn't expose the share-sheet "Add to Home
  // Screen" properly anyway). We just need to know we're on
  // an Apple device that uses the share-sheet route.
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export function useInstallPrompt(): InstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(detectInstalled);
  const [iosInstallable] = useState(() => detectIos() && !detectInstalled());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop the browser auto-banner so we control the prompt timing.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setEvent(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    // Some browsers fire the display-mode change without `appinstalled`
    // when the app is launched standalone. Watch the media query too.
    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onModeChange = () => setInstalled(detectInstalled());
    mql?.addEventListener?.('change', onModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      mql?.removeEventListener?.('change', onModeChange);
    };
  }, []);

  const install = async (): Promise<InstallOutcome> => {
    if (!event) return 'unsupported';
    await event.prompt();
    const choice = await event.userChoice;
    // The event is single-use — clear it regardless of outcome so the
    // button doesn't sit in a "broken" state if the user dismissed.
    setEvent(null);
    return choice.outcome;
  };

  return {
    canInstall: !installed && event !== null,
    installed,
    iosInstallable,
    install,
  };
}
