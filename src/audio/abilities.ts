/**
 * abilities.ts — Synthesized sound effects for combat actions and ability deployments
 *
 * All audio is synthesized via Tone.js 14.x — no sample files.
 * Every function guards against an uninitialized or suspended AudioContext
 * by checking `isAudioReady()` before scheduling any nodes.
 *
 * Synthesis approaches:
 *   Torpedo fire    — rising filtered noise burst ~200 ms, pneumatic whoosh
 *   Torpedo hit     — FM metallic ping ~400-800 Hz, sharp attack, quick decay
 *   Torpedo miss    — muffled low thud ~150 ms, understated
 *   Torpedo sunk    — low rumble ~80-150 Hz with descending pitch sweep, ~800 ms
 *   Sonar ping      — sine chirp 800→1200→800 Hz with delay echo, ~400 ms
 *   Recon drone     — descending high-pitch beep series, radar sweep ~600 ms
 *   Radar jammer    — white noise burst through bandpass with wobble LFO, ~400 ms
 *   Depth Charge    — low-frequency noise burst (100–200 Hz) + sub-bass rumble (50 Hz), ~1 s
 *   Silent Running activate — descending tone (500→100 Hz) with low-pass filter sweep, ~500 ms
 *   Silent Running expire   — ascending tone (100→400 Hz), ~300 ms
 *   G-SONAR         — deep bass sweep (200→400 Hz) + harmonic layer (600→1200 Hz) + delay echo, ~800 ms
 *   Acoustic Cloak  — white noise through closing bandpass (1200→200 Hz) with LFO wobble, ~500 ms
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

// ---------------------------------------------------------------------------
// Torpedo fire
// ---------------------------------------------------------------------------

/**
 * Pneumatic launch whoosh: white noise run through a rising low-pass filter
 * over ~200 ms — compressed air expelling a torpedo into water.
 */
export function playTorpedoFireSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_fire');

  try {
    const vol = new Tone.Volume(-8).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.12,
      sustain: 0.1,
      release: 0.08,
    }).connect(vol);

    // Low-pass filter sweeps upward to simulate the rush of expelled air/water
    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 200,
      rolloff: -24,
    }).connect(env);

    const noise = new Tone.Noise('white').connect(lpf);

    const now = Tone.now();
    const duration = 0.18;

    noise.start(now);

    // Rising filter sweep — starts muffled, opens up as the torpedo launches
    lpf.frequency.setValueAtTime(200, now);
    lpf.frequency.exponentialRampToValueAtTime(2400, now + duration);

    env.triggerAttackRelease(duration, now);

    setTimeout(() => {
      noise.stop();
      noise.disconnect();
      lpf.disconnect();
      env.disconnect();
      vol.disconnect();
      noise.dispose();
      lpf.dispose();
      env.dispose();
      vol.dispose();
    }, 500);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'torpedo_fire', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Torpedo hit
// ---------------------------------------------------------------------------

/**
 * Metallic hull impact: FM synthesis around 500 Hz with a fast attack and
 * quick decay — the satisfying clang of a torpedo striking steel plate.
 */
export function playTorpedoHitSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_hit');

  try {
    // ---- FM carrier — the primary "ping" --------------------------------
    const vol = new Tone.Volume(-6).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.003,
      decay: 0.18,
      sustain: 0.05,
      release: 0.15,
    }).connect(vol);

    const carrier = new Tone.Oscillator({
      type: 'sine',
      frequency: 520,
    }).connect(env);

    // ---- FM modulator — adds metallic inharmonic partials ---------------
    const modVol = new Tone.Volume(-10).toDestination();
    const modEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.09,
      sustain: 0,
      release: 0.05,
    }).connect(modVol);

    const modulator = new Tone.Oscillator({
      type: 'sine',
      frequency: 370,  // non-harmonic ratio for metallic quality
    }).connect(modEnv);

    // ---- Short noise transient — impact crack ---------------------------
    const crackVol = new Tone.Volume(-14).toDestination();
    const crackEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.04,
      sustain: 0,
      release: 0.02,
    }).connect(crackVol);

    const crackFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 700,
      Q: 1.5,
    }).connect(crackEnv);

    const crackNoise = new Tone.Noise('white').connect(crackFilter);

    const now = Tone.now();

    carrier.start(now);
    modulator.start(now);
    crackNoise.start(now);

    // Slight pitch drop on the carrier for a "bending metal" quality
    carrier.frequency.setValueAtTime(520, now);
    carrier.frequency.exponentialRampToValueAtTime(380, now + 0.2);

    env.triggerAttackRelease(0.3, now);
    modEnv.triggerAttackRelease(0.1, now);
    crackEnv.triggerAttackRelease(0.04, now);

    setTimeout(() => {
      carrier.stop();
      modulator.stop();
      crackNoise.stop();
      carrier.disconnect();
      modulator.disconnect();
      crackNoise.disconnect();
      crackFilter.disconnect();
      env.disconnect();
      modEnv.disconnect();
      crackEnv.disconnect();
      vol.disconnect();
      modVol.disconnect();
      crackVol.disconnect();
      carrier.dispose();
      modulator.dispose();
      crackNoise.dispose();
      crackFilter.dispose();
      env.dispose();
      modEnv.dispose();
      crackEnv.dispose();
      vol.dispose();
      modVol.dispose();
      crackVol.dispose();
    }, 700);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'torpedo_hit', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Torpedo miss
