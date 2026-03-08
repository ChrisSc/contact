/**
 * ambient.ts — Persistent submarine ambient soundscape
 *
 * Manages three continuous layers:
 *   1. Submarine hum    — low-frequency sine oscillator (~40 Hz) representing
 *                         the reactor/engine vibration of a submerged vessel.
 *   2. Ocean noise floor — brown noise through a tight lowpass, barely audible,
 *                         providing acoustic depth and masking silence.
 *   3. Periodic sonar   — a soft atmospheric chirp (600→800 Hz) fired on a
 *                         timer. Much quieter than the ability sonar ping; this
 *                         is background texture, not a gameplay cue.
 *
 * Unlike the fire-and-forget SFX in abilities.ts, these nodes are persistent
 * and kept alive until `stopAmbient()` is called. All nodes are stored in
 * module-level refs and disposed on stop.
 *
 * Phase-responsive scaling adjusts hum frequency/volume, noise cutoff/volume,
 * and sonar ping interval to build tension from sparse → urgent as the game
 * progresses.
 */

import * as Tone from 'tone';
import { isAudioReady, type AudioPhase } from './audio-manager';
import { getLogger } from '../observability/logger';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let running = false;

// Submarine hum nodes
let humOsc: Tone.Oscillator | null = null;
let humFilter: Tone.Filter | null = null;
let humVol: Tone.Volume | null = null;

// Ocean noise floor nodes
let noiseGen: Tone.Noise | null = null;
let noiseFilter: Tone.Filter | null = null;
let noiseVol: Tone.Volume | null = null;

// Periodic sonar ping timer
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pingIntervalMs = 10_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function logPlay(sound: string): void {
  try {
    getLogger().emit('audio.play', { sound });
  } catch {
    // Logger may not be initialized during testing or early startup
  }
}

/**
 * Fire a single atmospheric sonar chirp: a short sine that ramps from
 * 600→800 Hz over ~180 ms at -20 dB. Creates its own nodes, plays, then
 * disposes — same fire-and-forget pattern as the SFX module.
 */
function firePingSweep(): void {
  if (!isAudioReady()) return;

  try {
    const vol = new Tone.Volume(-20).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.12,
      sustain: 0.0,
      release: 0.06,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 600,
    }).connect(env);

    const now = Tone.now();
    const duration = 0.18;

    osc.start(now);

    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + duration);

    env.triggerAttackRelease(duration, now);

    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      vol.dispose();
    }, 600);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'ambient_ping', error: String(err) });
    } catch {
      // ignore
    }
  }
}

/**
 * (Re)schedule the sonar ping interval using the current `pingIntervalMs`.
 * Clears the existing timer before setting the new one.
 */
function reschedulePingTimer(): void {
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  pingTimer = setInterval(() => {
    firePingSweep();
  }, pingIntervalMs);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the ambient soundscape. No-op if already running or AudioContext is
 * not ready. Should be called after `initAudioContext()` resolves.
 */
export function startAmbient(): void {
  if (!isAudioReady() || running) return;

  try {
    // ---- Submarine hum ---------------------------------------------------
    humVol = new Tone.Volume(-22).toDestination();
    humFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 80,
      rolloff: -24,
    }).connect(humVol);

    humOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 40,
    }).connect(humFilter);

    humOsc.start();

    // ---- Ocean noise floor -----------------------------------------------
    noiseVol = new Tone.Volume(-35).toDestination();
    noiseFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 100,
      rolloff: -24,
    }).connect(noiseVol);

    noiseGen = new Tone.Noise('brown').connect(noiseFilter);
    noiseGen.start();

    // ---- Periodic sonar ping ---------------------------------------------
    pingIntervalMs = 10_000;
    reschedulePingTimer();

    running = true;

    try {
      getLogger().emit('audio.play', { sound: 'ambient_start' });
    } catch {
      // ignore
    }

  } catch (err) {
    // If anything goes wrong during setup, clean up whatever was created
    stopAmbient();

    try {
      getLogger().emit('audio.play', { sound: 'ambient_start', error: String(err) });
    } catch {
      // ignore
    }
  }
}

/**
 * Stop all ambient audio and dispose every Tone.js node. Safe to call even
 * if ambient is not currently running.
 */
