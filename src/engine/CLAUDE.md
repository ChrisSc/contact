# src/engine/ — Pure Game Logic

## Files

- **`grid.ts`** — 6 pure functions: `createGrid`, `getCell`, `setCell`, `parseCoordinate`, `formatCoordinate`, `isValidCoordinate`
- **`fleet.ts`** — 8 functions: `calculateShipCells`, `validatePlacement`, `placeShip`, `removeShip`, `placeDecoy`, `isFleetComplete`, `checkSunk`, `getShipHealth`. Uses `AXIS_DELTAS` lookup table for cell offset computation.
- **`game.ts`** — `GameController` class: setup flow, combat turns, victory detection, turn management, credit economy, perk purchasing, sonar ping, recon drone, radar jammer, depth charge, silent running, G-SONAR, acoustic cloak
- **`credits.ts`** — Pure `calculateFireCredits()` function. Award stacking: hit=1 CR, consecutive hit=+5 CR (if `wasLastTurnHit`), sink=+10 CR. A sunk with consecutive = 16 total.
- **`perks.ts`** — Pure perk store functions: `getPerkDefinition`, `canPurchase`, `purchasePerk`, `removeFromInventory`, `getInventoryBySlot`, `generateInstanceId`. Returns new `PlayerState` (immutable pattern).
- **`sonar.ts`** — Pure `executeSonarPing()` function. Checks defender grid for Ship/Decoy presence. Applies silent running (masks per-ship), jammer (inverts), and cloak (forces false) modifiers. `SonarPingResult` includes `silentRunning: boolean`.
- **`drone.ts`** — Pure `executeReconDrone()` and `calculateScanArea()` functions. 3x3x3 volume scan centered on target. Returns per-cell results with raw/displayed/written booleans. Applies silent running (masks per-cell), jammer (forces all-false per GDD 5.4), and cloak (forces false) modifiers. `DroneScanResult` includes `jammerConsumed` flag.
- **`depth-charge.ts`** — Pure `calculateDepthChargeTargets()` function. Reuses `calculateScanArea()` from drone.ts for 3x3x3 volume. Returns per-cell info with `cellState`, `shipId`, `alreadyResolved` (Hit/Miss/Sunk/DecoyHit cells skipped by GameController).
- **`g-sonar.ts`** — Pure `executeGSonar(depth, attacker, defender)` function. Scans all 64 cells at a given depth layer. Returns per-cell results with raw/displayed/written booleans. Applies silent running (masks per-cell) and cloak (forces all-false) modifiers. No jammer interaction. `GSonarResult` includes `cloaked` flag.
- **`silent-running.ts`** — Pure helpers: `isShipSilentRunning(entries, shipId)` (lookup), `decrementSilentRunning(entries)` (returns `{remaining, expired}` after decrementing turnsRemaining).

## Architecture

- **Grid/Fleet**: Pure functions. No class state. Accept grid/state as parameters, return new data or mutation results.
- **Credits/Perks/Sonar/Drone/DepthCharge/SilentRunning/GSonar**: Pure functions. Accept player state, return new state or results. No side effects.
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

## Depth Charge

- `useDepthCharge(center)`: validates phase, `!attackUsed`, inventory has `depth_charge`, valid coordinate.
- Calls `calculateDepthChargeTargets(center, defender)` for 3x3x3 area (reuses `calculateScanArea` from drone.ts).
- Processes each non-alreadyResolved cell like `fireTorpedo`: Ship→Hit, Decoy→DecoyHit, Empty/scan→Miss. Updates both grids.
- Credits: each hit = 1 CR, consecutive bonus +5 CR once (if `lastTurnHit` and at least one hit), each sink = +10 CR.
- Consumes `attackUsed` slot and one `depth_charge` instance from inventory.
- Checks victory after all sinks processed.
- Returns `DepthChargeResult { center, cellResults[], shipsSunk[], totalCreditsAwarded }`.
- Depth charge does **NOT** interact with Silent Running — SR only masks recon abilities, not damage.

