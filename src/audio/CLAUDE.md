# src/audio/ — Tone.js Synthesized Audio

## Files

- **`audio-manager.ts`** — Tone.js context lifecycle owner. `initAudioContext()` (lazy, idempotent — call on first user gesture), `isAudioReady()` (guards all playback), `setMasterVolume(db)`, `toggleMute()`, `isMuted()`. Module-level `contextReady` flag plus `Tone.getContext().state` check.
- **`abilities.ts`** — Synthesized SFX for ability deployments: `playDepthChargeSound()`, `playSilentRunningActivate()`, `playSilentRunningExpire()`. All no-ops when context not ready. Fire-and-forget (no await needed).

## Architecture

- **No sample files** — all audio is synthesized via Tone.js 14.x oscillators, noise generators, filters, and envelopes.
- **Lazy initialization** — `initAudioContext()` must be called from a user gesture handler (click/keydown) before any sound plays. Browser autoplay policy requires `Tone.start()` after gesture.
- **Guard pattern** — every play function checks `isAudioReady()` first and returns silently if context is not running.
- **Fire-and-forget cleanup** — each sound creates its own Tone.js nodes, schedules playback, then uses `setTimeout` to stop/disconnect/dispose all nodes after the sound completes. No persistent audio graph.
- **Logger integration** — `audio.init` on context start, `audio.play` on each sound trigger (with sound name), `audio.mute` on toggle.

## Sound Design

| Sound | Layers | Duration | Character |
|-------|--------|----------|-----------|
| **Depth Charge** | (1) White noise → bandpass 200→60 Hz sweep + lowpass 300 Hz (shockwave), (2) Sine 50 Hz with long decay (sub-bass rumble), (3) White noise → bandpass 800 Hz (impact crack) | ~1s + 1.4s cleanup | Deep underwater explosion |
| **Silent Running activate** | (1) Sine 500→100 Hz descending + lowpass 600→80 Hz closing, (2) Sine 250→50 Hz sub-octave layer | ~500ms + 900ms cleanup | Submarine disappearing |
| **Silent Running expire** | Triangle 100→400 Hz ascending, highpass 80 Hz, -16 dB | ~300ms + 600ms cleanup | Subtle resurface notification |

## Patterns

- **Volume layering**: Each sound layer has its own `Tone.Volume` node routed to destination. Primary layers louder (-4 to -10 dB), secondary layers quieter (-12 to -18 dB).
- **Frequency sweeps**: `exponentialRampToValueAtTime` on oscillator frequency and filter cutoff for smooth transitions.
- **Error resilience**: All play functions wrap synthesis in try/catch. Errors logged but never thrown to caller.
- **No persistent state**: No synth pools or reusable nodes. Each call creates fresh nodes to avoid timing conflicts from rapid re-triggers.

## Integration

Combat screen calls `initAudioContext()` on first user interaction (any click handler). Sound functions are called directly from UI handlers:
- `handleDepthChargeStrike()` → `playDepthChargeSound()`
- `handleSilentRunningSelect()` → `playSilentRunningActivate()`
- SR expiry → `playSilentRunningExpire()` (not yet wired — visual overlay handles feedback)

## Testing

- Audio modules are **mocked** in UI tests (`vi.mock`) to avoid Tone.js ESM import issues in jsdom.
- No dedicated audio unit tests — functions are fire-and-forget synthesis with no return values or testable state.
