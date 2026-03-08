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

let contextReady = false;
let muted = false;

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
