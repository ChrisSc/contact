# src/types/ — TypeScript Type Definitions

Pure type definitions and readonly constants only. No runtime logic. Imported by all layers.

## Files

| File | Key Exports |
|---|---|
| `grid.ts` | `Grid3D`, `Cell`, `Coordinate`, `CellState` enum, column/row/depth labels |
| `fleet.ts` | `Ship`, `PlacementAxis` (8 axes), `FLEET_ROSTER` (7 ships), `PLACEMENT_AXES`, `TOTAL_SHIP_CELLS` |
| `game.ts` | `GamePhase` enum, `PlayerState`, `GameState`, `TurnSlots`, `SilentRunningEntry`, `PlayerIndex = 0 \| 1` |
| `abilities.ts` | `PerkId` (7 perks), `PerkSlot` (ping/attack/defend), `PerkDefinition`, `PerkInstance`, `PERK_CATALOG`, `STARTING_CREDITS` |
| `events.ts` | `LogEventType` union, `LogEvent` interface, per-category payload interfaces |
| `globals.d.ts` | Ambient declarations for `__APP_VERSION__`, `__BUILD_DATE__` |

## Conventions

- `enum` for finite state sets (`CellState`, `GamePhase`)
- String literal unions for IDs (`PerkId`, `PerkSlot`, `PlacementAxis`, `LogEventType`)
- `as const` for immutable arrays (`FLEET_ROSTER`, `PERK_CATALOG`)
- `interface` over `type` for object shapes
- `CellState` enum values used directly as CSS class suffixes
