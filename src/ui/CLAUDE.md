# src/ui/ — Screens & Components (Vanilla DOM)

## Files

- **`screen-router.ts`** — `ScreenRouter` class: manages screen mount/unmount lifecycle, navigation with context passing, `setGame()` for restart flow
- **`flicker.ts`** — CRT flicker effect (persists across screen navigations)
- **`components/slice-grid.ts`** — `SliceGrid` class: 8x8 grid for one depth layer, cell state rendering, ghost preview, click handling
- **`components/depth-selector.ts`** — `DepthSelector` class: ALL + D1-D8 depth layer navigation (ALL = depth -1, clamped by screens)
- **`components/axis-selector.ts`** — `AxisSelector` class: column/row/depth axis toggle for ship placement
- **`components/ship-roster.ts`** — `ShipRoster` class: fleet list with placement status, selection callback
- **`components/coordinate-display.ts`** — `CoordinateDisplay` class: shows hovered/selected cell coordinate
- **`screens/setup-screen.ts`** — `mountSetupScreen()`: ship placement + decoy + confirm flow
- **`screens/handoff-screen.ts`** — `mountHandoffScreen()`: player transition with ready confirmation
- **`screens/combat-screen.ts`** — `mountCombatScreen()`: targeting/own grid toggle, fire torpedo, HUD stats (DEPTH/VIEW/CELLS/TURN/SHOTS/HITS/RATE), enemy fleet status (ACTIVE/SUNK labels), game log, end turn
- **`screens/victory-screen.ts`** — `mountVictoryScreen()`: winner display, stats summary, session export, new engagement restart

## Architecture

- **Screen mount pattern**: Each screen exports `mount(container, context): ScreenCleanup`. ScreenRouter manages the lifecycle.
- **CRT overlay** persists across navigations — not re-created per screen.
- **Vanilla DOM only** — `createElement`, `appendChild`, `classList`. No innerHTML for dynamic content. No frameworks.

## Style Guide

- **Classes** for stateful components: constructor builds DOM, `render()` returns root element, `update()` refreshes, `destroy()` cleans up.
- **Functions** for screens: closure-scoped local state, return cleanup function.
- CSS class toggling for visual state changes (not inline styles).

## Patterns

- **Event delegation**: Single listener on container, `data-*` attributes for cell targeting.
- **Callbacks for parent communication** — components accept callback functions, not custom events.
- **Ghost cell preview**: Hover shows potential ship placement cells before click confirmation.
- **Options object** pattern for component configuration.
- UI state lives in **screen closures**, NOT in GameController. Engine state and UI state are separate.
