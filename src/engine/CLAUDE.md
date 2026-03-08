# src/engine/ — Pure Game Logic

## Files

- **`grid.ts`** — 6 pure functions: `createGrid`, `getCell`, `setCell`, `parseCoordinate`, `formatCoordinate`, `isValidCoordinate`
- **`fleet.ts`** — 8 functions: `calculateShipCells`, `validatePlacement`, `placeShip`, `removeShip`, `placeDecoy`, `isFleetComplete`, `checkSunk`, `getShipHealth`. Uses `AXIS_DELTAS` lookup table for cell offset computation.
- **`game.ts`** — `GameController` class: setup flow, combat turns, victory detection, turn management, credit economy, perk purchasing, sonar ping
- **`credits.ts`** — Pure `calculateFireCredits()` function. Award stacking: hit=1 CR, consecutive hit=+5 CR (if `wasLastTurnHit`), sink=+10 CR. A sunk with consecutive = 16 total.
- **`perks.ts`** — Pure perk store functions: `getPerkDefinition`, `canPurchase`, `purchasePerk`, `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId`. Returns new `PlayerState` (immutable pattern).
- **`sonar.ts`** — Pure `executeSonarPing()` function. Checks defender grid for Ship/Decoy presence. Applies jammer (inverts) and cloak (forces false) modifiers. Jammer/cloak stubs active for forward compatibility with Sprint 3.2–3.4.

## Architecture

- **Grid/Fleet**: Pure functions. No class state. Accept grid/state as parameters, return new data or mutation results.
- **Credits/Perks/Sonar**: Pure functions. Accept player state, return new state or results. No side effects.
- **GameController**: Single stateful orchestrator. Owns `GameState`, delegates to grid/fleet/credits/perks/sonar functions. Couples to Logger singleton (initialized at construction).
- Engine has **zero DOM/UI dependencies**. It can be tested and used without any rendering layer.

## Style Guide

- Pure functions return new data via shallow copy (immutable grid pattern) or `null` on validation failure.
- Mutation functions (placeShip, removeShip) return `boolean` success/failure.
- Coordinates are **0-indexed internally**. Use `formatCoordinate()` for 1-indexed display strings.
- `PlayerIndex` is `0 | 1` (ALPHA = 0, BRAVO = 1).

## Patterns

- **Every state mutation emits a Logger event.** No exceptions. If it changes game state, it logs.
- Validation happens before mutation — check first, apply second.
- `GameController.fireTorpedo()` and ability methods follow: validate -> mutate -> log -> award credits -> check win.
- `combat.fire` on hit includes `ship` and `remaining` (via `getShipHealth`); `combat.sunk` includes `remaining: 0`.
- Decoy placement emits `fleet.decoy_place` (not `fleet.place`).
- Ship placement validates: axis alignment, no overlap, in-bounds, correct size.

## Turn Slots

- `TurnSlots { pingUsed, attackUsed, defendUsed }` replaces the old `actionTaken: boolean`.
- Only `attackUsed` gates `endTurn()`. Ping and defend are independent actions.
- Purchasing perks does **not** consume any slot — can buy anytime during turn.
- `getTurnSlots()` returns a copy of current slot state.

## Credit Economy

- `STARTING_CREDITS = 5` per player.
- Credits awarded in `fireTorpedo()` after resolution via `calculateFireCredits()`.
- Consecutive hit tracked via `PlayerState.lastTurnHit` — set at `endTurn()`, not during fire.
- Decoy hit counts as hit for credits (1 CR) and consecutive tracking.
- `fireTorpedo()` allows firing on cells with `SonarPositive`/`SonarNegative` state (overwrites sonar result with Hit/Miss).

## Sonar Ping

- `useSonarPing(coord)`: validates phase, `!pingUsed`, inventory has `sonar_ping`, cell not already sonar-scanned.
- Writes `SonarPositive`/`SonarNegative` to attacker's targeting grid.
- Consumes one `sonar_ping` instance from inventory.
- Jammer/cloak checks exist but always return false until Sprint 3.2–3.4 add deployment.

## Placement Axes

8 axes via `AXIS_DELTAS` table — no purely vertical (depth-only) placement:
- **Within-slice** (constant depth): `col`, `row`, `diag+` (col+row increase), `diag-` (col increases, row decreases)
- **Cross-slice** (spans depth layers): `col-depth` (col+depth increase), `col-depth-` (col increases, depth decreases), `row-depth` (row+depth increase), `row-depth-` (row increases, depth decreases)
