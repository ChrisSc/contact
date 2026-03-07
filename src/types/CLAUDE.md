# src/types/ — TypeScript Type Definitions

## Files

- **`grid.ts`** — `Grid3D`, `Cell`, `Coordinate` types; `CellState` enum; column/row/depth label constants
- **`fleet.ts`** — `Ship`, `FleetRosterEntry`, `PlacementAxis` type; `FLEET_ROSTER` constant
- **`game.ts`** — `GamePhase` enum, `PlayerState`, `GameState` interfaces; `PlayerIndex = 0 | 1`. No dead code (`GameEvent` removed).
- **`abilities.ts`** — `AbilityId` union, `AbilityState` interface, `ABILITY_DEFINITIONS` constant
- **`events.ts`** — `LogEventType` string literal union (includes `fleet.decoy_place`, `view.depth_change`, `view.mode_change`, `view.board_toggle`), `LogEvent` interface, payload interfaces per event category

## Architecture

- **Pure type definitions + readonly constants only.** No runtime logic. No functions.
- Imported by all layers (engine, UI, observability, renderer).
- Types define the contract; implementations live in their respective directories.

## Style Guide

- `enum` for finite state sets: `CellState`, `GamePhase`.
- String literal unions for IDs: `AbilityId`, `PlacementAxis`, `LogEventType`.
- `as const` for immutable arrays (`FLEET_ROSTER`, label arrays).
- `interface` over `type` alias for object shapes.
- `readonly` modifier on arrays that should not be mutated (rosters, labels).

## Patterns

- **0-indexed internally, 1-indexed for display.** Column labels A-H, Row labels 1-8, Depth labels D1-D8.
- `PlayerIndex = 0 | 1` — ALPHA is 0, BRAVO is 1. Used throughout engine and UI.
- Event payload interfaces are per-category (fleet, combat, ability) — each event type has a typed payload.
- `CellState` enum values are used directly as CSS class suffixes in the UI layer.
