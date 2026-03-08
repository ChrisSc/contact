# src/engine/ — Pure Game Logic

## Files

- **`grid.ts`** — 6 pure functions: `createGrid`, `getCell`, `setCell`, `parseCoordinate`, `formatCoordinate`, `isValidCoordinate`
- **`fleet.ts`** — 8 functions: `calculateShipCells`, `validatePlacement`, `placeShip`, `removeShip`, `placeDecoy`, `isFleetComplete`, `checkSunk`, `getShipHealth`. Uses `AXIS_DELTAS` lookup table for cell offset computation.
- **`game.ts`** — `GameController` class: setup flow, combat turns, victory detection, turn management, credit economy, perk purchasing, sonar ping, recon drone, radar jammer
- **`credits.ts`** — Pure `calculateFireCredits()` function. Award stacking: hit=1 CR, consecutive hit=+5 CR (if `wasLastTurnHit`), sink=+10 CR. A sunk with consecutive = 16 total.
- **`perks.ts`** — Pure perk store functions: `getPerkDefinition`, `canPurchase`, `purchasePerk`, `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId`. Returns new `PlayerState` (immutable pattern).
- **`sonar.ts`** — Pure `executeSonarPing()` function. Checks defender grid for Ship/Decoy presence. Applies jammer (inverts) and cloak (forces false) modifiers.
- **`drone.ts`** — Pure `executeReconDrone()` and `calculateScanArea()` functions. 3x3x3 volume scan centered on target. Returns per-cell results with raw/displayed/written booleans. Applies jammer (forces all-false per GDD 5.4) and cloak (forces false) modifiers. `DroneScanResult` includes `jammerConsumed` flag.

## Architecture

- **Grid/Fleet**: Pure functions. No class state. Accept grid/state as parameters, return new data or mutation results.
- **Credits/Perks/Sonar/Drone**: Pure functions. Accept player state, return new state or results. No side effects.
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
- Jammer consumption: when sonar result is jammed (and not cloaked), jammer is deactivated, marked used, and removed from defender inventory.

## Recon Drone

- `useReconDrone(center)`: validates phase, `!attackUsed`, inventory has `recon_drone`, valid coordinate.
- Scans 3x3x3 volume via `calculateScanArea()` (up to 27 cells, clipped to grid bounds).
- Writes `DronePositive`/`DroneNegative` to attacker's targeting grid, skipping cells already resolved (Hit/Miss/Sunk/DecoyHit/DronePositive/DroneNegative).
- Consumes `attackUsed` slot (replaces torpedo for the turn).
- Consumes one `recon_drone` instance from inventory.
- Jammer consumption: if drone result is jammed (and not cloaked), jammer is deactivated, marked used, and removed from defender inventory.

## Radar Jammer

- `useRadarJammer()`: validates phase, `!defendUsed`, inventory has `radar_jammer`, not already active.
- Sets `player.abilities.radar_jammer.active = true`. Keeps instance in inventory (consumed on trigger).
- Consumes `defendUsed` slot.
- When triggered by sonar ping: inverts displayed result (yes↔no), then jammer is deactivated and instance removed.
- When triggered by recon drone: forces all-false scan results (GDD 5.4), then jammer is deactivated and instance removed.

## Torpedo Fire on Scanned Cells

- `fireTorpedo()` allows firing on cells with `SonarPositive`, `SonarNegative`, `DronePositive`, or `DroneNegative` state (overwrites scan result with Hit/Miss).

## Placement Axes

8 axes via `AXIS_DELTAS` table — no purely vertical (depth-only) placement:
- **Within-slice** (constant depth): `col`, `row`, `diag+` (col+row increase), `diag-` (col increases, row decreases)
- **Cross-slice** (spans depth layers): `col-depth` (col+depth increase), `col-depth-` (col increases, depth decreases), `row-depth` (row+depth increase), `row-depth-` (row increases, depth decreases)
