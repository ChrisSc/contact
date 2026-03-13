/**
 * abilities.ts — Synthesized sound effects for combat actions and ability deployments
 *
 * All audio is synthesized via Tone.js 14.x — no sample files.
 * Every function guards against an uninitialized or suspended AudioContext
 * by checking `isAudioReady()` before scheduling any nodes.
 *
 * Synthesis approaches:
 *   Torpedo fire    — two-phase launch: pneumatic bandpass burst (0-60ms) + brown-noise
 *                     water rush with LPF sweep (40-300ms) + 80 Hz sub-bass thud
 *   Torpedo hit     — randomised FM carrier (490-550 Hz) descending with metallic modulator,
 *                     sharp bandpass noise transient, sub-bass (55 Hz) with Tremolo
 *   Torpedo miss    — low-pass brown noise thud, descending sine Doppler (160→80 Hz),
 *                     high-pass water splash — audible but understated
 *   Torpedo sunk    — 5-layer catastrophic destruction ~1.4s: brown noise shockwave,
 *                     two detuned sawtooth groans, sub-bass Tremolo, bubble bursts,
 *                     structural snap triangle
 *   Sonar ping      — single 1500 Hz sine, long natural decay, Reverb echo + FeedbackDelay
 *   Recon drone     — 5 descending beeps at 70ms intervals + noise bandpass sweep underlay
 *   Radar Jammer    — BitCrusher noise + alternating square tone 300/500 Hz + LFO wobble
 *   Depth charge    — detonator click at 0ms, three-layer explosion at +120ms, water eruption at +150ms
 *   Silent Running  — slow descent 500→80 Hz / filter 600→60 Hz with Reverb tail + dissolving static
 *   Silent Running expire — two-note ascending chime (200 Hz then 350 Hz), clean sine
 *   G-SONAR         — deep bass sweep 150→400 Hz + harmonic 450→1200 Hz + noise sweep + delay
 *   Acoustic Cloak  — bandpass close 1200→180 Hz with wide LFO + reversed-envelope sine pad
 *   Purchase        — three-tone ascending chime (400/600/800 Hz) with Reverb
 *   Insufficient funds — two BitCrusher-filtered sawtooth buzzes at 120/100 Hz
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
 * Click...BOOM timing: a 2000 Hz detonator click at t=0, followed at +120ms
 * by a three-layer underwater explosion (noise shockwave, sub-bass rumble,
 * casing crack), then a water eruption burst at +150ms.
 */
export function playDepthChargeSound(): void {
  if (!isAudioReady()) return;

  logPlay('depth_charge');

  try {
    const now = Tone.now();

    // ---- Phase 1 (0ms): Detonator click ----------------------------------
    const clickVol = new Tone.Volume(-10).toDestination();
    const clickEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.015,
      sustain: 0,
      release: 0.01,
    }).connect(clickVol);

    const clickOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 2000,
    }).connect(clickEnv);

    clickOsc.start(now);
    clickEnv.triggerAttackRelease(0.015, now);

    // ---- Phase 2 (+120ms): Main explosion --------------------------------
    const boom = now + 0.12;

    // Noise shockwave
    const noiseVol = new Tone.Volume(-6).toDestination();
    const noiseEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.3,
      sustain: 0.1,
      release: 0.5,
    }).connect(noiseVol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 200,
      Q: 1.2,
    }).connect(noiseEnv);

    const lowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: 300,
      rolloff: -24,
    }).connect(bandpass);

    const noise = new Tone.Noise('white').connect(lowpass);

    // Sub-bass rumble
    const rumbleVol = new Tone.Volume(-4).toDestination();
    const rumbleEnv = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.8,
      sustain: 0.15,
      release: 0.4,
    }).connect(rumbleVol);

    const rumble = new Tone.Oscillator({
      type: 'sine',
      frequency: 50,
    }).connect(rumbleEnv);

    // Casing crack
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

    noise.start(boom);
    noiseEnv.triggerAttackRelease(0.9, boom);
    bandpass.frequency.setValueAtTime(200, boom);
    bandpass.frequency.exponentialRampToValueAtTime(60, boom + 0.8);

    rumble.start(boom);
    rumbleEnv.triggerAttackRelease(1.0, boom);

    crackNoise.start(boom);
    crackEnv.triggerAttackRelease(0.1, boom);

    // ---- Phase 3 (+150ms): Water eruption --------------------------------
    const erupt = now + 0.15;

    const eruptVol = new Tone.Volume(-14).toDestination();
    const eruptEnv = new Tone.AmplitudeEnvelope({
      attack: 0.05,
      decay: 0.4,
      sustain: 0.05,
      release: 0.2,
    }).connect(eruptVol);

    const eruptHpf = new Tone.Filter({
      type: 'highpass',
      frequency: 400,
      rolloff: -12,
    }).connect(eruptEnv);

    const eruptNoise = new Tone.Noise('brown').connect(eruptHpf);

    eruptNoise.start(erupt);
    eruptEnv.triggerAttackRelease(0.5, erupt);

    // ---- Cleanup after sound completes -----------------------------------
    setTimeout(() => {
      clickOsc.stop();
      noise.stop();
      rumble.stop();
      crackNoise.stop();
      eruptNoise.stop();

      clickOsc.disconnect(); clickEnv.disconnect(); clickVol.disconnect();
      noise.disconnect(); lowpass.disconnect(); bandpass.disconnect();
      noiseEnv.disconnect(); noiseVol.disconnect();
      rumble.disconnect(); rumbleEnv.disconnect(); rumbleVol.disconnect();
      crackNoise.disconnect(); crackFilter.disconnect();
      crackEnv.disconnect(); crackVol.disconnect();
      eruptNoise.disconnect(); eruptHpf.disconnect();
      eruptEnv.disconnect(); eruptVol.disconnect();

      clickOsc.dispose(); clickEnv.dispose(); clickVol.dispose();
      noise.dispose(); lowpass.dispose(); bandpass.dispose();
      noiseEnv.dispose(); noiseVol.dispose();
      rumble.dispose(); rumbleEnv.dispose(); rumbleVol.dispose();
      crackNoise.dispose(); crackFilter.dispose();
      crackEnv.dispose(); crackVol.dispose();
      eruptNoise.dispose(); eruptHpf.dispose();
      eruptEnv.dispose(); eruptVol.dispose();
    }, 1800);

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
 * Atmospheric disappearance: descending tone 500→80 Hz over 700ms with a
 * closing low-pass filter (600→60 Hz), Reverb tail, sub-octave descent
 * (250→40 Hz), and a dissolving static layer fading into silence.
 */
