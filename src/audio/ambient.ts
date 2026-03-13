/**
 * ambient.ts — Persistent submarine ambient soundscape
 *
 * Manages five continuous layers:
 *   1. Submarine hum        — low-frequency sine oscillator (~40 Hz) representing
 *                             the reactor/engine vibration of a submerged vessel.
 *   2. Ocean noise floor    — brown noise through a tight lowpass, barely audible,
 *                             providing acoustic depth and masking silence.
 *   3. Ocean mid-texture    — pink noise through a bandpass at 400 Hz, adding
 *                             mid-frequency water character.
 *   4. Periodic sonar       — a soft atmospheric chirp (1200→1600 Hz) fired on a
 *                             timer. Much quieter than the ability sonar ping; this
 *                             is background texture, not a gameplay cue.
 *   5. Hull thermal creaks  — random low-level sine/triangle pings (300–600 Hz)
 *                             at randomised intervals, simulating hull stress.
 *   6. Distant bio sounds   — very slow sine sweep (80→200 Hz) at random long
 *                             intervals, evoking distant marine life.
 *
 * Unlike the fire-and-forget SFX in abilities.ts, layers 1–3 are persistent
 * nodes kept alive until `stopAmbient()` is called. Layers 4–6 are periodic
 * fire-and-forget functions driven by setInterval timers.
 *
 * Phase-responsive scaling adjusts hum frequency/volume, noise cutoff/volume,
 * sonar ping interval, and hull creak interval to build tension from sparse →
 * urgent as the game progresses.
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

// Ocean noise floor — brown noise, bass layer
let noiseGen: Tone.Noise | null = null;
let noiseFilter: Tone.Filter | null = null;
let noiseVol: Tone.Volume | null = null;

// Ocean mid-texture — pink noise, bandpass layer
let pinkNoiseGen: Tone.Noise | null = null;
let pinkNoiseFilter: Tone.Filter | null = null;
let pinkNoiseVol: Tone.Volume | null = null;

// Periodic sonar ping timer
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pingIntervalMs = 10_000;

// Hull thermal creak timer
let creakTimer: ReturnType<typeof setTimeout> | null = null;
// Base interval range for early phase; updated by updateAmbientPhase.
let creakMinMs = 20_000;
let creakMaxMs = 30_000;

// Distant biological sound timer
let bioTimer: ReturnType<typeof setTimeout> | null = null;
const BIO_MIN_MS = 25_000;
const BIO_MAX_MS = 45_000;

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

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Fire a single atmospheric sonar chirp: a short sine that ramps from
 * 1200→1600 Hz over ~180 ms at -24 dB. Creates its own nodes, plays, then
 * disposes — same fire-and-forget pattern as the SFX module.
 */
function firePingSweep(): void {
  if (!isAudioReady()) return;

  try {
    const vol = new Tone.Volume(-24).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.12,
      sustain: 0.0,
      release: 0.06,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 1200,
    }).connect(env);

    const now = Tone.now();
    const duration = 0.18;

    osc.start(now);

    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + duration);

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
 * Fire a single hull thermal creak: a brief sine or triangle ping at a random
 * frequency between 300–600 Hz, at -28 dB. Attack 1 ms, decay 80 ms, no
 * sustain, release 40 ms. Fire-and-forget; disposes itself.
 */
function fireHullCreak(): void {
  if (!isAudioReady()) return;

  try {
    const freq = randBetween(300, 600);
    const oscType: 'sine' | 'triangle' = Math.random() < 0.5 ? 'sine' : 'triangle';

    const vol = new Tone.Volume(-28).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.08,
      sustain: 0.0,
      release: 0.04,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: oscType,
      frequency: freq,
    }).connect(env);

    const now = Tone.now();
    const duration = 0.08; // decay length

    osc.start(now);
    env.triggerAttackRelease(duration, now);

    setTimeout(() => {
      try { osc.stop(); } catch { /* ignore */ }
      osc.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      vol.dispose();
    }, 500);

    logPlay('ambient_hull_creak');
  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'ambient_hull_creak', error: String(err) });
    } catch {
      // ignore
    }
  }
}

/**
 * Fire a single distant biological sound: a slow sine sweep from 80→200 Hz
 * over 3 seconds at -30 dB. Attack 200 ms, decay 2 s, sustain 0.1, release
 * 800 ms. Fire-and-forget; disposes itself.
 */
function fireBioSound(): void {
  if (!isAudioReady()) return;

  try {
    const vol = new Tone.Volume(-30).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.2,
      decay: 2.0,
      sustain: 0.1,
      release: 0.8,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 80,
    }).connect(env);

    const now = Tone.now();
    const sweepDuration = 3.0;

    osc.start(now);
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + sweepDuration);

    // Total envelope: attack(0.2) + decay(2.0) + (sustain tail) + release(0.8) ≈ 3.5 s
    env.triggerAttackRelease(sweepDuration, now);

    setTimeout(() => {
      try { osc.stop(); } catch { /* ignore */ }
      osc.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      vol.dispose();
    }, 5_000);

    logPlay('ambient_bio_sound');
  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'ambient_bio_sound', error: String(err) });
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

/**
 * Schedule the next hull creak using a random delay within [creakMinMs,
 * creakMaxMs]. Each firing reschedules itself so the interval stays
 * randomised rather than being a fixed setInterval.
 */
