# src/audio/ — Tone.js Synthesized Audio

## Files

| File | Role |
|---|---|
| `audio-manager.ts` | Tone.js context lifecycle. `initAudioContext()` (lazy, on first user gesture), `isAudioReady()` guard, volume/mute. Game phase tracking (`AudioPhase`, `getAudioPhaseFromTurn()`). |
| `abilities.ts` | 14 fire-and-forget SFX functions. Each creates fresh Tone.js nodes, schedules playback, disposes via `setTimeout`. |
| `ambient.ts` | Persistent 3-layer soundscape (sub hum, ocean noise, periodic sonar pings). Phase-responsive parameter ramping. `startAmbient()` / `stopAmbient()`. |

## Key Decisions

- **No sample files** — all synthesis via Tone.js oscillators, noise, filters, envelopes.
- **Lazy init** — `initAudioContext()` must be called from a user gesture (browser autoplay policy).
- **Guard pattern** — every play function checks `isAudioReady()` first, returns silently if not ready.
- **Fire-and-forget** — no persistent audio graph for SFX. Each call creates, plays, disposes.
- **Error resilience** — all play functions wrap in try/catch. Never throws to caller.
- **Ambient is persistent** — unlike SFX, ambient nodes stay alive during combat. Phase transitions use 2s `rampTo`.

## Integration

Combat screen calls `initAudioContext()` on first interaction, then `startAmbient()`. SFX called directly from UI handlers (e.g., `handleFire()` → `playTorpedoFireSound()`). `unmount()` calls `stopAmbient()`.

## Testing

Audio modules are **mocked** in UI tests (`vi.mock`) to avoid Tone.js ESM import issues in jsdom. No dedicated audio unit tests — functions are fire-and-forget with no testable return values.