export function playSilentRunningActivate(): void {
  if (!isAudioReady()) return;

  logPlay('silent_running_activate');

  try {
    const now = Tone.now();
    const duration = 0.7;

    // ---- Main descending tone with Reverb tail ---------------------------
    const mainVol = new Tone.Volume(-8).toDestination();

    const reverb = new Tone.Reverb({
      decay: 1.5,
      wet: 0.5,
    }).connect(mainVol);

    const env = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.35,
      sustain: 0.4,
      release: 0.2,
    }).connect(reverb);

    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 600,
      rolloff: -12,
    }).connect(env);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 500,
    }).connect(lpf);

    // ---- Sub-octave descent ----------------------------------------------
    const subVol = new Tone.Volume(-18).toDestination();
    const subEnv = new Tone.AmplitudeEnvelope({
      attack: 0.03,
      decay: 0.4,
      sustain: 0.3,
      release: 0.25,
    }).connect(subVol);

    const subOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 250,
    }).connect(subEnv);

    // ---- Dissolving static -----------------------------------------------
    const staticVol = new Tone.Volume(-22).toDestination();
    const staticEnv = new Tone.AmplitudeEnvelope({
      attack: 0.05,
      decay: 0.5,
      sustain: 0.1,
      release: 0.2,
    }).connect(staticVol);

    const staticLpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 800,
      rolloff: -12,
    }).connect(staticEnv);

    const staticNoise = new Tone.Noise('white').connect(staticLpf);

    // ---- Schedule playback -----------------------------------------------
    osc.start(now);
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + duration);

    lpf.frequency.setValueAtTime(600, now);
    lpf.frequency.exponentialRampToValueAtTime(60, now + duration);

    env.triggerAttackRelease(duration - 0.05, now);

    subOsc.start(now);
    subOsc.frequency.setValueAtTime(250, now);
    subOsc.frequency.exponentialRampToValueAtTime(40, now + duration);
    subEnv.triggerAttackRelease(duration - 0.05, now);

    staticNoise.start(now);
    staticLpf.frequency.setValueAtTime(800, now);
    staticLpf.frequency.exponentialRampToValueAtTime(100, now + duration);
    staticEnv.triggerAttackRelease(duration, now);

    // ---- Cleanup (2500ms to allow Reverb tail) ----------------------------
    setTimeout(() => {
      osc.stop();
      subOsc.stop();
      staticNoise.stop();

      osc.disconnect(); lpf.disconnect(); env.disconnect();
      reverb.disconnect(); mainVol.disconnect();
      subOsc.disconnect(); subEnv.disconnect(); subVol.disconnect();
      staticNoise.disconnect(); staticLpf.disconnect();
      staticEnv.disconnect(); staticVol.disconnect();

      osc.dispose(); lpf.dispose(); env.dispose();
      reverb.dispose(); mainVol.dispose();
      subOsc.dispose(); subEnv.dispose(); subVol.dispose();
      staticNoise.dispose(); staticLpf.dispose();
      staticEnv.dispose(); staticVol.dispose();
    }, 2500);

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
 * Two-note ascending chime: clean sine at 200 Hz then 350 Hz (+80ms offset).
 * No filter — bright and unambiguous re-acquisition alert.
 */
