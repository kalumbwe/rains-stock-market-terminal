'use client';

/**
 * Alert-trigger sounds — synthesised with the Web Audio API (no asset
 * download, works offline). Opt-in via localStorage (`luse_alert_sound`),
 * with a selectable tone (`luse_alert_sound_kind`) and volume
 * (`luse_alert_volume`) — both editable from the Alerts tab sound picker.
 */

export type AlertSoundKind = 'ping' | 'chime' | 'bell';

const SOUND_PREF_KEY = 'luse_alert_sound';
const SOUND_KIND_KEY = 'luse_alert_sound_kind';
const SOUND_VOLUME_KEY = 'luse_alert_volume';

/* ---- Tiny pub/sub so UI consumers stay in sync via useSyncExternalStore ---- */

const prefListeners = new Set<() => void>();

/** Subscribe to sound-preference changes (kind/volume). */
export function subscribeSoundPrefs(onChange: () => void): () => void {
  prefListeners.add(onChange);
  return () => {
    prefListeners.delete(onChange);
  };
}

function notifySoundPrefs(): void {
  for (const cb of prefListeners) cb();
}

export const ALERT_SOUND_KINDS: { kind: AlertSoundKind; label: string; hint: string }[] = [
  { kind: 'ping', label: 'Ping', hint: 'Bright two-tone rise — the classic alert' },
  { kind: 'chime', label: 'Chime', hint: 'Soft major triad, gentle decay' },
  { kind: 'bell', label: 'Bell', hint: 'Struck bell with metallic overtone' },
];

export const DEFAULT_SOUND_VOLUME = 70;

let ctx: AudioContext | null = null;

/** Read the persisted alert-sound on/off preference. */
export function readAlertSoundPref(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SOUND_PREF_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Persist the alert-sound on/off preference. */
export function writeAlertSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

/** Read the persisted tone choice (falls back to 'ping'). */
export function readAlertSoundKind(): AlertSoundKind {
  try {
    const v = localStorage.getItem(SOUND_KIND_KEY);
    if (v === 'chime' || v === 'bell' || v === 'ping') return v;
  } catch {
    /* ignore */
  }
  return 'ping';
}

/** Persist the tone choice. */
export function writeAlertSoundKind(kind: AlertSoundKind): void {
  try {
    localStorage.setItem(SOUND_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
  notifySoundPrefs();
}

/** Read the persisted volume (0–100), clamped. */
export function readAlertVolume(): number {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_KEY);
    if (raw !== null) {
      const v = Number(raw);
      if (Number.isFinite(v)) return Math.min(100, Math.max(0, v));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SOUND_VOLUME;
}

/** Persist the volume (0–100). */
export function writeAlertVolume(volume: number): void {
  try {
    localStorage.setItem(SOUND_VOLUME_KEY, String(Math.round(Math.min(100, Math.max(0, volume)))));
  } catch {
    /* ignore */
  }
  notifySoundPrefs();
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

/** Map 0–100 volume preference to a musical gain ceiling (never harsh). */
function masterGain(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  // Perceptual-ish curve: 0 → silent, 100 → 0.22 peak.
  return 0.22 * Math.pow(v, 1.4);
}

/**
 * Play the configured alert tone at the configured volume. Reads the
 * persisted preferences internally so any caller (trigger engine, preview
 * buttons) stays in sync. Safe to call anywhere — silently no-ops on the
 * server or without WebAudio.
 */
export function playAlertBeep(): void {
  try {
    const audio = getCtx();
    if (!audio) return;
    const now = audio.currentTime;
    const peak = masterGain(readAlertVolume());
    if (peak <= 0.0001) return; // volume muted — respect the choice

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    gain.connect(audio.destination);

    const note = (
      freq: number,
      start: number,
      dur: number,
      type: OscillatorType = 'sine',
      level = 1
    ) => {
      const osc = audio.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      const nGain = audio.createGain();
      nGain.gain.value = level;
      osc.connect(nGain).connect(gain);
      osc.start(start);
      osc.stop(start + dur);
    };

    switch (readAlertSoundKind()) {
      case 'chime': {
        // Soft C6–E6–G6 arpeggio, overlapping decays.
        note(1046.5, now, 0.5, 'sine', 0.9);
        note(1318.5, now + 0.09, 0.55, 'sine', 0.75);
        note(1568, now + 0.18, 0.7, 'sine', 0.6);
        break;
      }
      case 'bell': {
        // Struck bell: fundamental + inharmonic partials, long decay.
        note(587.33, now, 0.9, 'sine', 1); // D5 fundamental
        note(1174.7, now, 0.6, 'sine', 0.35); // octave
        note(1777, now, 0.45, 'sine', 0.18); // inharmonic overtone
        note(293.66, now, 0.7, 'triangle', 0.25); // body thump
        break;
      }
      case 'ping':
      default: {
        // Two quick sine notes (A5 → E6) with exponential decay.
        note(880, now, 0.22); // A5
        note(1318.5, now + 0.13, 0.4); // E6 — the "ping" lift
        break;
      }
    }
  } catch {
    /* audio is best-effort */
  }
}
