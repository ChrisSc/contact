/**
 * abilities.ts — Synthesized sound effects for ability deployments
 *
 * All audio is synthesized via Tone.js 14.x — no sample files.
 * Every function guards against an uninitialized or suspended AudioContext
 * by checking `isAudioReady()` before scheduling any nodes.
 *
 * Synthesis approaches:
 *   Depth Charge    — low-frequency noise burst (100–200 Hz) + sub-bass rumble (50 Hz), ~1 s
 *   Silent Running activate — descending tone (500→100 Hz) with low-pass filter sweep, ~500 ms
 *   Silent Running expire   — ascending tone (100→400 Hz), ~300 ms
 */

import * as Tone from 'tone';
import { isAudioReady } from './audio-manager';
import { getLogger } from '../observability/logger';

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

// ---------------------------------------------------------------------------
// Depth Charge detonation
// ---------------------------------------------------------------------------

/**
 * Deep underwater explosion: bandpass-filtered noise burst centered around
 * 100–200 Hz for the initial shockwave, layered with a 50 Hz sub-bass rumble
 * that fades out over ~1 second.
 */
export function playDepthChargeSound(): void {
  if (!isAudioReady()) return;

  logPlay('depth_charge');

  try {
    // ---- Layer 1: Noise shockwave ----------------------------------------
    // White noise run through a bandpass filter sculpted around 150 Hz,
    // then a short envelope for the sharp detonation transient.
    const noiseVol = new Tone.Volume(-6).toDestination();
    const noiseEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.25,
      sustain: 0.1,
      release: 0.5,
    }).connect(noiseVol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 150,
      Q: 1.2,
    }).connect(noiseEnv);

    const lowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: 300,
      rolloff: -24,
    }).connect(bandpass);

    const noise = new Tone.Noise('white').connect(lowpass);

    // ---- Layer 2: Sub-bass rumble -----------------------------------------
    // A sine oscillator at 50 Hz with a long decay for the low-frequency
    // underwater rumble that follows the initial explosion.
    const rumbleVol = new Tone.Volume(-4).toDestination();
    const rumbleEnv = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.6,
      sustain: 0.15,
      release: 0.4,
    }).connect(rumbleVol);

    const rumble = new Tone.Oscillator({
      type: 'sine',
      frequency: 50,
    }).connect(rumbleEnv);

    // ---- Layer 3: Mid-frequency impact crack ------------------------------
    // A second noise burst filtered higher to give the metallic crack of
    // the charge casing fracturing.
    const crackVol = new Tone.Volume(-12).toDestination();
    const crackEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.08,
      sustain: 0,
      release: 0.05,
    }).connect(crackVol);

    const crackFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 800,
      Q: 2,
    }).connect(crackEnv);

    const crackNoise = new Tone.Noise('white').connect(crackFilter);

    // ---- Schedule playback -----------------------------------------------
    const now = Tone.now();

    noise.start(now);
    noiseEnv.triggerAttackRelease(0.9, now);

    rumble.start(now);
    rumbleEnv.triggerAttackRelease(1.0, now);

    crackNoise.start(now);
    crackEnv.triggerAttackRelease(0.1, now);

    // Sweep the bandpass frequency down during the decay for the "underwater
    // pressure wave" effect — starts at 200 Hz, drops to 60 Hz over 800 ms.
    bandpass.frequency.setValueAtTime(200, now);
    bandpass.frequency.exponentialRampToValueAtTime(60, now + 0.8);

    // ---- Cleanup after sound completes -----------------------------------
    setTimeout(() => {
      noise.stop();
      rumble.stop();
      crackNoise.stop();
      noise.disconnect();
      rumble.disconnect();
      crackNoise.disconnect();
      lowpass.disconnect();
      bandpass.disconnect();
      noiseEnv.disconnect();
      rumbleEnv.disconnect();
      crackFilter.disconnect();
      crackEnv.disconnect();
      noiseVol.disconnect();
      rumbleVol.disconnect();
      crackVol.disconnect();
      noise.dispose();
      rumble.dispose();
      crackNoise.dispose();
      lowpass.dispose();
      bandpass.dispose();
      noiseEnv.dispose();
      rumbleEnv.dispose();
      crackFilter.dispose();
      crackEnv.dispose();
      noiseVol.dispose();
      rumbleVol.dispose();
      crackVol.dispose();
    }, 1400);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'depth_charge', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Silent Running — activation