## Silent Running

- `useSilentRunning(shipId)`: validates phase, `!defendUsed`, inventory has `silent_running`, ship exists/not sunk/not already SR'd.
- Adds `{ shipId, turnsRemaining: 2 }` to `player.silentRunningShips[]`.
- Consumes `defendUsed` slot and one `silent_running` instance from inventory.
- Emits `perk.effect` event with player, perkId, shipId, turnsRemaining.

### SR Decrement (in endTurn)

- After player switch, decrements the **new current player's** SR entries (counts opponent turns elapsed).
- Timing: ALPHA activates SR → turnsRemaining=2 → BRAVO ends turn → decrement to 1 → BRAVO ends next turn → decrement to 0 → expired.
- Expired entries emit `perk.expire` event and are removed from `silentRunningShips`.
- `getLastSRExpired(): string[]` returns the ship IDs that expired in the most recent `endTurn()` call (reset to `[]` at start of each `endTurn`).

### SR Interaction with Sonar/Drone

- Priority order: Silent Running > Acoustic Cloak > Radar Jammer.
- SR masks individual ship cells (per-shipId check via `isShipSilentRunning`). Decoys (shipId=null) are NOT masked by SR.
- Sonar: SR'd ship cell → `displayedResult = false`, `silentRunning = true`.
- Drone: per-cell SR check — SR'd ship cells masked, other cells (including decoys) unaffected.
- Torpedo fire and Depth Charge damage go through normally regardless of SR.

## G-SONAR

- `useGSonar(depth)`: validates phase, `!attackUsed`, inventory has `g_sonar`, depth 0-7.
- Calls `executeGSonar(depth, attacker, defender)` to scan all 64 cells at the given depth layer.
- Writes `DronePositive`/`DroneNegative` to attacker's targeting grid (reuses same CellStates as drone, no new enum values).
- Skips cells already resolved (Hit/Miss/Sunk/DecoyHit/DronePositive/DroneNegative) — same skip logic as `useReconDrone`.
- Consumes `attackUsed` slot and one `g_sonar` instance from inventory.
- No jammer interaction (unlike drone/sonar).
- Modifier priority: Silent Running > Acoustic Cloak > raw result.
- Returns `GSonarResult { depth, cells: GSonarCellResult[], cloaked }` or `null` on validation failure.

## Acoustic Cloak

- `useAcousticCloak()`: validates phase, `!defendUsed`, inventory has `acoustic_cloak`, not already active.
- Sets `player.abilities.acoustic_cloak.active = true` and `turnsRemaining = 2`.
- Consumed from inventory on deploy (unlike `radar_jammer` which stays until triggered).
- Consumes `defendUsed` slot.
- Emits `perk.use` event with `result: 'deployed'`.

### Acoustic Cloak Countdown (in endTurn)

- After player switch, decrements the **new current player's** acoustic cloak `turnsRemaining`.
- Timing: same pattern as SR — counts opponent turns elapsed.
- When `turnsRemaining` reaches 0: sets `active = false`, `turnsRemaining = null`, emits `perk.expire` event.
- Countdown runs after SR decrement, before `game.turn_start` event.

### Acoustic Cloak Interactions

- When active, forces `displayedResult = false` for sonar ping, recon drone, and G-SONAR (masks all recon).
- Does NOT block torpedoes or depth charges (damage goes through normally).
- Priority: SR > Cloak > Jammer. If cloak is active, jammer is not consumed (cloak takes priority).

## Placement Axes

8 axes via `AXIS_DELTAS` table — no purely vertical (depth-only) placement:
- **Within-slice** (constant depth): `col`, `row`, `diag+` (col+row increase), `diag-` (col increases, row decreases)
- **Cross-slice** (spans depth layers): `col-depth` (col+depth increase), `col-depth-` (col increases, depth decreases), `row-depth` (row+depth increase), `row-depth-` (row increases, depth decreases)