export function playSilentRunningExpire(): void {
  if (!isAudioReady()) return;

  logPlay('silent_running_expire');

  try {
    const now = Tone.now();
    const chimeFreqs = [200, 350];
    const chimeNodes: Array<{
      osc: Tone.Oscillator;
      env: Tone.AmplitudeEnvelope;
      vol: Tone.Volume;
    }> = [];

    for (let i = 0; i < chimeFreqs.length; i++) {
      const vol = new Tone.Volume(-13).toDestination();
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.005,
        decay: 0.12,
        sustain: 0,
        release: 0.08,
      }).connect(vol);

      const osc = new Tone.Oscillator({
        type: 'sine',
        frequency: chimeFreqs[i],
      }).connect(env);

      const offset = i * 0.08;
      osc.start(now + offset);
      env.triggerAttackRelease(0.12, now + offset);

      chimeNodes.push({ osc, env, vol });
    }

    // ---- Cleanup ----------------------------------------------------------
    setTimeout(() => {
      for (const { osc, env, vol } of chimeNodes) {
        osc.stop();
        osc.disconnect();
        env.disconnect();
        vol.disconnect();
        osc.dispose();
        env.dispose();
        vol.dispose();
      }
    }, 500);

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
 * Two-phase tube launch: Phase 1 (0-60ms) is a pneumatic burst — white noise
 * through a bandpass at 800 Hz. Phase 2 (40-300ms) is a brown-noise water rush
 * with a 400→1800→600 Hz LPF sweep. A sub-bass 80 Hz thud anchors the impact.
 */
export function playTorpedoFireSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_fire');

  try {
    const now = Tone.now();

    // ---- Phase 1: Pneumatic burst (0-60ms) -------------------------------
    const burstVol = new Tone.Volume(-6).toDestination();
    const burstEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.05,
      sustain: 0,
      release: 0.02,
    }).connect(burstVol);

    const burstBp = new Tone.Filter({
      type: 'bandpass',
      frequency: 800,
      Q: 3,
    }).connect(burstEnv);

    const burstNoise = new Tone.Noise('white').connect(burstBp);

    burstNoise.start(now);
    burstEnv.triggerAttackRelease(0.055, now);

    // ---- Phase 2: Water rush (40-300ms) ----------------------------------
    const rushVol = new Tone.Volume(-8).toDestination();
    const rushEnv = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.18,
      sustain: 0.1,
      release: 0.08,
    }).connect(rushVol);

    const rushLpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 400,
      rolloff: -24,
    }).connect(rushEnv);

    const rushNoise = new Tone.Noise('brown').connect(rushLpf);

    const rushStart = now + 0.04;
    rushNoise.start(rushStart);
    rushLpf.frequency.setValueAtTime(400, rushStart);
    rushLpf.frequency.exponentialRampToValueAtTime(1800, rushStart + 0.13);
    rushLpf.frequency.exponentialRampToValueAtTime(600, rushStart + 0.26);
    rushEnv.triggerAttackRelease(0.26, rushStart);

    // ---- Sub-bass thud ---------------------------------------------------
    const thudVol = new Tone.Volume(-10).toDestination();
    const thudEnv = new Tone.AmplitudeEnvelope({
      attack: 0.003,
      decay: 0.1,
      sustain: 0,
      release: 0.05,
    }).connect(thudVol);

    const thudOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 80,
    }).connect(thudEnv);

    thudOsc.start(now);
    thudEnv.triggerAttackRelease(0.1, now);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      burstNoise.stop();
      rushNoise.stop();
      thudOsc.stop();

      burstNoise.disconnect(); burstBp.disconnect();
      burstEnv.disconnect(); burstVol.disconnect();
      rushNoise.disconnect(); rushLpf.disconnect();
      rushEnv.disconnect(); rushVol.disconnect();
      thudOsc.disconnect(); thudEnv.disconnect(); thudVol.disconnect();

      burstNoise.dispose(); burstBp.dispose();
      burstEnv.dispose(); burstVol.dispose();
      rushNoise.dispose(); rushLpf.dispose();
      rushEnv.dispose(); rushVol.dispose();
      thudOsc.dispose(); thudEnv.dispose(); thudVol.dispose();
    }, 700);

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
 * Hull impact with explosive energy: FM carrier with randomised pitch drop,
 * metallic modulator, sharp bandpass noise transient, and a 55 Hz sub-bass
 * with Tremolo for the underwater resonance bloom.
 */
