# src/audio/ — Tone.js Synthesized Audio

## Files

- **`audio-manager.ts`** — Tone.js context lifecycle owner. `initAudioContext()` (lazy, idempotent — call on first user gesture), `isAudioReady()` (guards all playback), `setMasterVolume(db)`, `toggleMute()`, `isMuted()`. Module-level `contextReady` flag plus `Tone.getContext().state` check.
- **`abilities.ts`** — Synthesized SFX for all combat actions and ability deployments. All no-ops when context not ready. Fire-and-forget (no await needed). Exports: `playTorpedoFireSound()`, `playTorpedoHitSound()`, `playTorpedoMissSound()`, `playTorpedoSunkSound()`, `playSonarPingSound()`, `playReconDroneSound()`, `playRadarJammerSound()`, `playDepthChargeSound()`, `playSilentRunningActivate()`, `playSilentRunningExpire()`.

## Architecture

- **No sample files** — all audio is synthesized via Tone.js 14.x oscillators, noise generators, filters, and envelopes.
- **Lazy initialization** — `initAudioContext()` must be called from a user gesture handler (click/keydown) before any sound plays. Browser autoplay policy requires `Tone.start()` after gesture.
- **Guard pattern** — every play function checks `isAudioReady()` first and returns silently if context is not running.
- **Fire-and-forget cleanup** — each sound creates its own Tone.js nodes, schedules playback, then uses `setTimeout` to stop/disconnect/dispose all nodes after the sound completes. No persistent audio graph.
- **Logger integration** — `audio.init` on context start, `audio.play` on each sound trigger (with sound name), `audio.mute` on toggle.

## Sound Design

| Sound | Layers | Duration | Character |
|-------|--------|----------|-----------|
| **Torpedo fire** | White noise → lowpass sweep 200→2400 Hz, -8 dB | ~200ms + 500ms cleanup | Pneumatic whoosh, compressed air launch |
| **Torpedo hit** | (1) Sine FM carrier 520→380 Hz, (2) Sine modulator 370 Hz (inharmonic, metallic), (3) White noise → bandpass 700 Hz (crack transient) | ~300ms + 700ms cleanup | Metallic hull contact ping |
| **Torpedo miss** | Brown noise → lowpass 120 Hz, -14 dB | ~130ms + 400ms cleanup | Muffled underwater thud, understated |
| **Torpedo sunk** | (1) Brown noise → bandpass 150→55 Hz sweep + lowpass 250 Hz (rumble), (2) Sawtooth 140→55 Hz descending (groan), (3) Sine 65 Hz (sub-bass punch) | ~800ms + 1.4s cleanup | Heavy rumble + descending groan, hull tearing |
| **Sonar ping** | Sine 800→1200→800 Hz chirp + FeedbackDelay (0.22s, 25% feedback, 35% wet) | ~400ms + 900ms cleanup | Classic submarine sonar with echo |
| **Recon drone** | 5 staggered sine beeps 2400→1900→1500→1200→900 Hz, 100ms apart, -14 dB | ~600ms + 1s cleanup | Descending radar sweep series |
| **Radar jammer** | (1) White noise → bandpass LFO-modulated 400–1600 Hz at 18 Hz, (2) Sawtooth 120 Hz hum, -16 dB | ~400ms + 800ms cleanup | Warbling electronic jamming burst |
| **Depth Charge** | (1) White noise → bandpass 200→60 Hz sweep + lowpass 300 Hz (shockwave), (2) Sine 50 Hz with long decay (sub-bass rumble), (3) White noise → bandpass 800 Hz (impact crack) | ~1s + 1.4s cleanup | Deep underwater explosion |
| **Silent Running activate** | (1) Sine 500→100 Hz descending + lowpass 600→80 Hz closing, (2) Sine 250→50 Hz sub-octave layer | ~500ms + 900ms cleanup | Submarine disappearing |
| **Silent Running expire** | Triangle 100→400 Hz ascending, highpass 80 Hz, -16 dB | ~300ms + 600ms cleanup | Subtle resurface notification |

## Patterns

- **Volume layering**: Each sound layer has its own `Tone.Volume` node routed to destination. Primary layers louder (-4 to -10 dB), secondary layers quieter (-12 to -18 dB).
- **Frequency sweeps**: `exponentialRampToValueAtTime` on oscillator frequency and filter cutoff for smooth transitions.
- **Error resilience**: All play functions wrap synthesis in try/catch. Errors logged but never thrown to caller.
- **No persistent state**: No synth pools or reusable nodes. Each call creates fresh nodes to avoid timing conflicts from rapid re-triggers.
- **Multi-beep pattern** (drone): Loop creates independent node sets per beep offset by `i * 0.1s`; all disposed together in a single cleanup timeout.

## Integration

Combat screen calls `initAudioContext()` on first user interaction (any click handler). Sound functions are called directly from UI handlers:
- `handleFire()` → `playTorpedoFireSound()` immediately on success, then `playTorpedoHitSound()` / `playTorpedoSunkSound()` / `playTorpedoMissSound()` based on result
- `handlePing()` → `playSonarPingSound()` when ping succeeds
- `handleDroneScan()` → `playReconDroneSound()` when scan succeeds
- `handleInventorySelect()` radar_jammer case → `playRadarJammerSound()` when deployed
- `handleDepthChargeStrike()` → `playDepthChargeSound()`
- `handleSilentRunningSelect()` → `playSilentRunningActivate()`
- SR expiry → `playSilentRunningExpire()` (not yet wired — visual overlay handles feedback)

## Testing

- Audio modules are **mocked** in UI tests (`vi.mock`) to avoid Tone.js ESM import issues in jsdom.
- Mock in `tests/ui/combat-screen.test.ts` lists all 10 exported functions as `vi.fn()` no-ops.
- No dedicated audio unit tests — functions are fire-and-forget synthesis with no return values or testable state.
