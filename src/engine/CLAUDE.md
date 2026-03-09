# src/engine/ — Pure Game Logic

## Files

| File | Role |
|---|---|
| `grid.ts` | `createGrid`, `getCell`, `setCell`, `parseCoordinate`, `formatCoordinate`, `isValidCoordinate` |
| `fleet.ts` | `calculateShipCells`, `validatePlacement`, `placeShip`, `removeShip`, `placeDecoy`, `isFleetComplete`, `checkSunk`, `getShipHealth`. Uses `AXIS_DELTAS` for 8-axis placement. |
| `game.ts` | `GameController` — single stateful orchestrator. Setup flow, combat, victory, credit economy, all ability methods. |
| `credits.ts` | Pure `calculateFireCredits()`. Hit=1, consecutive=+5, sink=+10. |
| `perks.ts` | Pure perk store functions. Returns new `PlayerState` (immutable pattern). |
| `sonar.ts` | Pure `executeSonarPing()`. Applies SR → cloak → jammer modifier chain. |
| `drone.ts` | Pure `executeReconDrone()` + `calculateScanArea()`. 3x3x3 volume. Jammer forces all-false (not inversion). |
| `depth-charge.ts` | Pure `calculateDepthChargeTargets()`. Reuses `calculateScanArea()`. SR does NOT mask damage. |
| `g-sonar.ts` | Pure `executeGSonar()`. Scans all 49 cells at a depth layer. No jammer interaction. |
| `silent-running.ts` | Pure helpers: `isShipSilentRunning()`, `decrementSilentRunning()`. |

## Key Patterns

- **Pure functions** accept grid/state, return new data. No side effects except `GameController`.
- **Validation before mutation** — check first, apply second, log third, award credits fourth, check win fifth.
- **Immutability** — `setCell` returns new grid via shallow copy. `purchasePerk` returns new state.
- **Every state mutation logs.** `GameController` couples to Logger singleton.

## Turn Slots

`TurnSlots { pingUsed, attackUsed, defendUsed }` — three independent action channels. Only `attackUsed` gates `endTurn()`. Perk purchases consume no slot.

## Credit Economy

`STARTING_CREDITS = 5`. Awards via `calculateFireCredits()` after torpedo resolution. `lastTurnHit` set at `endTurn()` for consecutive tracking. Decoy hit counts as hit (1 CR + consecutive eligible).

## Ability Interactions (Decision Table)

| Ability | Slot | Jammer? | SR? | Cloak? | Damages? |
|---|---|---|---|---|---|
| Sonar Ping | ping | Inverts | Masks ship | Forces false | No |
| Recon Drone | attack | All-false | Masks per-cell | Forces false | No |
| Depth Charge | attack | — | — | — | Yes (3x3x3) |
| G-SONAR | attack | — | Masks per-cell | Forces all-false | No |
| Silent Running | defend | — | — | — | — |
| Radar Jammer | defend | — | — | — | — |
| Acoustic Cloak | defend | — | — | — | — |

## SR/Cloak Countdown

Both count **opponent turns elapsed** (not own turns). Activated → 2 → opponent ends turn → 1 → opponent ends turn → 0 → expired. Decrement happens after player switch in `endTurn()`. SR before cloak before `game.turn_start` event.