export function playTorpedoHitSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_hit');

  try {
    const now = Tone.now();

    // ---- FM carrier — randomised pitch drop -----------------------------
    const carrierBase = 490 + Math.random() * 60;     // 490-550 Hz
    const carrierEnd  = 350 + Math.random() * 60;     // 350-410 Hz

    const vol = new Tone.Volume(-6).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.003,
      decay: 0.2,
      sustain: 0.05,
      release: 0.15,
    }).connect(vol);

    const carrier = new Tone.Oscillator({
      type: 'sine',
      frequency: carrierBase,
    }).connect(env);

    // ---- FM modulator — inharmonic metallic partials --------------------
    const modVol = new Tone.Volume(-10).toDestination();
    const modEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.09,
      sustain: 0,
      release: 0.05,
    }).connect(modVol);

    const modulator = new Tone.Oscillator({
      type: 'sine',
      frequency: 370,
    }).connect(modEnv);

    // ---- Short noise transient — sharpened impact crack -----------------
    const crackVol = new Tone.Volume(-10).toDestination();
    const crackEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.02,
      sustain: 0,
      release: 0.015,
    }).connect(crackVol);

    const crackFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 700,
      Q: 1.5,
    }).connect(crackEnv);

    const crackNoise = new Tone.Noise('white').connect(crackFilter);

    // ---- Sub-bass with Tremolo — resonance bloom ------------------------
    const subVol = new Tone.Volume(-8).toDestination();
    const subEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.3,
      sustain: 0,
      release: 0.1,
    }).connect(subVol);

    const tremolo = new Tone.Tremolo({
      frequency: 12,
      depth: 0.6,
    }).connect(subEnv);
    tremolo.start(now);

    const subOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 55,
    }).connect(tremolo);

    // ---- Schedule playback -----------------------------------------------
    carrier.start(now);
    carrier.frequency.setValueAtTime(carrierBase, now);
    carrier.frequency.exponentialRampToValueAtTime(carrierEnd, now + 0.2);
    env.triggerAttackRelease(0.3, now);

    modulator.start(now);
    modEnv.triggerAttackRelease(0.1, now);

    crackNoise.start(now);
    crackEnv.triggerAttackRelease(0.02, now);

    subOsc.start(now);
    subEnv.triggerAttackRelease(0.35, now);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      carrier.stop();
      modulator.stop();
      crackNoise.stop();
      subOsc.stop();
      tremolo.stop();

      carrier.disconnect(); env.disconnect(); vol.disconnect();
      modulator.disconnect(); modEnv.disconnect(); modVol.disconnect();
      crackNoise.disconnect(); crackFilter.disconnect();
      crackEnv.disconnect(); crackVol.disconnect();
      subOsc.disconnect(); tremolo.disconnect();
      subEnv.disconnect(); subVol.disconnect();

      carrier.dispose(); env.dispose(); vol.dispose();
      modulator.dispose(); modEnv.dispose(); modVol.dispose();
      crackNoise.dispose(); crackFilter.dispose();
      crackEnv.dispose(); crackVol.dispose();
      subOsc.dispose(); tremolo.dispose();
      subEnv.dispose(); subVol.dispose();
    }, 800);

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
 * Audible but understated: low-pass brown noise thud, a subtle descending
 * sine (160→80 Hz) for the Doppler pass-by, and a very quiet high-pass
 * white noise splash for surface disturbance.
 */
export function playTorpedoMissSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_miss');

  try {
    const now = Tone.now();

    // ---- Brown noise thud ------------------------------------------------
    const vol = new Tone.Volume(-12).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.16,
      sustain: 0.02,
      release: 0.08,
    }).connect(vol);

    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 150,
      rolloff: -24,
    }).connect(env);

    const noise = new Tone.Noise('brown').connect(lpf);

    noise.start(now);
    env.triggerAttackRelease(0.2, now);

    // ---- Descending Doppler sine -----------------------------------------
    const dopplerVol = new Tone.Volume(-16).toDestination();
    const dopplerEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.18,
      sustain: 0,
      release: 0.06,
    }).connect(dopplerVol);

    const dopplerOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 160,
    }).connect(dopplerEnv);

    dopplerOsc.start(now);
    dopplerOsc.frequency.setValueAtTime(160, now);
    dopplerOsc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    dopplerEnv.triggerAttackRelease(0.2, now);

    // ---- Water splash ----------------------------------------------------
    const splashVol = new Tone.Volume(-18).toDestination();
    const splashEnv = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.03,
      sustain: 0,
      release: 0.02,
    }).connect(splashVol);

    const splashHpf = new Tone.Filter({
      type: 'highpass',
      frequency: 3000,
      rolloff: -12,
    }).connect(splashEnv);

    const splashNoise = new Tone.Noise('white').connect(splashHpf);

    splashNoise.start(now);
    splashEnv.triggerAttackRelease(0.03, now);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      noise.stop();
      dopplerOsc.stop();
      splashNoise.stop();

      noise.disconnect(); lpf.disconnect(); env.disconnect(); vol.disconnect();
      dopplerOsc.disconnect(); dopplerEnv.disconnect(); dopplerVol.disconnect();
      splashNoise.disconnect(); splashHpf.disconnect();
      splashEnv.disconnect(); splashVol.disconnect();

      noise.dispose(); lpf.dispose(); env.dispose(); vol.dispose();
      dopplerOsc.dispose(); dopplerEnv.dispose(); dopplerVol.dispose();
      splashNoise.dispose(); splashHpf.dispose();
      splashEnv.dispose(); splashVol.dispose();
    }, 500);

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
 * Catastrophic destruction ~1.4s: brown noise shockwave with bandpass sweep,
 * two detuned sawtooth groans (140 + 147 Hz, beating dissonance), sub-bass
 * sine with Tremolo, three staggered bubble bursts, and a structural snap.
 */
