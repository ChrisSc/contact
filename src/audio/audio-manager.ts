/**
 * audio-manager.ts — Tone.js context lifecycle owner
 *
 * Rules:
 * - AudioContext is lazy-initialized on first user gesture (browser autoplay policy).
 * - All Tone.js usage must go through `ensureContext()` before scheduling audio.
 * - Provides master volume, mute toggle, and a clean dispose path.
 */

import * as Tone from 'tone';
import { getLogger } from '../observability/logger';

export type AudioPhase = 'setup' | 'combat_early' | 'combat_mid' | 'combat_escalation' | 'combat_endgame';

let contextReady = false;
let muted = false;
let currentPhase: AudioPhase = 'setup';

/**
 * Call this on the first user interaction (click/keydown) to start the
 * AudioContext. Tone.js requires `Tone.start()` after a gesture.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initAudioContext(): Promise<void> {
  if (contextReady) return;

  try {
    await Tone.start();
    contextReady = true;

    try {
      getLogger().emit('audio.init', { status: 'ready', sampleRate: Tone.getContext().sampleRate });
    } catch {
      // Logger may not be initialized during testing
    }
  } catch (err) {
    try {
      getLogger().emit('audio.init', { status: 'failed', error: String(err) });
    } catch {
      // ignore
    }
  }
}

/**
 * Returns true if the AudioContext has been started via a user gesture and
 * is currently running. Use this to guard all sound playback.
 */
export function isAudioReady(): boolean {
  if (!contextReady) return false;
  const ctx = Tone.getContext();
  return ctx.state === 'running';
}

/**
 * Set master output volume. Value in dB; -Infinity for silence.
 */
export function setMasterVolume(db: number): void {
  Tone.getDestination().volume.value = db;
}

/**
 * Toggle mute state. Returns the new muted state.
 */
export function toggleMute(): boolean {
  muted = !muted;
  Tone.getDestination().mute = muted;

  try {
    getLogger().emit('audio.mute', { muted });
  } catch {
    // ignore
  }

  return muted;
}

/**
 * Returns current mute state.
 */
export function isMuted(): boolean {
  return muted;
}

/**
 * Set the current audio phase. Emits `audio.phase_change` if the phase
 * actually changes. Call this whenever game tension level shifts.
 */
export function setGamePhase(phase: AudioPhase): void {
  if (phase === currentPhase) return;

  const previous = currentPhase;
  currentPhase = phase;

  try {
    getLogger().emit('audio.phase_change', { from: previous, to: phase });
  } catch {
    // ignore
  }
}

/**
 * Returns the current audio phase.
 */
export function getGamePhase(): AudioPhase {
  return currentPhase;
}

/**
 * Pure mapper from turn count to AudioPhase.
 * Turns 1-10 → combat_early, 11-20 → combat_mid,
 * 21-30 → combat_escalation, 31+ → combat_endgame.
 */
export function getAudioPhaseFromTurn(turnCount: number): AudioPhase {
  if (turnCount <= 10) return 'combat_early';
  if (turnCount <= 20) return 'combat_mid';
  if (turnCount <= 30) return 'combat_escalation';
  return 'combat_endgame';
}
