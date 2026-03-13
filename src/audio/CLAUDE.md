# src/audio/ - Tone.js Synthesized Audio

## Files

| File | Role |
|---|---|
| `audio-manager.ts` | Tone.js context lifecycle. `initAudioContext()` (lazy, on first user gesture), `isAudioReady()` guard, volume/mute. Game phase tracking (`AudioPhase`, `getAudioPhaseFromTurn()`). `setGamePhase()` emits log event on phase change. |
| `abilities.ts` | 14 fire-and-forget SFX functions. Multi-layered synthesis (FM, filtered noise, reverb, delay, tremolo, BitCrusher). Each creates fresh Tone.js nodes, schedules playback, disposes via `setTimeout`. |
| `ambient.ts` | Persistent 6-layer soundscape. 3 continuous (sub hum, brown noise floor, pink noise mid-texture) + 3 periodic (atmospheric pings, hull thermal creaks, distant biological sounds). Phase-responsive parameter ramping. `startAmbient()` / `stopAmbient()`. |

## Key Decisions

- **No sample files**: all synthesis via Tone.js oscillators, noise, filters, envelopes, effects (Reverb, FeedbackDelay, Tremolo, BitCrusher, AutoFilter).
- **Lazy init**: `initAudioContext()` must be called from a user gesture (browser autoplay policy). Handoff screen READY button calls it.
- **Guard pattern**: every play function checks `isAudioReady()` first, returns silently if not ready.
- **Fire-and-forget**: no persistent audio graph for SFX. Each call creates, plays, disposes.
- **Error resilience**: all play functions wrap in try/catch. Never throws to caller.
- **Ambient is persistent**: unlike SFX, ambient nodes stay alive during combat. Phase transitions use 2s `rampTo`.
- **Ambient starts on combat mount**: `initAudioContext()` + `startAmbient()` called when combat screen initializes, not deferred to first player action.

## Audio Phases

`AudioPhase`: `'setup' | 'combat_early' | 'combat_mid' | 'combat_escalation' | 'combat_endgame'`. Derived from turn count via `getAudioPhaseFromTurn()`. Controls ambient parameter ramping (hum frequency, noise volume/cutoff, ping interval, hull creak frequency).

## Integration

Combat screen calls `initAudioContext()` + `startAmbient()` at mount. SFX called directly from UI handlers (e.g., `handleFire()` → `playTorpedoFireSound()`). `unmount()` calls `stopAmbient()`.

## Testing

Audio modules are **mocked** in UI tests (`vi.mock`) to avoid Tone.js ESM import issues in jsdom. No dedicated audio unit tests; functions are fire-and-forget with no testable return values.
