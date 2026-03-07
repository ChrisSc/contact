# tests/engine/ — Engine Unit & Integration Tests

## Files

- **`grid.test.ts`** — 18 tests: grid creation, coordinate validation, get/set cell, coordinate parsing and formatting
- **`fleet.test.ts`** — 20 tests: ship placement, validation (overlap, OOB, axis), removal, decoy, sunk detection, `getShipHealth`, `fleet.decoy_place` event
- **`game.test.ts`** — 25 tests: setup flow (both players), combat turns, torpedo firing, victory detection, full game integration, `combat.fire` payload (ship/remaining), `combat.sunk` payload (remaining: 0)

## Architecture

- **Unit tests** for pure functions (`grid.ts`, `fleet.ts`): pass inputs, assert outputs.
- **Integration tests** for `GameController`: exercise full game flows through the public API.
- Tests use `tests/setup.ts` for shared helpers and factory functions.

## Style Guide

- `describe` blocks organized per function or feature area.
- `beforeEach` initializes Logger singleton (required by GameController).
- Helper functions for repetitive setup: `placeFullFleet()`, `setupBothPlayers()`.
- Assertions target return values and state — no DOM assertions here.

## Patterns

- **Immutability verification**: Confirm original grid is unchanged after `setCell` returns new grid.
- **Null return on invalid input**: Test that invalid coordinates, overlapping placements, etc. return `null` or `false`.
- **Logger buffer inspection**: Verify correct events emitted after state mutations.
- **Full game flow tests**: Place fleets -> fire torpedoes -> verify sunk -> check victory.