// ---------------------------------------------------------------------------

/**
 * Muffled underwater thud: very brief, heavily filtered noise — the dull
 * concussion of a torpedo detonating harmlessly in open water. Deliberately
 * understated so frequent misses don't become tiresome.
 */
export function playTorpedoMissSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_miss');

  try {
    const vol = new Tone.Volume(-14).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.08,
      sustain: 0.02,
      release: 0.06,
    }).connect(vol);

    // Heavy low-pass to keep it very muffled (~120 Hz cutoff)
    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 120,
      rolloff: -24,
    }).connect(env);

    const noise = new Tone.Noise('brown').connect(lpf);

    const now = Tone.now();
    const duration = 0.13;

    noise.start(now);
    env.triggerAttackRelease(duration, now);

    setTimeout(() => {
      noise.stop();
      noise.disconnect();
      lpf.disconnect();
      env.disconnect();
      vol.disconnect();
      noise.dispose();
      lpf.dispose();
      env.dispose();
      vol.dispose();
    }, 400);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'torpedo_miss', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Torpedo sunk
// ---------------------------------------------------------------------------

/**
 * Ship destroyed: low rumble centered at 80–150 Hz with a descending pitch
 * sweep, layered with groaning metallic oscillator. ~800 ms. Heavy and final.
 */
export function playTorpedoSunkSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_sunk');

  try {
    // ---- Layer 1: Low rumble — filtered noise shockwave ------------------
    const rumbleVol = new Tone.Volume(-4).toDestination();
    const rumbleEnv = new Tone.AmplitudeEnvelope({
      attack: 0.008,
      decay: 0.5,
      sustain: 0.2,
      release: 0.35,
    }).connect(rumbleVol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 120,
      Q: 0.8,
    }).connect(rumbleEnv);

    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 250,
      rolloff: -24,
    }).connect(bandpass);

    const rumbleNoise = new Tone.Noise('brown').connect(lpf);

    // ---- Layer 2: Groaning metal oscillator — descending tone -----------
    const groanVol = new Tone.Volume(-8).toDestination();
    const groanEnv = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.4,
      sustain: 0.3,
      release: 0.3,
    }).connect(groanVol);

    const groan = new Tone.Oscillator({
      type: 'sawtooth',
      frequency: 140,
    }).connect(groanEnv);

    // ---- Layer 3: Sub-bass punch — sine at very low frequency -----------
    const subVol = new Tone.Volume(-2).toDestination();
    const subEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.6,
      sustain: 0.1,
      release: 0.2,
    }).connect(subVol);

    const sub = new Tone.Oscillator({
      type: 'sine',
      frequency: 65,
    }).connect(subEnv);

    const now = Tone.now();
    const duration = 0.8;

    rumbleNoise.start(now);
    groan.start(now);
    sub.start(now);

    // Descending bandpass sweep — pressure wave dissipating
    bandpass.frequency.setValueAtTime(150, now);
    bandpass.frequency.exponentialRampToValueAtTime(55, now + duration);

    // Descending groan — hull tearing / sinking
    groan.frequency.setValueAtTime(140, now);
    groan.frequency.exponentialRampToValueAtTime(55, now + duration);

    rumbleEnv.triggerAttackRelease(duration, now);
    groanEnv.triggerAttackRelease(duration - 0.1, now);
    subEnv.triggerAttackRelease(duration, now);

    setTimeout(() => {
      rumbleNoise.stop();
      groan.stop();
      sub.stop();
      rumbleNoise.disconnect();
      groan.disconnect();
      sub.disconnect();
      lpf.disconnect();
      bandpass.disconnect();
      rumbleEnv.disconnect();
      groanEnv.disconnect();
      subEnv.disconnect();
      rumbleVol.disconnect();
      groanVol.disconnect();
      subVol.disconnect();
      rumbleNoise.dispose();
      groan.dispose();
      sub.dispose();
      lpf.dispose();
      bandpass.dispose();
      rumbleEnv.dispose();
      groanEnv.dispose();
      subEnv.dispose();
      rumbleVol.dispose();
      groanVol.dispose();
      subVol.dispose();
    }, 1400);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'torpedo_sunk', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Sonar ping
