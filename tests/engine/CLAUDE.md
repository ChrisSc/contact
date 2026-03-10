# tests/engine/ — Engine Tests

## Files

| File | Tests |
|---|---|
| `grid.test.ts` | Grid CRUD, coordinate validation, parsing, formatting |
| `fleet.test.ts` | Placement (all 8 axes, overlap, OOB), removal, decoy, sunk detection, `getShipHealth` |
| `game.test.ts` | Full integration: setup flow, combat, victory, credits, perks, all abilities, SR/cloak countdowns, exhaustive firing (343 cells), ability+sink same turn, simultaneous unlock |
| `credits.test.ts` | `calculateFireCredits` award stacking (hit/consecutive/sunk combinations) |
| `perks.test.ts` | Purchase, remove, inventory queries, instance ID generation, immutability |
| `sonar.test.ts` | Ship/decoy/empty detection, jammer inversion, cloak masking, SR masking, modifier priority |
| `drone.test.ts` | 3x3x3 scan accuracy, skip resolved cells, jammer all-false, SR per-cell masking |
| `depth-charge.test.ts` | Area targeting, multi-ship, already-resolved cells, decoy, edge clipping |
| `g-sonar.test.ts` | Full-layer scan, SR masking, cloak masking, decoy false positive |
| `acoustic-cloak.test.ts` | Deploy, countdown, expiry, masks sonar/drone/G-SONAR, doesn't block damage |
| `rank.test.ts` | Rank system: officer/recruit/enlisted thresholds, bonus awards to both players, counter reset on hit/decoy/contact, counter persistence on miss, multiple triggers, `setRank()` rejection during combat |
| `silent-running.test.ts` | Lookup, decrement, expiry, immutability |
| `event-completeness.test.ts` | Full game audit: event counts, pairing, ordering, monotonic sequences |

## Conventions

- `beforeEach` inits Logger singleton (required by GameController)
- Helpers: `placeFullFleet()`, `setupBothPlayers()`, `createEmptyPlayerState()`
- Unit tests for pure functions; integration tests for `GameController`
- Logger buffer inspection to verify correct events emitted
- Immutability verification: confirm originals unchanged after operations
