// Audio + vibration cue used by the rest timer and interval rounds.
// The rest/timer audio is a short two-note chime synthesised with the
// Web Audio API. The celebration cue uses a real party-blower sample
// (small enough — ~30 KB — to inline into the bundle).

import partyBlowerUrl from '../assets/partyblower.mp3';

let ctx: AudioContext | null = null;
let celebrationEl: HTMLAudioElement | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

interface BeepShape {
  freq: number;
  /** Seconds. */
  duration: number;
  /** Seconds offset from start. */
  at: number;
  /** 0..1 */
  gain?: number;
}

function playShape(shapes: BeepShape[]): void {
  const c = getContext();
  if (!c) return;
  // Some browsers suspend the context until a user gesture. Trying to
  // resume is harmless if it's already running.
  if (c.state === 'suspended') void c.resume();

  const startAt = c.currentTime;
  for (const s of shapes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = s.freq;
    osc.type = 'sine';
    const peak = s.gain ?? 0.18;
    gain.gain.setValueAtTime(0, startAt + s.at);
    gain.gain.linearRampToValueAtTime(peak, startAt + s.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + s.at + s.duration,
    );
    osc.connect(gain).connect(c.destination);
    osc.start(startAt + s.at);
    osc.stop(startAt + s.at + s.duration + 0.05);
  }
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

/** Plays the rest-finished cue (two-note ascending chime + haptic). */
export function cueRestEnd(): void {
  playShape([
    { freq: 660, duration: 0.16, at: 0 },
    { freq: 880, duration: 0.22, at: 0.18 },
  ]);
  vibrate([110, 60, 140]);
}

/** Single tick — used for round transitions in the interval timer. */
export function cueTick(): void {
  playShape([{ freq: 880, duration: 0.1, at: 0, gain: 0.14 }]);
  vibrate(40);
}

/** Final-round end cue (longer chime + double pulse). */
export function cueIntervalEnd(): void {
  playShape([
    { freq: 660, duration: 0.16, at: 0 },
    { freq: 880, duration: 0.16, at: 0.18 },
    { freq: 1100, duration: 0.32, at: 0.36 },
  ]);
  vibrate([140, 80, 140, 80, 220]);
}

/**
 * Web Audio contexts must be created in response to a user gesture on
 * some browsers. Call this once on first interaction (e.g. profile
 * picked) so subsequent cues fire reliably.
 */
export function primeAudio(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
}

/** Lazily build (and cache) the celebration <audio> element so playback
 * latency is just a network-cached file decode. */
function getCelebrationAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (celebrationEl) return celebrationEl;
  const el = new Audio(partyBlowerUrl);
  el.preload = 'auto';
  el.volume = 0.85;
  celebrationEl = el;
  return el;
}

/** Plays the party-blower celebration sample + a short triple haptic.
 * Called when the PR celebration modal opens. The play call follows
 * a user gesture (the "Finish workout" tap), so autoplay policies are
 * satisfied. */
export function cueCelebration(): void {
  const el = getCelebrationAudio();
  if (el) {
    try {
      el.currentTime = 0;
      // play() returns a promise; ignore rejection (e.g. autoplay
      // blocked when triggered without a gesture during dev hot-reload).
      void el.play().catch(() => {});
    } catch {
      // ignore
    }
  }
  vibrate([60, 40, 60, 40, 120]);
}