// ---------------------------------------------------------------------------

/**
 * Classic submarine sonar: sine chirp sweeping 800→1200→800 Hz with a
 * short delay feedback for the echo effect. ~400 ms. Iconic and clean.
 */
export function playSonarPingSound(): void {
  if (!isAudioReady()) return;

  logPlay('sonar_ping');

  try {
    // ---- Primary chirp oscillator ----------------------------------------
    const vol = new Tone.Volume(-10).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.25,
      sustain: 0.1,
      release: 0.18,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 800,
    }).connect(env);

    // ---- Delay for echo effect -------------------------------------------
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.22,
      feedback: 0.25,
      wet: 0.35,
    }).toDestination();

    osc.connect(delay);

    const now = Tone.now();
    const halfDuration = 0.18;

    osc.start(now);

    // Rising then falling frequency sweep — the classic "ping" shape
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + halfDuration);
    osc.frequency.exponentialRampToValueAtTime(800, now + halfDuration * 2);

    env.triggerAttackRelease(0.35, now);

    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      env.disconnect();
      delay.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      delay.dispose();
      vol.dispose();
    }, 900);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'sonar_ping', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Recon Drone scan
// ---------------------------------------------------------------------------

/**
 * Electronic radar sweep: a rapid descending series of five short sine beeps
 * from 2400 Hz down to 900 Hz, evoking a fast automated scan sequence. ~600 ms.
 */
export function playReconDroneSound(): void {
  if (!isAudioReady()) return;

  logPlay('recon_drone');

  try {
    // Five beeps, each offset by 100 ms, descending in pitch
    const beepFrequencies = [2400, 1900, 1500, 1200, 900];
    const beepNodes: Array<{
      osc: Tone.Oscillator;
      env: Tone.AmplitudeEnvelope;
      vol: Tone.Volume;
    }> = [];

    const now = Tone.now();

    for (let i = 0; i < beepFrequencies.length; i++) {
      const vol = new Tone.Volume(-14).toDestination();
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.004,
        decay: 0.06,
        sustain: 0,
        release: 0.03,
      }).connect(vol);

      const osc = new Tone.Oscillator({
        type: 'sine',
        frequency: beepFrequencies[i],
      }).connect(env);

      const offset = i * 0.1;
      osc.start(now + offset);
      env.triggerAttackRelease(0.07, now + offset);

      beepNodes.push({ osc, env, vol });
    }

    setTimeout(() => {
      for (const { osc, env, vol } of beepNodes) {
        osc.stop();
        osc.disconnect();
        env.disconnect();
        vol.disconnect();
        osc.dispose();
        env.dispose();
        vol.dispose();
      }
    }, 1000);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'recon_drone', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Radar Jammer deploy
// ---------------------------------------------------------------------------

/**
 * Electronic warfare burst: white noise through a bandpass filter whose
 * center frequency is modulated by an LFO to create a wobbling, unstable
 * "jamming" texture. ~400 ms. Disruptive and unsettling.
 */