// ---------------------------------------------------------------------------

/**
 * Descending tone sweep from 500 Hz down to 100 Hz over ~500 ms, layered
 * with a slow low-pass filter close that progressively swallows the signal
 * — the auditory equivalent of a submarine disappearing into silence.
 */
export function playSilentRunningActivate(): void {
  if (!isAudioReady()) return;

  logPlay('silent_running_activate');

  try {
    // ---- Descending oscillator -------------------------------------------
    const mainVol = new Tone.Volume(-10).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.3,
      sustain: 0.4,
      release: 0.2,
    }).connect(mainVol);

    // Low-pass filter that closes as the tone descends, emphasizing the
    // "disappearing" quality.
    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 600,
      rolloff: -12,
    }).connect(env);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 500,
    }).connect(lpf);

    // ---- Secondary harmonic layer ----------------------------------------
    // A quieter oscillator one octave below adds depth to the tone.
    const subVol = new Tone.Volume(-18).toDestination();
    const subEnv = new Tone.AmplitudeEnvelope({
      attack: 0.03,
      decay: 0.35,
      sustain: 0.3,
      release: 0.25,
    }).connect(subVol);

    const subOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 250,
    }).connect(subEnv);

    // ---- Schedule playback -----------------------------------------------
    const now = Tone.now();
    const duration = 0.5;

    osc.start(now);
    subOsc.start(now);

    // Descending frequency sweep
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + duration);

    subOsc.frequency.setValueAtTime(250, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + duration);

    // Low-pass filter closes down over the duration
    lpf.frequency.setValueAtTime(600, now);
    lpf.frequency.exponentialRampToValueAtTime(80, now + duration);

    env.triggerAttackRelease(duration - 0.05, now);
    subEnv.triggerAttackRelease(duration - 0.05, now);

    // ---- Cleanup ----------------------------------------------------------
    setTimeout(() => {
      osc.stop();
      subOsc.stop();
      osc.disconnect();
      subOsc.disconnect();
      lpf.disconnect();
      env.disconnect();
      subEnv.disconnect();
      mainVol.disconnect();
      subVol.disconnect();
      osc.dispose();
      subOsc.dispose();
      lpf.dispose();
      env.dispose();
      subEnv.dispose();
      mainVol.dispose();
      subVol.dispose();
    }, 900);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'silent_running_activate', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Silent Running — expiry
// ---------------------------------------------------------------------------

/**
 * Brief ascending tone from 100 Hz up to 400 Hz over ~300 ms.
 * Deliberately subtle — a quiet notification that silent running has ended
 * and the ship is back on sensors.
 */
export function playSilentRunningExpire(): void {
  if (!isAudioReady()) return;

  logPlay('silent_running_expire');

  try {
    // Noticeably quieter than activation — this is a background alert.
    const vol = new Tone.Volume(-16).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.15,
      sustain: 0.2,
      release: 0.12,
    }).connect(vol);

    // Slight high-pass to keep it thin and un-intrusive.
    const hpf = new Tone.Filter({
      type: 'highpass',
      frequency: 80,
      rolloff: -12,
    }).connect(env);

    const osc = new Tone.Oscillator({
      type: 'triangle',
      frequency: 100,
    }).connect(hpf);

    const now = Tone.now();
    const duration = 0.3;

    osc.start(now);

    // Ascending frequency sweep
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + duration);

    env.triggerAttackRelease(duration - 0.03, now);

    // ---- Cleanup ----------------------------------------------------------
    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      hpf.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      hpf.dispose();
      env.dispose();
      vol.dispose();
    }, 600);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'silent_running_expire', error: String(err) });
    } catch {
      // ignore
    }
  }
}
