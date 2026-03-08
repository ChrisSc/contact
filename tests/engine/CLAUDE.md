# tests/engine/ — Engine Unit & Integration Tests

## Files

- **`grid.test.ts`** — grid creation, coordinate validation, get/set cell, coordinate parsing and formatting
- **`fleet.test.ts`** — ship placement, validation (overlap, OOB, axis), removal, decoy, sunk detection, `getShipHealth`, `fleet.decoy_place` event. Covers all 6 axes: col, row, diag+, diag-, col-depth, row-depth. Validates consistent depth for within-slice axes and cross-slice depth progression.
- **`game.test.ts`** — setup flow (both players), combat turns, torpedo firing, victory detection, full game integration, `combat.fire` payload (ship/remaining), `combat.sunk` payload (remaining: 0), credit awards (hit/miss/sunk/consecutive), perk purchase, sonar ping (targeting grid write, inventory consumption, ping slot, re-ping blocking), turn slots (ping doesn't block attack, attack blocks second attack, fire on sonar-pinged cell)
- **`credits.test.ts`** — `calculateFireCredits`: miss (empty), hit (1), hit+consecutive (1+5), sunk (1+10), sunk+consecutive (1+5+10)
- **`perks.test.ts`** — `getPerkDefinition` (known/unknown), `canPurchase` (true/false/exact), `purchasePerk` (success/insufficient/immutability), `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId` (incrementing/scoped by perk type)
- **`sonar.test.ts`** — `executeSonarPing`: empty cell, ship cell, decoy cell (false positive), radar jammer (inverts both ways), acoustic cloak (forces false), decoy+jammer interaction

## Architecture

- **Unit tests** for pure functions (`grid.ts`, `fleet.ts`, `credits.ts`, `perks.ts`, `sonar.ts`): pass inputs, assert outputs.
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
