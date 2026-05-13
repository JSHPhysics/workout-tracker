// Audio + vibration cue used by the rest timer and interval rounds.
// The rest/timer audio is a short two-note chime synthesised with the
// Web Audio API. The celebration cue layers two real samples — a
// party-blower and a "hooray" vocal — played simultaneously so the
// PR feels bigger than either clip would alone (both small enough,
// ~30 KB each, to inline into the bundle).

import partyBlowerUrl from '../assets/partyblower.mp3';
import hoorayUrl from '../assets/theburntpeanut-hooray.mp3';

let ctx: AudioContext | null = null;
let celebrationEl: HTMLAudioElement | null = null;
let hoorayEl: HTMLAudioElement | null = null;

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
  /** Layer a quieter octave-up partial on top of the fundamental.
   * Adds harmonic content so the cue cuts through music in another
   * app — pure sines get masked easily, but a triangle + octave-up
   * partial sits well above a typical Spotify mix. */
  octaveUp?: boolean;
}

function spawnTone(
  c: AudioContext,
  startAt: number,
  freq: number,
  peak: number,
  at: number,
  duration: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  // Triangle has odd harmonics — still musical, much less prone to
  // disappearing into a busy mix than a pure sine.
  osc.type = 'triangle';
  gain.gain.setValueAtTime(0, startAt + at);
  gain.gain.linearRampToValueAtTime(peak, startAt + at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + at + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt + at);
  osc.stop(startAt + at + duration + 0.05);
}

function playShape(shapes: BeepShape[]): void {
  const c = getContext();
  if (!c) return;
  // Some browsers suspend the context until a user gesture. Trying to
  // resume is harmless if it's already running.
  if (c.state === 'suspended') void c.resume();

  const startAt = c.currentTime;
  for (const s of shapes) {
    // Default raised from 0.18 → 0.55 so the rest/interval-end chimes
    // are actually audible over headphone music. Triangle waves peak
    // lower than sines for the same RMS, so this stays well clear of
    // clipping.
    const peak = s.gain ?? 0.55;
    spawnTone(c, startAt, s.freq, peak, s.at, s.duration);
    if (s.octaveUp) {
      // Octave-up partial at ~40% of the fundamental's gain — adds
      // brightness without overwhelming the base tone.
      spawnTone(c, startAt, s.freq * 2, peak * 0.4, s.at, s.duration);
    }
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

/** Plays the rest-finished cue (two-note ascending chime + haptic).
 * Each note layers an octave-up partial — the brightness is what
 * cuts through music playing from another app (Spotify etc.). */
export function cueRestEnd(): void {
  playShape([
    { freq: 660, duration: 0.16, at: 0, octaveUp: true },
    { freq: 880, duration: 0.22, at: 0.18, octaveUp: true },
  ]);
  vibrate([110, 60, 140]);
}

/** Single tick — used for round transitions in the interval timer.
 * Deliberately quiet + plain (no octave-up) so it doesn't compete
 * with the round-end cue or distract mid-set. */
export function cueTick(): void {
  playShape([{ freq: 880, duration: 0.1, at: 0, gain: 0.14 }]);
  vibrate(40);
}

/** Final-round end cue (longer chime + double pulse). Same cut-
 * through treatment as cueRestEnd. */
export function cueIntervalEnd(): void {
  playShape([
    { freq: 660, duration: 0.16, at: 0, octaveUp: true },
    { freq: 880, duration: 0.16, at: 0.18, octaveUp: true },
    { freq: 1100, duration: 0.32, at: 0.36, octaveUp: true },
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

/** Lazily build (and cache) the celebration <audio> elements so
 * playback latency is just a network-cached file decode. Two separate
 * elements — one per sample — let them overlap; a single element
 * can't play two sources at once. */
function getCelebrationAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (celebrationEl) return celebrationEl;
  const el = new Audio(partyBlowerUrl);
  el.preload = 'auto';
  el.volume = 1.0;
  celebrationEl = el;
  return el;
}

function getHoorayAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (hoorayEl) return hoorayEl;
  const el = new Audio(hoorayUrl);
  el.preload = 'auto';
  // Slightly under the party-blower so the vocal sits *with* the
  // blower rather than over it. Easy to tune if the mix feels off.
  el.volume = 0.9;
  hoorayEl = el;
  return el;
}

/** Plays the layered PR celebration cue (party-blower + "hooray"
 * vocal in unison) plus a short triple haptic. Called when the PR
 * celebration modal opens. The play call follows a user gesture (the
 * "Finish workout" tap), so autoplay policies are satisfied. */
export function cueCelebration(): void {
  for (const el of [getCelebrationAudio(), getHoorayAudio()]) {
    if (!el) continue;
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