export function stopAmbient(): void {
  // Clear ping timer
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  // Stop and dispose hum nodes
  if (humOsc !== null) {
    try { humOsc.stop(); } catch { /* ignore */ }
    try { humOsc.disconnect(); humOsc.dispose(); } catch { /* ignore */ }
    humOsc = null;
  }
  if (humFilter !== null) {
    try { humFilter.disconnect(); humFilter.dispose(); } catch { /* ignore */ }
    humFilter = null;
  }
  if (humVol !== null) {
    try { humVol.disconnect(); humVol.dispose(); } catch { /* ignore */ }
    humVol = null;
  }

  // Stop and dispose noise floor nodes
  if (noiseGen !== null) {
    try { noiseGen.stop(); } catch { /* ignore */ }
    try { noiseGen.disconnect(); noiseGen.dispose(); } catch { /* ignore */ }
    noiseGen = null;
  }
  if (noiseFilter !== null) {
    try { noiseFilter.disconnect(); noiseFilter.dispose(); } catch { /* ignore */ }
    noiseFilter = null;
  }
  if (noiseVol !== null) {
    try { noiseVol.disconnect(); noiseVol.dispose(); } catch { /* ignore */ }
    noiseVol = null;
  }

  running = false;

  try {
    getLogger().emit('audio.play', { sound: 'ambient_stop' });
  } catch {
    // ignore
  }
}

/**
 * Ramp ambient parameters to match the current game phase.
 * Uses Tone.js `rampTo` for smooth ~2s transitions so changes are never
 * jarring. Also updates the sonar ping interval.
 *
 * | Parameter      | Early  | Mid    | Escalation | Endgame |
 * |----------------|--------|--------|------------|---------|
 * | Hum freq (Hz)  | 40     | 35     | 30         | 25      |
 * | Hum vol (dB)   | -22    | -18    | -16        | -14     |
 * | Noise vol (dB) | -35    | -28    | -24        | -20     |
 * | Noise cutoff   | 80 Hz  | 120 Hz | 180 Hz     | 250 Hz  |
 * | Ping interval  | 10 s   | 7 s    | 5 s        | 3 s     |
 */
export function updateAmbientPhase(phase: AudioPhase): void {
  if (!running) return;

  const RAMP = 2; // seconds

  type PhaseParams = {
    humFreq: number;
    humDb: number;
    noiseDb: number;
    noiseCutoff: number;
    pingMs: number;
  };

  const params: Record<AudioPhase, PhaseParams> = {
    setup:             { humFreq: 40, humDb: -22, noiseDb: -35, noiseCutoff:  80, pingMs: 10_000 },
    combat_early:      { humFreq: 40, humDb: -22, noiseDb: -35, noiseCutoff:  80, pingMs: 10_000 },
    combat_mid:        { humFreq: 35, humDb: -18, noiseDb: -28, noiseCutoff: 120, pingMs:  7_000 },
    combat_escalation: { humFreq: 30, humDb: -16, noiseDb: -24, noiseCutoff: 180, pingMs:  5_000 },
    combat_endgame:    { humFreq: 25, humDb: -14, noiseDb: -20, noiseCutoff: 250, pingMs:  3_000 },
  };

  const p = params[phase];

  try {
    if (humOsc !== null) {
      humOsc.frequency.rampTo(p.humFreq, RAMP);
    }
    if (humVol !== null) {
      humVol.volume.rampTo(p.humDb, RAMP);
    }
    if (noiseVol !== null) {
      noiseVol.volume.rampTo(p.noiseDb, RAMP);
    }
    if (noiseFilter !== null) {
      noiseFilter.frequency.rampTo(p.noiseCutoff, RAMP);
    }
  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'ambient_phase_update', error: String(err) });
    } catch {
      // ignore
    }
  }

  // Update ping interval only if it actually changed — avoids needlessly
  // resetting the timer mid-cycle.
  if (p.pingMs !== pingIntervalMs) {
    pingIntervalMs = p.pingMs;
    if (running) {
      reschedulePingTimer();
    }
  }

  logPlay(`ambient_phase_${phase}`);
}

/**
 * Returns whether the ambient soundscape is currently active.
 */
export function isAmbientRunning(): boolean {
  return running;
}