function scheduleNextCreak(): void {
  if (!running) return;
  const delay = randBetween(creakMinMs, creakMaxMs);
  creakTimer = setTimeout(() => {
    fireHullCreak();
    scheduleNextCreak();
  }, delay);
}

/**
 * Schedule the next distant bio sound using a random delay within
 * [BIO_MIN_MS, BIO_MAX_MS]. Each firing reschedules itself.
 */
function scheduleNextBioSound(): void {
  if (!running) return;
  const delay = randBetween(BIO_MIN_MS, BIO_MAX_MS);
  bioTimer = setTimeout(() => {
    fireBioSound();
    scheduleNextBioSound();
  }, delay);
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

    // ---- Ocean noise floor — brown bass layer ----------------------------
    noiseVol = new Tone.Volume(-35).toDestination();
    noiseFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 100,
      rolloff: -24,
    }).connect(noiseVol);

    noiseGen = new Tone.Noise('brown').connect(noiseFilter);
    noiseGen.start();

    // ---- Ocean mid-texture — pink bandpass layer -------------------------
    pinkNoiseVol = new Tone.Volume(-40).toDestination();
    pinkNoiseFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 400,
      Q: 0.8,
    }).connect(pinkNoiseVol);

    pinkNoiseGen = new Tone.Noise('pink').connect(pinkNoiseFilter);
    pinkNoiseGen.start();

    // ---- Periodic sonar ping ---------------------------------------------
    pingIntervalMs = 10_000;
    reschedulePingTimer();

    // ---- Hull thermal creaks — early-phase timing ------------------------
    creakMinMs = 20_000;
    creakMaxMs = 30_000;
    scheduleNextCreak();

    // ---- Distant biological sounds ---------------------------------------
    scheduleNextBioSound();

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
  // Mark stopped first so recursive setTimeout callbacks in scheduleNextCreak
  // / scheduleNextBioSound see running=false and do not re-arm.
  running = false;

  // Clear ping timer
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  // Clear hull creak timer
  if (creakTimer !== null) {
    clearTimeout(creakTimer);
    creakTimer = null;
  }

  // Clear bio sound timer
  if (bioTimer !== null) {
    clearTimeout(bioTimer);
    bioTimer = null;
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

  // Stop and dispose brown noise floor nodes
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

  // Stop and dispose pink noise mid-texture nodes
  if (pinkNoiseGen !== null) {
    try { pinkNoiseGen.stop(); } catch { /* ignore */ }
    try { pinkNoiseGen.disconnect(); pinkNoiseGen.dispose(); } catch { /* ignore */ }
    pinkNoiseGen = null;
  }
  if (pinkNoiseFilter !== null) {
    try { pinkNoiseFilter.disconnect(); pinkNoiseFilter.dispose(); } catch { /* ignore */ }
    pinkNoiseFilter = null;
  }
  if (pinkNoiseVol !== null) {
    try { pinkNoiseVol.disconnect(); pinkNoiseVol.dispose(); } catch { /* ignore */ }
    pinkNoiseVol = null;
  }

  try {
    getLogger().emit('audio.play', { sound: 'ambient_stop' });
  } catch {
    // ignore
  }
}

/**
 * Ramp ambient parameters to match the current game phase.
 * Uses Tone.js `rampTo` for smooth ~2s transitions so changes are never
 * jarring. Also updates the sonar ping and hull creak intervals.
 *
 * | Parameter         | Early  | Mid    | Escalation | Endgame |
 * |-------------------|--------|--------|------------|---------|
 * | Hum freq (Hz)     | 40     | 35     | 30         | 25      |
 * | Hum vol (dB)      | -22    | -18    | -16        | -14     |
 * | Noise vol (dB)    | -35    | -28    | -24        | -20     |
 * | Noise cutoff      | 80 Hz  | 120 Hz | 180 Hz     | 250 Hz  |
 * | Ping interval     | 10 s   | 7 s    | 5 s        | 3 s     |
 * | Creak interval    | 20-30s | 15-25s | 12-20s     | 8-15s   |
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
    creakMin: number;
    creakMax: number;
  };

  const params: Record<AudioPhase, PhaseParams> = {
    setup:             { humFreq: 40, humDb: -22, noiseDb: -35, noiseCutoff:  80, pingMs: 10_000, creakMin: 20_000, creakMax: 30_000 },
    combat_early:      { humFreq: 40, humDb: -22, noiseDb: -35, noiseCutoff:  80, pingMs: 10_000, creakMin: 20_000, creakMax: 30_000 },
    combat_mid:        { humFreq: 35, humDb: -18, noiseDb: -28, noiseCutoff: 120, pingMs:  7_000, creakMin: 15_000, creakMax: 25_000 },
    combat_escalation: { humFreq: 30, humDb: -16, noiseDb: -24, noiseCutoff: 180, pingMs:  5_000, creakMin: 12_000, creakMax: 20_000 },
    combat_endgame:    { humFreq: 25, humDb: -14, noiseDb: -20, noiseCutoff: 250, pingMs:  3_000, creakMin:  8_000, creakMax: 15_000 },
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

  // Update creak interval range. The in-flight setTimeout will fire at the
  // old interval; the range update takes effect on the next reschedule inside
  // scheduleNextCreak(), which is called automatically after each creak fires.
  creakMinMs = p.creakMin;
  creakMaxMs = p.creakMax;

  logPlay(`ambient_phase_${phase}`);
}

/**
 * Returns whether the ambient soundscape is currently active.
 */
export function isAmbientRunning(): boolean {
  return running;
}