export function playRadarJammerSound(): void {
  if (!isAudioReady()) return;

  logPlay('radar_jammer');

  try {
    // ---- Bandpass-filtered noise — the jamming signal -------------------
    const vol = new Tone.Volume(-8).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.25,
      sustain: 0.3,
      release: 0.18,
    }).connect(vol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 800,
      Q: 2.5,
    }).connect(env);

    const noise = new Tone.Noise('white').connect(bandpass);

    // ---- LFO to wobble the bandpass center frequency -------------------
    // This creates the characteristic "warbling" of electronic jamming.
    const lfo = new Tone.LFO({
      type: 'sine',
      frequency: 18,   // fast wobble — 18 Hz modulation rate
      min: 400,
      max: 1600,
    });
    lfo.connect(bandpass.frequency);

    // ---- Low hum layer — continuous interference tone ------------------
    const humVol = new Tone.Volume(-16).toDestination();
    const humEnv = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.3,
      sustain: 0.2,
      release: 0.15,
    }).connect(humVol);

    const hum = new Tone.Oscillator({
      type: 'sawtooth',
      frequency: 120,
    }).connect(humEnv);

    const now = Tone.now();
    const duration = 0.38;

    noise.start(now);
    lfo.start(now);
    hum.start(now);

    env.triggerAttackRelease(duration, now);
    humEnv.triggerAttackRelease(duration, now);

    setTimeout(() => {
      noise.stop();
      lfo.stop();
      hum.stop();
      noise.disconnect();
      lfo.disconnect();
      hum.disconnect();
      bandpass.disconnect();
      env.disconnect();
      humEnv.disconnect();
      vol.disconnect();
      humVol.disconnect();
      noise.dispose();
      lfo.dispose();
      hum.dispose();
      bandpass.dispose();
      env.dispose();
      humEnv.dispose();
      vol.dispose();
      humVol.dispose();
    }, 800);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'radar_jammer', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// G-SONAR — global sonar sweep
// ---------------------------------------------------------------------------

/**
 * Powerful active sonar flooding an entire depth layer: a deep bass sine sweep
 * from 200→400 Hz as the main layer, layered with a quieter harmonic sine at
 * 600→1200 Hz, and a FeedbackDelay echo to suggest the signal bouncing through
 * the water column. More commanding and sustained than the standard sonar ping.
 * ~800 ms total.
 */
export function playGSonarSound(): void {
  if (!isAudioReady()) return;

  logPlay('g_sonar');

  try {
    // ---- Layer 1: Main bass sweep — 200→400 Hz --------------------------
    // The deep sweep is the dominant sonic element; it conveys the sense of a
    // wide-area signal propagating through volume rather than a point source.
    const mainVol = new Tone.Volume(-6).toDestination();
    const mainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.45,
      sustain: 0.35,
      release: 0.3,
    }).connect(mainVol);

    const mainOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 200,
    }).connect(mainEnv);

    // ---- Layer 2: Harmonic layer — 600→1200 Hz --------------------------
    // A quieter upper harmonic that adds brightness and reinforces the sense
    // of an energetic, wide-spectrum sonar pulse.
    const harmVol = new Tone.Volume(-14).toDestination();
    const harmEnv = new Tone.AmplitudeEnvelope({
      attack: 0.03,
      decay: 0.4,
      sustain: 0.2,
      release: 0.28,
    }).connect(harmVol);

    const harmOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 600,
    }).connect(harmEnv);

    // ---- Delay echo — applied to both layers via a shared send ----------
    // Wet-only delay routed to destination independently; this avoids routing
    // both layers through a single node which would complicate cleanup.
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.32,
      feedback: 0.28,
      wet: 0.3,
    }).toDestination();

    mainOsc.connect(delay);
    harmOsc.connect(delay);

    // ---- Schedule playback -----------------------------------------------
    const now = Tone.now();
    const duration = 0.75;

    mainOsc.start(now);
    harmOsc.start(now);

    // Bass sweep: 200 Hz → 400 Hz over the full duration — a slow, imposing
    // upward movement that contrasts with the standard ping's V-shape.
    mainOsc.frequency.setValueAtTime(200, now);
    mainOsc.frequency.exponentialRampToValueAtTime(400, now + duration);

    // Harmonic sweep: 600 Hz → 1200 Hz — rises in proportion to the bass layer.
    harmOsc.frequency.setValueAtTime(600, now);
    harmOsc.frequency.exponentialRampToValueAtTime(1200, now + duration);

    mainEnv.triggerAttackRelease(duration, now);
    harmEnv.triggerAttackRelease(duration - 0.05, now);

    // ---- Cleanup after sound + echo tail complete ------------------------
    setTimeout(() => {
      mainOsc.stop();
      harmOsc.stop();
      mainOsc.disconnect();
      harmOsc.disconnect();
      mainEnv.disconnect();
      harmEnv.disconnect();
      delay.disconnect();
      mainVol.disconnect();
      harmVol.disconnect();
      mainOsc.dispose();
      harmOsc.dispose();
      mainEnv.dispose();
      harmEnv.dispose();
      delay.dispose();
      mainVol.dispose();
      harmVol.dispose();
    }, 1600);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'g_sonar', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Acoustic Cloak — cloaking activation
