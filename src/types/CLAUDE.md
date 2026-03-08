# src/types/ — TypeScript Type Definitions

## Files

- **`grid.ts`** — `Grid3D`, `Cell`, `Coordinate` types; `CellState` enum; column/row/depth label constants
- **`fleet.ts`** — `Ship`, `FleetRosterEntry`, `PlacementAxis` type; `FLEET_ROSTER` constant; `PLACEMENT_AXES` constant (8-axis cycle order); `TOTAL_SHIP_CELLS` constant
- **`game.ts`** — `GamePhase` enum, `PlayerState`, `GameState`, `TurnSlots`, `SilentRunningEntry` interfaces; `PlayerIndex = 0 | 1`
- **`abilities.ts`** — `AbilityId` union, `AbilityState` interface, `ABILITY_DEFINITIONS` constant; `PerkId` union, `PerkSlot` union, `PerkDefinition`/`PerkInstance` interfaces, `PlayerInventory` type, `STARTING_CREDITS` constant, `PERK_CATALOG` constant
- **`events.ts`** — `LogEventType` string literal union (includes `fleet.decoy_place`, `view.depth_change`, `view.mode_change`, `view.board_toggle`, `economy.credit`, `economy.purchase`, `economy.balance`, `perk.use`, `perk.effect`, `perk.expire`), `LogEvent` interface, payload interfaces per event category

## Architecture

- **Pure type definitions + readonly constants only.** No runtime logic. No functions.
- Imported by all layers (engine, UI, observability, renderer).
- Types define the contract; implementations live in their respective directories.

## Style Guide

- `enum` for finite state sets: `CellState`, `GamePhase`.
- String literal unions for IDs: `AbilityId`, `PerkId`, `PerkSlot`, `PlacementAxis`, `LogEventType`.
- `as const` for immutable arrays (`FLEET_ROSTER`, `ABILITY_DEFINITIONS`, `PERK_CATALOG`, label arrays).
- `interface` over `type` alias for object shapes.
- `readonly` modifier on arrays that should not be mutated (rosters, labels, catalogs).

## Patterns

- **0-indexed internally, 1-indexed for display.** Column labels A-H, Row labels 1-8, Depth labels D1-D8.
- `PlayerIndex = 0 | 1` — ALPHA is 0, BRAVO is 1. Used throughout engine and UI.
- Event payload interfaces are per-category (fleet, combat, ability, economy, perk) — each event type has a typed payload.
- `CellState` enum values are used directly as CSS class suffixes in the UI layer.

## Perk System Types

- **`PerkId`**: 7 perks — `sonar_ping`, `recon_drone`, `depth_charge`, `g_sonar`, `radar_jammer`, `silent_running`, `acoustic_cloak`
- **`PerkSlot`**: `'ping' | 'attack' | 'defend'` — determines which turn slot a perk consumes
- **`PerkDefinition`**: Catalog entry with id, name, type (offensive/defensive), slot, cost, description
- **`PerkInstance`**: Runtime instance with unique id (e.g., `sonar_ping_1`), perkId, purchasedOnTurn
- **`PlayerState`** now includes `credits: number`, `inventory: PerkInstance[]`, `lastTurnHit: boolean`, `silentRunningShips: SilentRunningEntry[]`
- **`SilentRunningEntry`**: `{ shipId: string, turnsRemaining: number }` — tracks active SR state per ship
- **`TurnSlots`**: `{ pingUsed, attackUsed, defendUsed }` — replaces old `actionTaken: boolean`

## PlacementAxis

8 axes — no purely vertical (depth-only): `'col' | 'row' | 'diag+' | 'diag-' | 'col-depth' | 'col-depth-' | 'row-depth' | 'row-depth-'`
- Within-slice: `col`, `row`, `diag+`, `diag-`
- Cross-slice: `col-depth`, `col-depth-`, `row-depth`, `row-depth-`
- `PLACEMENT_AXES` constant defines the cycle order for R-key rotation
