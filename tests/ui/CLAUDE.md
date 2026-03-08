# tests/ui/ — UI Component & Screen Tests

## Files

- **`slice-grid.test.ts`** — grid rendering, cell state CSS classes, ghost cell preview, click callbacks
- **`setup-screen.test.ts`** — mocked SceneManager (no WebGL), 3D canvas container, view mode selector (CUBE/SLICE/X-RAY), depth buttons (ALL+1-8), 8-axis selector (ROW/COL/DIAG↗/DIAG↘/ROW+D/ROW-D/COL+D/COL-D), ship roster (5 ships + decoy), raycaster cell click placement, raycaster hover coordinate display, ghost cell preview via setGhostCells, R key axis cycling (next, wrap, disabled in confirm), full placement flow (ships → select decoy → place decoy → confirm), reset, dispose on unmount
- **`screen-router.test.ts`** — mount/unmount lifecycle, context passing, cleanup callback invocation
- **`combat-screen.test.ts`** — mocked SceneManager (no WebGL, includes animation method mocks + `playSonarAnimation` + `playDroneScanAnimation` + `playDepthChargeAnimation` + `setSilentRunningOverlay` + `clearSilentRunningOverlay` + `clearGhostCells` + `setGhostCells`), mocked audio modules (`audio-manager`, `abilities`), header/HUD rendering (DEPTH/VISIBLE/SHOTS/HITS/SUNK/MODE), 3D canvas container, view mode selector (CUBE/SLICE/X-RAY), fire torpedo via raycaster callback, coordinate hover feedback, board toggle → setBoardType, end turn navigation, victory auto-navigation, dispose on unmount, credit display (CR: N), store button toggle, perk purchase flow (buy → credits deducted → inventory updated), inventory tray item rendering, ping mode activation (select sonar_ping → hint changes), sonar animation triggered on ping, action slots rendering, hit credit award display
- **`victory-screen.test.ts`** — winner designation, stats display, export session trigger, new engagement restart

## Architecture

- Component and screen **integration tests** using jsdom.
- Tests mount real components with real `GameController` instances. `SceneManager` is mocked in both setup and combat tests (WebGL unavailable in jsdom).
- Verifies both DOM output and engine state consistency.

## Style Guide

- **Per-file jsdom pragma**: `// @vitest-environment jsdom` at top of each file (not configured globally).
- DOM queries via `querySelector` / `querySelectorAll`.
- Event simulation via `.click()` on DOM elements or raycaster callback invocation.
- State verified through both CSS class assertions and `game.getCurrentPlayer()` checks.

## Patterns

- `beforeEach` creates fresh DOM container + GameController + Logger for isolation.
- **SceneManager mock pattern**: Shared across setup and combat tests — mock object with `vi.fn()` for all methods (including `playHitAnimation`/`playSunkAnimation`/`playMissAnimation`/`playSonarAnimation`/`playDroneScanAnimation`/`playDepthChargeAnimation`/`playScreenShake`/`setSilentRunningOverlay`/`clearSilentRunningOverlay`/`setGhostCells`/`clearGhostCells`), `onCellClick`/`onCellHover` capture callbacks, `views` sub-object with `getInteractableMeshes`. `resetMocks()` helper clears state between tests.
- **Audio mock pattern**: `vi.mock('../../src/audio/audio-manager')` (all exports including phase tracking + mute), `vi.mock('../../src/audio/abilities')` (all 14 SFX), and `vi.mock('../../src/audio/ambient')` (`startAmbient`, `stopAmbient`, `updateAmbientPhase`, `isAmbientRunning`) to avoid Tone.js ESM import failures in jsdom. All audio functions mocked as no-ops.
- **Full user flow tests**: Select ship -> raycaster click -> verify placement in both DOM and engine. Buy perk -> select from inventory -> ping cell -> verify animation and status.
- **Cleanup verification**: Confirm `dispose()` called on screen navigation (including perk store, inventory tray, action slots, notification banner).
- **CSS class assertions**: Visual state (hit, miss, ship, ghost) verified via `classList.contains()`.
- **`setupCombatGame()` helper**: Places all ships + decoys for both players at known positions, confirms both → Combat phase. Reused across combat and victory tests.
- **Programmatic game progression**: For victory tests, fires torpedoes and alternates turns via engine API to reach near-victory or full victory state before mounting the screen under test. For perk tests, calls `game.purchasePerk()` then re-navigates to refresh UI.
- **`vi.spyOn` for side effects**: Export session tested via spy on the module function rather than checking file output.
