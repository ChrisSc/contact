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
- **`screens/setup-screen.ts`** — `mountSetupScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), depth panel, 8-axis selector, ship roster overlay, ghost cell preview via raycaster hover, ship/decoy placement via raycaster click, R key to cycle axes, AUTO DEPLOY button (random valid placement of all ships + decoy), confirm flow. Placement phases: `ships` → `decoy-pending` → `decoy` → `confirm`. Decoy requires explicit roster selection before placement.
- **`screens/handoff-screen.ts`** — `mountHandoffScreen()`: player transition with ready confirmation
- **`screens/combat-screen.ts`** — `mountCombatScreen()`: canvas-dominant 3D layout with SceneManager, view mode selector (CUBE/SLICE/X-RAY), targeting/own board toggle, fire torpedo via raycaster with 3D animations, coordinate hover feedback, HUD stats, enemy fleet status, credit display (amber), STORE button, perk store panel, inventory tray, action slots, ping mode flow, drone mode flow, depth charge mode flow, silent running mode flow, audio integration, end turn
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
- **Combat animation wiring**: `handleFire()` calls `sceneManager.playHitAnimation(coord)` on hit, `sceneManager.playSunkAnimation(ship.cells)` on sunk (cells from `game.getOpponent().ships`), `sceneManager.playMissAnimation(coord)` on miss. `handlePing()` calls `sceneManager.playSonarAnimation(coord, positive)`. `handleDroneScan()` filters `result.cells` to only `written` cells, then calls `sceneManager.playDroneScanAnimation(writtenCells)`. `handleDepthChargeStrike()` filters `already_resolved` cells, then calls `sceneManager.playDepthChargeAnimation(center, animResults)`. Animations run after `updateSceneGrid()` so they overwrite view materials.

## Combat Screen — Perk Integration

- **CombatUIState** includes `storeOpen`, `pingMode`, `droneMode`, `depthChargeMode`, `silentRunningMode`, `gSonarMode`, `turnSlots` fields.
- **Store toggle**: STORE button in top-right toggles perk store panel visibility. Store accessible anytime during turn.
- **Purchase flow**: `onPurchase` → `game.purchasePerk(perkId)` → `playPurchaseSound()` on success / `playInsufficientFundsSound()` on failure → refresh credits/inventory/store/action slots.
- **Ping mode**: Selecting sonar_ping from inventory → `pingMode = true`, hint changes to "CLICK CELL TO PING". `handleCellClick()` routes to `handlePing(coord)` when in ping mode, else `handleFire(coord)`.
- **Ping resolution**: `game.useSonarPing(coord)` → sonar sweep animation → status "SONAR: CONTACT" or "SONAR: NEGATIVE" → exit ping mode, refresh UI.
- **Drone mode**: Selecting recon_drone from inventory → `droneMode = true`, hover shows 3×3×3 ghost cell preview via `calculateScanArea()`. Click → `handleDroneScan(coord)` → `game.useReconDrone()` → filter to `written` cells → animate + count only written cells → status "DRONE SCAN: N CONTACTS".
- **Depth charge mode**: Selecting depth_charge from inventory → `depthChargeMode = true`, hover shows 3×3×3 ghost cell preview (reuses `calculateScanArea()`). Click → `handleDepthChargeStrike(coord)` → `game.useDepthCharge()` → depth charge blast animation + audio → status "DEPTH CHARGE: N HITS" / "N SUNK" → refresh all UI.
- **Silent running mode**: Selecting silent_running from inventory → switches to own grid, `silentRunningMode = true`. Click on own ship cell → `handleSilentRunningSelect(coord)` → `game.useSilentRunning(shipId)` → activation audio → status "SILENT RUNNING: [SHIP] CLOAKED (2 TURNS)" → switches back to targeting grid.
- **SR overlay on own grid**: `updateSceneGrid()` clears SR overlay, then rebuilds from `player.silentRunningShips` when `boardView === 'own'` via `sceneManager.setSilentRunningOverlay(coords)`.
- **Mode cancellation**: Switching board view or selecting a new inventory item cancels any active mode (ping/drone/depthCharge/silentRunning) and clears ghost cells.
- **Audio integration**: `initAudioContext()` called on first user interaction (handleFire, handlePing, handleDroneScan, handleDepthChargeStrike, handleSilentRunningSelect, handleEndTurn, handleGSonarScan). After init, starts ambient if not running (`startAmbient()`). Sound functions fire-and-forget. `handleEndTurn` computes audio phase from turn count and calls `setGamePhase()` + `updateAmbientPhase()`. `unmount()` calls `stopAmbient()`.
- **Mute button**: Green-bordered toggle in top-right bar (next to STORE). Reads `isMuted()` for initial state, calls `toggleMute()` on click, updates text (MUTE/UNMUTE) and `--muted` modifier class.
- **SR expire audio**: `handleEndTurn()` checks `game.getLastSRExpired().length > 0` and plays `playSilentRunningExpire()` when ships exit silent running.
- **G-SONAR mode**: Selecting `g_sonar` from inventory → `gSonarMode = true`, selectLabel changes to "SELECT DEPTH LAYER", hint changes to "CLICK D1-D8 TO SCAN ENTIRE DEPTH LAYER". `handleDepthChange()` intercepts when `gSonarMode` is true: clicking ANY numbered depth button (D1-D8, depth 0-7) routes to `handleGSonarScan(depth)`, clicking ALL (depth -1) is ignored. `handleGSonarScan()` calls `game.useGSonar(depth)`, plays `playGSonarSound()`, calls `sceneManager.playGSonarScanAnimation(writtenCells)` (only cells with `written: true`), shows status "G-SONAR: N CONTACTS ON LAYER Dn" / "G-SONAR: LAYER Dn CLEAR" / "G-SONAR: LAYER Dn SCAN JAMMED" (cloaked case), then resets UI and enables end turn.
- **Acoustic Cloak**: Selecting `acoustic_cloak` from inventory → instant deploy via `game.useAcousticCloak()`, plays `playAcousticCloakSound()`, shows status "ACOUSTIC CLOAK: ALL SHIPS MASKED (2 TURNS)", refreshes inventory/action slots. Same instant-deploy pattern as `radar_jammer`.
- **Radar jammer display**: `refreshInventory()` filters out `radar_jammer` instances when `player.abilities.radar_jammer.active` — deployed jammer disappears from tray until consumed by opponent action.
- **Mode cancellation**: `gSonarMode` is cancelled (set to false + `inventoryTray.clearSelection()`) when switching board view via `handleBoardToggle()`, and cancelled (set to false) when selecting any new inventory item via `handleInventorySelect()`.
- **Audio functions**: `playGSonarSound()` fires on G-SONAR scan; `playAcousticCloakSound()` fires on Acoustic Cloak deploy. Both imported from `../../audio/abilities`.
- **End turn gating**: `turnSlots.attackUsed` required (unchanged from pre-perk behavior).
- **Cleanup**: `perkStore.destroy()`, `inventoryTray.destroy()`, `actionSlotsComponent.destroy()`, `stopAmbient()` in `unmount()`.
