# tests/engine/ — Engine Unit & Integration Tests

## Files

- **`grid.test.ts`** — grid creation, coordinate validation, get/set cell, coordinate parsing and formatting
- **`fleet.test.ts`** — ship placement, validation (overlap, OOB, axis), removal, decoy, sunk detection, `getShipHealth`, `fleet.decoy_place` event. Covers all 8 axes: col, row, diag+, diag-, col-depth, col-depth-, row-depth, row-depth-. Validates consistent depth for within-slice axes, cross-slice depth progression, and negative depth boundary rejection.
- **`game.test.ts`** — setup flow (both players), combat turns, torpedo firing, victory detection, full game integration, `combat.fire` payload (ship/remaining), `combat.sunk` payload (remaining: 0), credit awards (hit/miss/sunk/consecutive), perk purchase, sonar ping (targeting grid write, inventory consumption, ping slot, re-ping blocking), turn slots (ping doesn't block attack, attack blocks second attack, fire on sonar-pinged cell), drone integration (detects ships at known positions with per-cell accuracy, `written` flag false on skipped Hit/Miss/Sunk cells), depth charge integration (requires inventory, consumes attack slot, hits/credits/victory, already-resolved skipped, decoy hit, perk.use event), silent running integration (deploy, reject sunk/already SR'd, requires inventory, masked from sonar, torpedo still hits, 2-turn expiry timing, perk.effect event, `getLastSRExpired()` returns expired ship IDs), win condition scenarios (midget-last/typhoon-last/BRAVO-wins/post-victory null), exhaustive firing (512-cell systematic + post-victory null), ability+sink same turn (ping then sinking torpedo, depth charge sinks last ship with credits), simultaneous ability unlock (recon_drone purchasable after 1st sink, silent_running after 1st ship lost, per-player shipsSunk tracking)
- **`credits.test.ts`** — `calculateFireCredits`: miss (empty), hit (1), hit+consecutive (1+5), sunk (1+10), sunk+consecutive (1+5+10)
- **`perks.test.ts`** — `getPerkDefinition` (known/unknown), `canPurchase` (true/false/exact), `purchasePerk` (success/insufficient/immutability), `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId` (incrementing/scoped by perk type)
- **`drone.test.ts`** — `executeReconDrone`: per-cell accuracy against defender grid (ship cells true, empty cells false), ship outside 3×3×3 range returns no contacts, existing Hit/Miss/Sunk cells not detected as ships, radar jammer forces all-false (not inversion), silent running masks per-cell (SR ship masked, decoy not masked, SR priority over jammer)
- **`sonar.test.ts`** — `executeSonarPing`: empty cell, ship cell, decoy cell (false positive), radar jammer (inverts both ways), acoustic cloak (forces false), decoy+jammer interaction, silent running masks ship cell (SR ship masked, decoy not masked, SR priority over jammer, non-SR ship still affected by jammer)
- **`depth-charge.test.ts`** — `calculateDepthChargeTargets`: empty area (all Empty/not resolved), ship in zone (Ship state, shipId set), multi-ship in zone, already-resolved cells (Hit/Miss/Sunk/DecoyHit flagged), decoy in zone (Decoy state, null shipId), corner clipping (fewer cells at grid edge), scan-state cells (SonarPositive/DroneNegative not resolved)
- **`g-sonar.test.ts`** — `executeGSonar`: empty layer (all false), ships detected at correct depth, decoy false positive, SR ship masked, acoustic cloak masks all (cloaked=true), cells not marked as written, correct depth coordinates
- **`acoustic-cloak.test.ts`** — GameController integration: deploy sets active+turnsRemaining, reject if already active, reject if no inventory, 2-turn countdown expiry, perk.expire event, masks sonar/drone/G-SONAR results, does NOT block torpedoes, does NOT block depth charges, perk.use event on deploy
- **`event-completeness.test.ts`** — Full game integration: plays complete game from construction to victory, then audits logger buffer for event completeness. Verifies: `game.start` first, 10 `fleet.place` events (5/player), `game.phase_change` transitions (SetupP1→SetupP2, SetupP2→Combat), `combat.fire`/`combat.hit`/`combat.miss` pairing, 5 `combat.sunk` events with remaining:0, `game.turn_start`/`game.turn_end` pairing (starts = ends + 1), `game.victory` last game-category event, monotonically increasing sequence numbers with no gaps, 2 `fleet.confirm` events, 17 `combat.hit` events, `economy.credit` event structure validation
- **`silent-running.test.ts`** — `isShipSilentRunning` (active/inactive/empty), `decrementSilentRunning` (2→1 remaining, 1→0 expired, mixed entries, empty input, immutability)

## Architecture

- **Unit tests** for pure functions (`grid.ts`, `fleet.ts`, `credits.ts`, `perks.ts`, `sonar.ts`, `drone.ts`, `g-sonar.ts`): pass inputs, assert outputs.
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
- **Win condition scenarios**: Test victory triggered by each possible last-ship type (midget, typhoon), BRAVO victory, and null return post-victory. Uses `SHIP_CELLS` lookup table and `sinkShipsAsPlayer0()`/`sinkShipsAsPlayer1()` helpers.
- **Exhaustive firing**: Systematic firing through all 512 cells to confirm victory before exhaustion. Uses nested loop with fallback cell-finding for player 1.
- **Ability + sink same turn**: Sonar ping (ping slot) then sinking torpedo, depth charge that sinks last ship with credit verification.
- **Simultaneous ability unlock**: Verify `shipsSunk` counter and sunk flags tracked independently per player after sinking opponent ships.
- **Event completeness audit**: Filter logger buffer by event type, verify counts, pairing, ordering, and monotonic sequence numbers.
- **Diagonal boundary tests**: Verify diag- rejects placement where row goes below 0.
- **Credit economy tests**: Verify starting balance, award stacking, consecutive hit tracking across turns.
- **Sonar tests**: Use `createEmptyPlayerState` with manually set cell states and ability flags for jammer/cloak scenarios.
- **Drone tests**: Use `createEmptyPlayerState` with ships placed at known coordinates. Verify per-cell `rawResult`/`displayedResult`/`written` fields. Jammer tests confirm all-false behavior (distinct from sonar inversion).
- **Depth charge tests**: Use `createEmptyPlayerState` with manually set cell states. Verify `cellState`, `shipId`, `alreadyResolved` per cell.
- **Silent running tests**: Pure unit tests for lookup and decrement helpers. Verify immutability of input arrays.
- **SR integration tests**: Added to sonar, drone, and game test files. Use `silentRunningShips` on defender state to verify masking behavior and priority over jammer.
- **G-SONAR tests**: Use `createTestPlayerState` with manually set cell states. Verify per-cell `rawResult`/`displayedResult`/`written` fields. No jammer interaction (distinct from drone). 64 cells per scan at specified depth.
- **Acoustic Cloak tests**: GameController integration tests. Deploy via purchase+use, verify countdown timing matches SR pattern (counts opponent turns). Test masking across sonar, drone, and G-SONAR. Verify damage abilities (torpedo, depth charge) still work through cloak.