export function playTorpedoSunkSound(): void {
  if (!isAudioReady()) return;

  logPlay('torpedo_sunk');

  try {
    const now = Tone.now();
    const duration = 1.4;

    // ---- Layer 1: Noise shockwave ----------------------------------------
    const rumbleVol = new Tone.Volume(-4).toDestination();
    const rumbleEnv = new Tone.AmplitudeEnvelope({
      attack: 0.008,
      decay: 0.7,
      sustain: 0.2,
      release: 0.4,
    }).connect(rumbleVol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 180,
      Q: 0.8,
    }).connect(rumbleEnv);

    const lpf = new Tone.Filter({
      type: 'lowpass',
      frequency: 250,
      rolloff: -24,
    }).connect(bandpass);

    const rumbleNoise = new Tone.Noise('brown').connect(lpf);

    rumbleNoise.start(now);
    bandpass.frequency.setValueAtTime(180, now);
    bandpass.frequency.exponentialRampToValueAtTime(40, now + duration);
    rumbleEnv.triggerAttackRelease(duration, now);

    // ---- Layer 2: Detuned sawtooth groans (140 Hz + 147 Hz) -------------
    const groanFreqs = [140, 147];
    const groanNodes: Array<{
      groan: Tone.Oscillator;
      groanEnv: Tone.AmplitudeEnvelope;
      groanVol: Tone.Volume;
    }> = [];

    for (const freq of groanFreqs) {
      const groanVol = new Tone.Volume(-8).toDestination();
      const groanEnv = new Tone.AmplitudeEnvelope({
        attack: 0.02,
        decay: 0.6,
        sustain: 0.3,
        release: 0.35,
      }).connect(groanVol);

      const groan = new Tone.Oscillator({
        type: 'sawtooth',
        frequency: freq,
      }).connect(groanEnv);

      groan.start(now);
      groan.frequency.setValueAtTime(freq, now);
      groan.frequency.exponentialRampToValueAtTime(50, now + duration);
      groanEnv.triggerAttackRelease(duration - 0.1, now);

      groanNodes.push({ groan, groanEnv, groanVol });
    }

    // ---- Layer 3: Sub-bass with Tremolo ----------------------------------
    const subVol = new Tone.Volume(-2).toDestination();
    const subEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.8,
      sustain: 0.1,
      release: 0.3,
    }).connect(subVol);

    const subTremolo = new Tone.Tremolo({
      frequency: 4,
      depth: 0.3,
    }).connect(subEnv);
    subTremolo.start(now);

    const sub = new Tone.Oscillator({
      type: 'sine',
      frequency: 60,
    }).connect(subTremolo);

    sub.start(now);
    subEnv.triggerAttackRelease(duration, now);

    // ---- Layer 4: Three bubble bursts at 200ms intervals from +300ms ----
    const bubbleNodes: Array<{
      bNoise: Tone.Noise;
      bHpf: Tone.Filter;
      bEnv: Tone.AmplitudeEnvelope;
      bVol: Tone.Volume;
    }> = [];

    for (let b = 0; b < 3; b++) {
      const bVol = new Tone.Volume(-20).toDestination();
      const bEnv = new Tone.AmplitudeEnvelope({
        attack: 0.002,
        decay: 0.04,
        sustain: 0,
        release: 0.02,
      }).connect(bVol);

      const bHpf = new Tone.Filter({
        type: 'highpass',
        frequency: 2000,
        rolloff: -12,
      }).connect(bEnv);

      const bNoise = new Tone.Noise('white').connect(bHpf);

      const bOffset = 0.3 + b * 0.2;
      bNoise.start(now + bOffset);
      bEnv.triggerAttackRelease(0.04, now + bOffset);

      bubbleNodes.push({ bNoise, bHpf, bEnv, bVol });
    }

    // ---- Layer 5: Structural snap at +400ms ------------------------------
    const snapVol = new Tone.Volume(-12).toDestination();
    const snapEnv = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.03,
      sustain: 0,
      release: 0.02,
    }).connect(snapVol);

    const snapOsc = new Tone.Oscillator({
      type: 'triangle',
      frequency: 800,
    }).connect(snapEnv);

    const snapOffset = now + 0.4;
    snapOsc.start(snapOffset);
    snapEnv.triggerAttackRelease(0.03, snapOffset);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      rumbleNoise.stop();
      sub.stop();
      subTremolo.stop();
      snapOsc.stop();
      for (const { groan } of groanNodes) groan.stop();
      for (const { bNoise } of bubbleNodes) bNoise.stop();

      rumbleNoise.disconnect(); lpf.disconnect(); bandpass.disconnect();
      rumbleEnv.disconnect(); rumbleVol.disconnect();

      for (const { groan, groanEnv, groanVol } of groanNodes) {
        groan.disconnect(); groanEnv.disconnect(); groanVol.disconnect();
        groan.dispose(); groanEnv.dispose(); groanVol.dispose();
      }

      sub.disconnect(); subTremolo.disconnect();
      subEnv.disconnect(); subVol.disconnect();

      for (const { bNoise, bHpf, bEnv, bVol } of bubbleNodes) {
        bNoise.disconnect(); bHpf.disconnect();
        bEnv.disconnect(); bVol.disconnect();
        bNoise.dispose(); bHpf.dispose();
        bEnv.dispose(); bVol.dispose();
      }

      snapOsc.disconnect(); snapEnv.disconnect(); snapVol.disconnect();

      rumbleNoise.dispose(); lpf.dispose(); bandpass.dispose();
      rumbleEnv.dispose(); rumbleVol.dispose();
      sub.dispose(); subTremolo.dispose();
      subEnv.dispose(); subVol.dispose();
      snapOsc.dispose(); snapEnv.dispose(); snapVol.dispose();
    }, 2200);

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
 * Cinema sonar ping: single sharp 1500 Hz sine with long natural decay
 * (no V-chirp), Reverb (2s, 40% wet) for cavernous echo, and a
 * FeedbackDelay (300ms, 15% feedback) for the double-bounce effect.
 */