// ---------------------------------------------------------------------------

/**
 * Brief ascending two-tone chime: 400 Hz → 600 Hz over ~200 ms with clean
 * attack envelope — sounds like a "credit accepted" confirmation.
 */
export function playPurchaseSound(): void {
  if (!isAudioReady()) return;

  logPlay('purchase');

  try {
    const vol = new Tone.Volume(-10).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.1,
      sustain: 0.05,
      release: 0.08,
    }).connect(vol);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 400,
    }).connect(env);

    const now = Tone.now();

    osc.start(now);

    // Two-tone ascending chime: 400 Hz → 600 Hz
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.setValueAtTime(600, now + 0.1);

    env.triggerAttackRelease(0.08, now);
    env.triggerAttackRelease(0.08, now + 0.1);

    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      vol.dispose();
    }, 500);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'purchase', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Insufficient funds rejection
// ---------------------------------------------------------------------------

/**
 * Short harsh buzz: sawtooth wave through bandpass filter (~350 Hz center),
 * rapid amplitude decay ~250 ms. Distinct "denied" character.
 */
export function playInsufficientFundsSound(): void {
  if (!isAudioReady()) return;

  logPlay('insufficient_funds');

  try {
    const vol = new Tone.Volume(-8).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.15,
      sustain: 0.05,
      release: 0.08,
    }).connect(vol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 350,
      Q: 2,
    }).connect(env);

    const osc = new Tone.Oscillator({
      type: 'sawtooth',
      frequency: 120,
    }).connect(bandpass);

    const now = Tone.now();

    osc.start(now);
    env.triggerAttackRelease(0.2, now);

    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      bandpass.disconnect();
      env.disconnect();
      vol.disconnect();
      osc.dispose();
      bandpass.dispose();
      env.dispose();
      vol.dispose();
    }, 500);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'insufficient_funds', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Acoustic Cloak — cloaking activation
// ---------------------------------------------------------------------------

/**
 * Ships disappearing from sensors: white noise passed through a bandpass
 * filter whose center frequency closes from 1200 Hz down to 200 Hz over
 * ~500 ms, with an LFO providing subtle wobble throughout. The overall level
 * is quieter than Silent Running activation — this is a stealth action that
 * should feel ethereal rather than dramatic.
 */
export function playAcousticCloakSound(): void {
  if (!isAudioReady()) return;

  logPlay('acoustic_cloak');

  try {
    // ---- Bandpass-filtered noise — the dissolving sensor contact ---------
    const vol = new Tone.Volume(-14).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.06,     // medium attack — eases in gently
      decay: 0.35,
      sustain: 0.25,
      release: 0.15,    // fades to nothing at the end
    }).connect(vol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 1200,
      Q: 1.8,           // moderately resonant to give the noise tonal color
    }).connect(env);

    const noise = new Tone.Noise('white').connect(bandpass);

    // ---- LFO for subtle wobble on the filter frequency ------------------
    // 8 Hz modulation in a narrow range (±80 Hz around the sweep center)
    // gives an unstable, ghostly quality without being distracting.
    const lfo = new Tone.LFO({
      type: 'sine',
      frequency: 8,
      min: -80,
      max: 80,
    });
    lfo.connect(bandpass.detune);  // modulate via detune for additive offset

    // ---- Schedule playback -----------------------------------------------
    const now = Tone.now();
    const duration = 0.5;

    noise.start(now);
    lfo.start(now);

    // Bandpass sweeps downward: 1200→200 Hz, the sensor contact narrowing and
    // dropping in frequency as the cloak engages.
    bandpass.frequency.setValueAtTime(1200, now);
    bandpass.frequency.exponentialRampToValueAtTime(200, now + duration);

    env.triggerAttackRelease(duration, now);

    // ---- Cleanup ----------------------------------------------------------
    setTimeout(() => {
      noise.stop();
      lfo.stop();
      noise.disconnect();
      lfo.disconnect();
      bandpass.disconnect();
      env.disconnect();
      vol.disconnect();
      noise.dispose();
      lfo.dispose();
      bandpass.dispose();
      env.dispose();
      vol.dispose();
    }, 900);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'acoustic_cloak', error: String(err) });
    } catch {
      // ignore
    }
  }
}
