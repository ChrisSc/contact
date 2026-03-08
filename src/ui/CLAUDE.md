# src/ui/ — Screens & Components (Vanilla DOM)

## Files

- **`screen-router.ts`** — `ScreenRouter` class: manages screen mount/unmount lifecycle, navigation with context passing, `setGame()` for restart flow
- **`flicker.ts`** — CRT flicker effect (persists across screen navigations)
- **`components/slice-grid.ts`** — `SliceGrid` class: 8x8 grid for one depth layer, cell state rendering, ghost preview, click handling
- **`components/depth-selector.ts`** — `DepthSelector` class: ALL + D1-D8 depth layer navigation (ALL = depth -1, clamped by screens)
- **`components/axis-selector.ts`** — `AxisSelector` class: 8-axis toggle (COL/ROW/DIAG↗/DIAG↘/COL+D/COL-D/ROW+D/ROW-D) for ship placement
- **`components/ship-roster.ts`** — `ShipRoster` class: fleet list (5 ships + decoy) with placement status, selection callbacks (`onShipSelect`, `onShipRemove`, `onDecoySelect`). Decoy entry styled amber, enabled via `setDecoyState(enabled, placed)`. Exports `DECOY_ID` constant.
- **`components/coordinate-display.ts`** — `CoordinateDisplay` class: shows hovered/selected cell coordinate
- **`components/perk-store.ts`** — `PerkStore` class: slide-out store panel with OFFENSIVE (red border) / DEFENSIVE (green border) sections. Each perk shows name, cost badge (amber), description, BUY button. `update(credits)` refreshes button enabled/disabled states. Callbacks: `onPurchase(perkId)`, `onClose()`.
- **`components/inventory-tray.ts`** — `InventoryTray` class: purchased perks grouped by perkId with count badges (e.g., "x3"). Slot badges (PING/ATK/DEF). Offensive red-tinted, defensive green-tinted. Selected state with glow border. `update(inventory)`, `getSelected()`, `clearSelection()`. Callback: `onSelect(instance)`.
- **`components/action-slots.ts`** — `ActionSlots` class: PING / ATTACK / DEFEND slot HUD. Three states: available (dim), used (bright + checkmark), unavailable (dark). `update(turnSlots, hasInventory)`.
- **`screens/setup-screen.ts`** — `mountSetupScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), depth panel, 8-axis selector, ship roster overlay, ghost cell preview via raycaster hover, ship/decoy placement via raycaster click, R key to cycle axes, confirm flow. Placement phases: `ships` → `decoy-pending` → `decoy` → `confirm`. Decoy requires explicit roster selection before placement.
- **`screens/handoff-screen.ts`** — `mountHandoffScreen()`: player transition with ready confirmation
- **`screens/combat-screen.ts`** — `mountCombatScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), targeting/own board toggle, fire torpedo via raycaster with 3D animations, coordinate hover feedback, HUD stats, enemy fleet status, credit display (amber), STORE button, perk store panel, inventory tray, action slots, ping mode flow, end turn
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
- **Combat animation wiring**: `handleFire()` calls `sceneManager.playHitAnimation(coord)` on hit, `sceneManager.playSunkAnimation(ship.cells)` on sunk (cells from `game.getOpponent().ships`), `sceneManager.playMissAnimation(coord)` on miss. `handlePing()` calls `sceneManager.playSonarAnimation(coord, positive)`. Animations run after `updateSceneGrid()` so they overwrite view materials.

## Combat Screen — Perk Integration

- **CombatUIState** includes `storeOpen`, `pingMode`, `turnSlots` fields.
- **Store toggle**: STORE button in top-right toggles perk store panel visibility. Store accessible anytime during turn.
- **Purchase flow**: `onPurchase` → `game.purchasePerk(perkId)` → refresh credits/inventory/store/action slots.
- **Ping mode**: Selecting sonar_ping from inventory → `pingMode = true`, hint changes to "CLICK CELL TO PING". `handleCellClick()` routes to `handlePing(coord)` when in ping mode, else `handleFire(coord)`.
- **Ping resolution**: `game.useSonarPing(coord)` → sonar sweep animation → status "SONAR: CONTACT" or "SONAR: NEGATIVE" → exit ping mode, refresh UI.
- **End turn gating**: `turnSlots.attackUsed` required (unchanged from pre-perk behavior).
- **Cleanup**: `perkStore.destroy()`, `inventoryTray.destroy()`, `actionSlotsComponent.destroy()` in `unmount()`.