export function playSonarPingSound(): void {
  if (!isAudioReady()) return;

  logPlay('sonar_ping');

  try {
    // ---- Primary ping oscillator -----------------------------------------
    const vol = new Tone.Volume(-8).toDestination();

    const reverb = new Tone.Reverb({
      decay: 2,
      wet: 0.4,
    }).connect(vol);

    const delay = new Tone.FeedbackDelay({
      delayTime: 0.3,
      feedback: 0.15,
      wet: 0.2,
    }).connect(reverb);

    const env = new Tone.AmplitudeEnvelope({
      attack: 0.002,
      decay: 0.4,
      sustain: 0,
      release: 0.3,
    }).connect(delay);

    const osc = new Tone.Oscillator({
      type: 'sine',
      frequency: 1500,
    }).connect(env);

    const now = Tone.now();

    osc.start(now);
    env.triggerAttackRelease(0.4, now);

    setTimeout(() => {
      osc.stop();
      osc.disconnect();
      env.disconnect();
      delay.disconnect();
      reverb.disconnect();
      vol.disconnect();
      osc.dispose();
      env.dispose();
      delay.dispose();
      reverb.dispose();
      vol.dispose();
    }, 1400);

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
 * Scanning sweep: five descending beeps at 70ms intervals (tighter than
 * before, 2400→900 Hz), each with a shorter decay, over a broad noise
 * bandpass sweep (3000→500 Hz) that conveys the RF scan passing by.
 */
export function playReconDroneSound(): void {
  if (!isAudioReady()) return;

  logPlay('recon_drone');

  try {
    const now = Tone.now();
    const beepFrequencies = [2400, 1900, 1500, 1200, 900];
    const beepNodes: Array<{
      osc: Tone.Oscillator;
      env: Tone.AmplitudeEnvelope;
      vol: Tone.Volume;
    }> = [];

    for (let i = 0; i < beepFrequencies.length; i++) {
      const vol = new Tone.Volume(-14).toDestination();
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.004,
        decay: 0.04,
        sustain: 0,
        release: 0.02,
      }).connect(vol);

      const osc = new Tone.Oscillator({
        type: 'sine',
        frequency: beepFrequencies[i],
      }).connect(env);

      const offset = i * 0.07;
      osc.start(now + offset);
      env.triggerAttackRelease(0.05, now + offset);

      beepNodes.push({ osc, env, vol });
    }

    // ---- Sweep underlay: noise through descending bandpass ---------------
    const sweepVol = new Tone.Volume(-18).toDestination();
    const sweepEnv = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.35,
      sustain: 0.1,
      release: 0.1,
    }).connect(sweepVol);

    const sweepBp = new Tone.Filter({
      type: 'bandpass',
      frequency: 3000,
      Q: 1.5,
    }).connect(sweepEnv);

    const sweepNoise = new Tone.Noise('white').connect(sweepBp);

    sweepNoise.start(now);
    sweepBp.frequency.setValueAtTime(3000, now);
    sweepBp.frequency.exponentialRampToValueAtTime(500, now + 0.4);
    sweepEnv.triggerAttackRelease(0.45, now);

    setTimeout(() => {
      sweepNoise.stop();
      for (const { osc, env, vol } of beepNodes) {
        osc.stop();
        osc.disconnect(); env.disconnect(); vol.disconnect();
        osc.dispose(); env.dispose(); vol.dispose();
      }
      sweepNoise.disconnect(); sweepBp.disconnect();
      sweepEnv.disconnect(); sweepVol.disconnect();
      sweepNoise.dispose(); sweepBp.dispose();
      sweepEnv.dispose(); sweepVol.dispose();
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
 * Aggressive electronic warfare: white noise through BitCrusher (4-bit) with
 * 25 Hz LFO wobble on a bandpass, plus an alternating square wave toggling
 * 300/500 Hz every 30ms for 12 cycles — sounds hostile and unstable.
 */
export function playRadarJammerSound(): void {
  if (!isAudioReady()) return;

  logPlay('radar_jammer');

  try {
    const now = Tone.now();
    const duration = 0.38;

    // ---- Bandpass noise through BitCrusher ------------------------------
    const vol = new Tone.Volume(-6).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.25,
      sustain: 0.3,
      release: 0.18,
    }).connect(vol);

    const bitCrusher = new Tone.BitCrusher({ bits: 4 }).connect(env);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 800,
      Q: 2.5,
    }).connect(bitCrusher);

    const noise = new Tone.Noise('white').connect(bandpass);

    const lfo = new Tone.LFO({
      type: 'sine',
      frequency: 25,
      min: 400,
      max: 1600,
    });
    lfo.connect(bandpass.frequency);

    noise.start(now);
    lfo.start(now);
    env.triggerAttackRelease(duration, now);

    // ---- Alternating square tone 300/500 Hz (12 alternations) -----------
    const toneVol = new Tone.Volume(-14).toDestination();
    const toneEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: 0.3,
      sustain: 0.2,
      release: 0.1,
    }).connect(toneVol);

    const toneOsc = new Tone.Oscillator({
      type: 'square',
      frequency: 300,
    }).connect(toneEnv);

    toneOsc.start(now);
    for (let i = 0; i < 12; i++) {
      const freq = i % 2 === 0 ? 300 : 500;
      toneOsc.frequency.setValueAtTime(freq, now + i * 0.03);
    }
    toneEnv.triggerAttackRelease(duration, now);

    setTimeout(() => {
      noise.stop();
      lfo.stop();
      toneOsc.stop();

      noise.disconnect(); bandpass.disconnect();
      bitCrusher.disconnect(); env.disconnect();
      lfo.disconnect(); vol.disconnect();
      toneOsc.disconnect(); toneEnv.disconnect(); toneVol.disconnect();

      noise.dispose(); bandpass.dispose();
      bitCrusher.dispose(); env.dispose();
      lfo.dispose(); vol.dispose();
      toneOsc.dispose(); toneEnv.dispose(); toneVol.dispose();
    }, 900);

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
 * Powerful wide-area sonar: bass sweep 150→400 Hz + harmonic 450→1200 Hz
 * over 1000ms, with a noise bandpass sweep (200→2000 Hz) underlay and
 * FeedbackDelay (35% feedback, 40% wet) for a commanding echo wash.
 */
