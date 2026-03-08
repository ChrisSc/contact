# tests/engine/ — Engine Unit & Integration Tests

## Files

- **`grid.test.ts`** — grid creation, coordinate validation, get/set cell, coordinate parsing and formatting
- **`fleet.test.ts`** — ship placement, validation (overlap, OOB, axis), removal, decoy, sunk detection, `getShipHealth`, `fleet.decoy_place` event. Covers all 8 axes: col, row, diag+, diag-, col-depth, col-depth-, row-depth, row-depth-. Validates consistent depth for within-slice axes, cross-slice depth progression, and negative depth boundary rejection.
- **`game.test.ts`** — setup flow (both players), combat turns, torpedo firing, victory detection, full game integration, `combat.fire` payload (ship/remaining), `combat.sunk` payload (remaining: 0), credit awards (hit/miss/sunk/consecutive), perk purchase, sonar ping (targeting grid write, inventory consumption, ping slot, re-ping blocking), turn slots (ping doesn't block attack, attack blocks second attack, fire on sonar-pinged cell), drone integration (detects ships at known positions with per-cell accuracy, `written` flag false on skipped Hit/Miss/Sunk cells), depth charge integration (requires inventory, consumes attack slot, hits/credits/victory, already-resolved skipped, decoy hit, perk.use event), silent running integration (deploy, reject sunk/already SR'd, requires inventory, masked from sonar, torpedo still hits, 2-turn expiry timing, perk.effect event)
- **`credits.test.ts`** — `calculateFireCredits`: miss (empty), hit (1), hit+consecutive (1+5), sunk (1+10), sunk+consecutive (1+5+10)
- **`perks.test.ts`** — `getPerkDefinition` (known/unknown), `canPurchase` (true/false/exact), `purchasePerk` (success/insufficient/immutability), `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId` (incrementing/scoped by perk type)
- **`drone.test.ts`** — `executeReconDrone`: per-cell accuracy against defender grid (ship cells true, empty cells false), ship outside 3×3×3 range returns no contacts, existing Hit/Miss/Sunk cells not detected as ships, radar jammer forces all-false (not inversion), silent running masks per-cell (SR ship masked, decoy not masked, SR priority over jammer)
- **`sonar.test.ts`** — `executeSonarPing`: empty cell, ship cell, decoy cell (false positive), radar jammer (inverts both ways), acoustic cloak (forces false), decoy+jammer interaction, silent running masks ship cell (SR ship masked, decoy not masked, SR priority over jammer, non-SR ship still affected by jammer)
- **`depth-charge.test.ts`** — `calculateDepthChargeTargets`: empty area (all Empty/not resolved), ship in zone (Ship state, shipId set), multi-ship in zone, already-resolved cells (Hit/Miss/Sunk/DecoyHit flagged), decoy in zone (Decoy state, null shipId), corner clipping (fewer cells at grid edge), scan-state cells (SonarPositive/DroneNegative not resolved)
- **`silent-running.test.ts`** — `isShipSilentRunning` (active/inactive/empty), `decrementSilentRunning` (2→1 remaining, 1→0 expired, mixed entries, empty input, immutability)

## Architecture

- **Unit tests** for pure functions (`grid.ts`, `fleet.ts`, `credits.ts`, `perks.ts`, `sonar.ts`, `drone.ts`): pass inputs, assert outputs.
- **Integration tests** for `GameController`: exercise full game flows through the public API.
- Tests use `tests/setup.ts` for shared helpers and factory functions.

## Style Guide

- `describe` blocks organized per function or feature area.
- `beforeEach` initializes Logger singleton (required by GameController).
- Helper functions for repetitive setup: `placeFullFleet()`, `setupBothPlayers()`.
- Assertions target return values and state — no DOM assertions here.

## Patterns

- **Immutability verification**: Confirm original grid is unchanged after `setCell` returns new grid. `purchasePerk` returns new state without mutating original.
- **Null return on invalid input**: Test that invalid coordinates, overlapping placements, insufficient credits, etc. return `null` or `false`.
- **Logger buffer inspection**: Verify correct events emitted after state mutations (including `economy.credit`, `economy.purchase`, `perk.use`).
- **Full game flow tests**: Place fleets -> fire torpedoes -> verify sunk -> check victory.
- **Diagonal boundary tests**: Verify diag- rejects placement where row goes below 0.
- **Credit economy tests**: Verify starting balance, award stacking, consecutive hit tracking across turns.
- **Sonar tests**: Use `createEmptyPlayerState` with manually set cell states and ability flags for jammer/cloak scenarios.
- **Drone tests**: Use `createEmptyPlayerState` with ships placed at known coordinates. Verify per-cell `rawResult`/`displayedResult`/`written` fields. Jammer tests confirm all-false behavior (distinct from sonar inversion).
- **Depth charge tests**: Use `createEmptyPlayerState` with manually set cell states. Verify `cellState`, `shipId`, `alreadyResolved` per cell.
- **Silent running tests**: Pure unit tests for lookup and decrement helpers. Verify immutability of input arrays.
- **SR integration tests**: Added to sonar, drone, and game test files. Use `silentRunningShips` on defender state to verify masking behavior and priority over jammer.
