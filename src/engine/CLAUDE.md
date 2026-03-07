# src/engine/ — Pure Game Logic

## Files

- **`grid.ts`** — 6 pure functions: `createGrid`, `getCell`, `setCell`, `parseCoordinate`, `formatCoordinate`, `isValidCoordinate`
- **`fleet.ts`** — 8 functions: `calculateShipCells`, `validatePlacement`, `placeShip`, `removeShip`, `placeDecoy`, `isFleetComplete`, `checkSunk`, `getShipHealth`. Uses `AXIS_DELTAS` lookup table for cell offset computation.
- **`game.ts`** — `GameController` class: setup flow, combat turns, victory detection, turn management

## Architecture

- **Grid/Fleet**: Pure functions. No class state. Accept grid/state as parameters, return new data or mutation results.
- **GameController**: Single stateful orchestrator. Owns `GameState`, delegates to grid/fleet functions. Couples to Logger singleton (initialized at construction).
- Engine has **zero DOM/UI dependencies**. It can be tested and used without any rendering layer.

## Style Guide

- Pure functions return new data via shallow copy (immutable grid pattern) or `null` on validation failure.
- Mutation functions (placeShip, removeShip) return `boolean` success/failure.
- Coordinates are **0-indexed internally**. Use `formatCoordinate()` for 1-indexed display strings.
- `PlayerIndex` is `0 | 1` (ALPHA = 0, BRAVO = 1).

## Patterns

- **Every state mutation emits a Logger event.** No exceptions. If it changes game state, it logs.
- Validation happens before mutation — check first, apply second.
- `GameController.fireTorpedo()` and ability methods follow: validate -> mutate -> log -> check win -> advance turn.
- `combat.fire` on hit includes `ship` and `remaining` (via `getShipHealth`); `combat.sunk` includes `remaining: 0`.
- Decoy placement emits `fleet.decoy_place` (not `fleet.place`).
- Ship placement validates: axis alignment, no overlap, in-bounds, correct size.

## Placement Axes

6 axes via `AXIS_DELTAS` table — no purely vertical (depth-only) placement:
- **Within-slice** (constant depth): `col`, `row`, `diag+` (col+row increase), `diag-` (col increases, row decreases)
- **Cross-slice** (spans depth layers): `col-depth` (col+depth increase), `row-depth` (row+depth increase)