export function playGSonarSound(): void {
  if (!isAudioReady()) return;

  logPlay('g_sonar');

  try {
    const now = Tone.now();
    const duration = 1.0;

    // ---- Layer 1: Main bass sweep 150→400 Hz ----------------------------
    const mainVol = new Tone.Volume(-4).toDestination();
    const mainEnv = new Tone.AmplitudeEnvelope({
      attack: 0.02,
      decay: 0.5,
      sustain: 0.35,
      release: 0.3,
    }).connect(mainVol);

    const mainOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 150,
    }).connect(mainEnv);

    // ---- Layer 2: Harmonic 450→1200 Hz ----------------------------------
    const harmVol = new Tone.Volume(-14).toDestination();
    const harmEnv = new Tone.AmplitudeEnvelope({
      attack: 0.03,
      decay: 0.45,
      sustain: 0.2,
      release: 0.28,
    }).connect(harmVol);

    const harmOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 450,
    }).connect(harmEnv);

    // ---- Shared delay echo -----------------------------------------------
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.32,
      feedback: 0.35,
      wet: 0.4,
    }).toDestination();

    mainOsc.connect(delay);
    harmOsc.connect(delay);

    // ---- Layer 3: Noise bandpass sweep 200→2000 Hz ----------------------
    const sweepVol = new Tone.Volume(-18).toDestination();
    const sweepEnv = new Tone.AmplitudeEnvelope({
      attack: 0.03,
      decay: 0.7,
      sustain: 0.1,
      release: 0.2,
    }).connect(sweepVol);

    const sweepBp = new Tone.Filter({
      type: 'bandpass',
      frequency: 200,
      Q: 1.2,
    }).connect(sweepEnv);

    const sweepNoise = new Tone.Noise('white').connect(sweepBp);

    // ---- Schedule playback -----------------------------------------------
    mainOsc.start(now);
    mainOsc.frequency.setValueAtTime(150, now);
    mainOsc.frequency.exponentialRampToValueAtTime(400, now + duration);
    mainEnv.triggerAttackRelease(duration, now);

    harmOsc.start(now);
    harmOsc.frequency.setValueAtTime(450, now);
    harmOsc.frequency.exponentialRampToValueAtTime(1200, now + duration);
    harmEnv.triggerAttackRelease(duration - 0.05, now);

    sweepNoise.start(now);
    sweepBp.frequency.setValueAtTime(200, now);
    sweepBp.frequency.exponentialRampToValueAtTime(2000, now + 0.8);
    sweepEnv.triggerAttackRelease(0.85, now);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      mainOsc.stop();
      harmOsc.stop();
      sweepNoise.stop();

      mainOsc.disconnect(); mainEnv.disconnect(); mainVol.disconnect();
      harmOsc.disconnect(); harmEnv.disconnect(); harmVol.disconnect();
      delay.disconnect();
      sweepNoise.disconnect(); sweepBp.disconnect();
      sweepEnv.disconnect(); sweepVol.disconnect();

      mainOsc.dispose(); mainEnv.dispose(); mainVol.dispose();
      harmOsc.dispose(); harmEnv.dispose(); harmVol.dispose();
      delay.dispose();
      sweepNoise.dispose(); sweepBp.dispose();
      sweepEnv.dispose(); sweepVol.dispose();
    }, 2000);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'g_sonar', error: String(err) });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Purchase confirmation
// ---------------------------------------------------------------------------

/**
 * Three-tone ascending chime: clean sines at 400 Hz, 600 Hz, 800 Hz staggered
 * 60ms apart, each with a short envelope. A shared Reverb (0.5s decay) adds
 * gentle warmth without smearing the clarity.
 */
