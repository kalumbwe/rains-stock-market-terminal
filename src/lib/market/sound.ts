'use client';

/**
 * Alert-trigger sound — a short two-tone "ping" synthesised with the Web
 * Audio API (no asset download, works offline). Opt-in via localStorage
 * (`luse_alert_sound`), read by the alert engine before firing.
 */

const SOUND_PREF_KEY = 'luse_alert_sound';

let ctx: AudioContext | null = null;

/** Read the persisted alert-sound preference. */
export function readAlertSoundPref(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SOUND_PREF_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Persist the alert-sound preference. */
export function writeAlertSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    // Autoplay policies can suspend the context until a user gesture —
    // try to resume; a suspended context silently swallows the beep.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play the alert ping: two quick sine notes (A5 → E6) with exponential
 * decay, quiet enough not to startle but clearly audible in a busy tab.
 * Safe to call anywhere — silently no-ops on the server or without WebAudio.
 */
export function playAlertBeep(): void {
  try {
    const audio = getCtx();
    if (!audio) return;
    const now = audio.currentTime;

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    gain.connect(audio.destination);

    const note = (freq: number, start: number, dur: number) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + dur);
    };

    note(880, now, 0.22); // A5
    note(1318.5, now + 0.13, 0.4); // E6 — the "ping" lift
  } catch {
    /* audio is best-effort */
  }
}
