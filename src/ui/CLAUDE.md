# src/ui/ — Screens & Components (Vanilla DOM)

## Files

- **`screen-router.ts`** — `ScreenRouter` class: manages screen mount/unmount lifecycle, navigation with context passing, `setGame()` for restart flow
- **`flicker.ts`** — CRT flicker effect (persists across screen navigations)
- **`components/slice-grid.ts`** — `SliceGrid` class: 8x8 grid for one depth layer, cell state rendering, ghost preview, click handling
- **`components/depth-selector.ts`** — `DepthSelector` class: ALL + D1-D8 depth layer navigation (ALL = depth -1, clamped by screens)
- **`components/axis-selector.ts`** — `AxisSelector` class: 6-axis toggle (COL/ROW/DIAG↗/DIAG↘/COL+D/ROW+D) for ship placement
- **`components/ship-roster.ts`** — `ShipRoster` class: fleet list (5 ships + decoy) with placement status, selection callbacks (`onShipSelect`, `onShipRemove`, `onDecoySelect`). Decoy entry styled amber, enabled via `setDecoyState(enabled, placed)`. Exports `DECOY_ID` constant.
- **`components/coordinate-display.ts`** — `CoordinateDisplay` class: shows hovered/selected cell coordinate
- **`screens/setup-screen.ts`** — `mountSetupScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), depth panel, 6-axis selector, ship roster overlay, ghost cell preview via raycaster hover, ship/decoy placement via raycaster click, confirm flow. Placement phases: `ships` → `decoy-pending` → `decoy` → `confirm`. Decoy requires explicit roster selection before placement.
- **`screens/handoff-screen.ts`** — `mountHandoffScreen()`: player transition with ready confirmation
- **`screens/combat-screen.ts`** — `mountCombatScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), targeting/own board toggle, fire torpedo via raycaster with 3D animations (hit flash, sunk cascade, miss fade), coordinate hover feedback, HUD stats (DEPTH/VISIBLE/SHOTS/HITS/SUNK/MODE), enemy fleet status, end turn
- **`screens/victory-screen.ts`** — `mountVictoryScreen()`: winner display, stats summary, session export, new engagement restart

## Architecture

- **Screen mount pattern**: Each screen exports `mount(container, context): ScreenCleanup`. ScreenRouter manages the lifecycle.
- **CRT overlay** persists across navigations — not re-created per screen.
- **Vanilla DOM only** — `createElement`, `appendChild`, `classList`. No innerHTML for dynamic content. No frameworks.
- **Both setup and combat screens** use canvas-dominant overlay layout with SceneManager. Setup shows own grid with ghost cell preview; combat shows targeting/own grid toggle.

## Style Guide

- **Classes** for stateful components: constructor builds DOM, `render()` returns root element, `update()` refreshes, `destroy()` cleans up.
- **Functions** for screens: closure-scoped local state, return cleanup function.
- CSS class toggling for visual state changes (not inline styles).

## Patterns

- **Event delegation**: Single listener on container, `data-*` attributes for cell targeting.
- **Callbacks for parent communication** — components accept callback functions, not custom events.
- **Ghost cell preview**: In 3D via `SceneManager.setGhostCells(coords, valid)` — green for valid, red for invalid placement.
- **Options object** pattern for component configuration.
- UI state lives in **screen closures**, NOT in GameController. Engine state and UI state are separate.
- **SceneManager shared pattern**: Both setup and combat screens instantiate SceneManager with `{ container }`, wire `onCellClick`/`onCellHover`, call `start()`, and `dispose()` on unmount.
- **Combat animation wiring**: `handleFire()` calls `sceneManager.playHitAnimation(coord)` on hit, `sceneManager.playSunkAnimation(ship.cells)` on sunk (cells from `game.getOpponent().ships`), `sceneManager.playMissAnimation(coord)` on miss. Animations run after `updateSceneGrid()` so they overwrite view materials.