export function playPurchaseSound(): void {
  if (!isAudioReady()) return;

  logPlay('purchase');

  try {
    const now = Tone.now();
    const chimeFreqs = [400, 600, 800];

    const reverb = new Tone.Reverb({
      decay: 0.5,
      wet: 0.2,
    }).toDestination();

    const chimeNodes: Array<{
      osc: Tone.Oscillator;
      env: Tone.AmplitudeEnvelope;
      vol: Tone.Volume;
    }> = [];

    for (let i = 0; i < chimeFreqs.length; i++) {
      const vol = new Tone.Volume(-10).connect(reverb);
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.003,
        decay: 0.08,
        sustain: 0,
        release: 0.06,
      }).connect(vol);

      const osc = new Tone.Oscillator({
        type: 'sine',
        frequency: chimeFreqs[i],
      }).connect(env);

      const offset = i * 0.06;
      osc.start(now + offset);
      env.triggerAttackRelease(0.08, now + offset);

      chimeNodes.push({ osc, env, vol });
    }

    setTimeout(() => {
      for (const { osc, env, vol } of chimeNodes) {
        osc.stop();
        osc.disconnect(); env.disconnect(); vol.disconnect();
        osc.dispose(); env.dispose(); vol.dispose();
      }
      reverb.disconnect();
      reverb.dispose();
    }, 700);

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
 * Double rejection buzz: two sawtooth oscillators (120 Hz then 100 Hz, +80ms)
 * each routed through a bandpass at 350 Hz and a BitCrusher (3-bit) for a
 * harsh, lo-fi "denied" character.
 */
export function playInsufficientFundsSound(): void {
  if (!isAudioReady()) return;

  logPlay('insufficient_funds');

  try {
    const now = Tone.now();
    const buzzDefs: Array<{ freq: number; offset: number }> = [
      { freq: 120, offset: 0 },
      { freq: 100, offset: 0.08 },
    ];

    const buzzNodes: Array<{
      osc: Tone.Oscillator;
      bp: Tone.Filter;
      bc: Tone.BitCrusher;
      env: Tone.AmplitudeEnvelope;
      vol: Tone.Volume;
    }> = [];

    for (const { freq, offset } of buzzDefs) {
      const vol = new Tone.Volume(-6).toDestination();
      const env = new Tone.AmplitudeEnvelope({
        attack: 0.003,
        decay: 0.1,
        sustain: 0,
        release: 0.05,
      }).connect(vol);

      const bc = new Tone.BitCrusher({ bits: 3 }).connect(env);
      const bp = new Tone.Filter({
        type: 'bandpass',
        frequency: 350,
        Q: 2,
      }).connect(bc);

      const osc = new Tone.Oscillator({
        type: 'sawtooth',
        frequency: freq,
      }).connect(bp);

      osc.start(now + offset);
      env.triggerAttackRelease(0.1, now + offset);

      buzzNodes.push({ osc, bp, bc, env, vol });
    }

    setTimeout(() => {
      for (const { osc, bp, bc, env, vol } of buzzNodes) {
        osc.stop();
        osc.disconnect(); bp.disconnect(); bc.disconnect();
        env.disconnect(); vol.disconnect();
        osc.dispose(); bp.dispose(); bc.dispose();
        env.dispose(); vol.dispose();
      }
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
 * More ethereal disappearance: white noise through a slow bandpass close
 * (1200→180 Hz over 650ms) with wide LFO wobble (±120 Hz), layered with a
 * reversed-envelope sine pad (400 Hz, slow swell) for ghostly presence.
 */
export function playAcousticCloakSound(): void {
  if (!isAudioReady()) return;

  logPlay('acoustic_cloak');

  try {
    const now = Tone.now();
    const duration = 0.65;

    // ---- Bandpass-filtered noise — sensor contact dissolving -------------
    const vol = new Tone.Volume(-14).toDestination();
    const env = new Tone.AmplitudeEnvelope({
      attack: 0.06,
      decay: 0.4,
      sustain: 0.25,
      release: 0.15,
    }).connect(vol);

    const bandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 1200,
      Q: 1.8,
    }).connect(env);

    const noise = new Tone.Noise('white').connect(bandpass);

    // Wide LFO wobble — min/max ±120 Hz detune
    const lfo = new Tone.LFO({
      type: 'sine',
      frequency: 8,
      min: -120,
      max: 120,
    });
    lfo.connect(bandpass.detune);

    noise.start(now);
    lfo.start(now);
    bandpass.frequency.setValueAtTime(1200, now);
    bandpass.frequency.exponentialRampToValueAtTime(180, now + duration);
    env.triggerAttackRelease(duration, now);

    // ---- Reversed-envelope sine pad — eerie swelling presence -----------
    const padVol = new Tone.Volume(-18).toDestination();
    const padEnv = new Tone.AmplitudeEnvelope({
      attack: 0.4,
      decay: 0.15,
      sustain: 0,
      release: 0.05,
    }).connect(padVol);

    const padOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: 400,
    }).connect(padEnv);

    padOsc.start(now);
    padEnv.triggerAttackRelease(0.55, now);

    // ---- Cleanup ---------------------------------------------------------
    setTimeout(() => {
      noise.stop();
      lfo.stop();
      padOsc.stop();

      noise.disconnect(); lfo.disconnect(); bandpass.disconnect();
      env.disconnect(); vol.disconnect();
      padOsc.disconnect(); padEnv.disconnect(); padVol.disconnect();

      noise.dispose(); lfo.dispose(); bandpass.dispose();
      env.dispose(); vol.dispose();
      padOsc.dispose(); padEnv.dispose(); padVol.dispose();
    }, 1100);

  } catch (err) {
    try {
      getLogger().emit('audio.play', { sound: 'acoustic_cloak', error: String(err) });
    } catch {
      // ignore
    }
  }
}
