# tests/ui/ — UI Component & Screen Tests

## Files

- **`slice-grid.test.ts`** — grid rendering, cell state CSS classes, ghost cell preview, click callbacks
- **`setup-screen.test.ts`** — mocked SceneManager (no WebGL), 3D canvas container, view mode selector (CUBE/SLICE/X-RAY), depth buttons (ALL+1-8), 6-axis selector (COL/ROW/DIAG↗/DIAG↘/COL+D/ROW+D), ship roster (5 ships + decoy), raycaster cell click placement, raycaster hover coordinate display, ghost cell preview via setGhostCells, full placement flow (ships → select decoy → place decoy → confirm), reset, dispose on unmount
- **`screen-router.test.ts`** — mount/unmount lifecycle, context passing, cleanup callback invocation
- **`combat-screen.test.ts`** — mocked SceneManager (no WebGL, includes animation method mocks), header/HUD rendering (DEPTH/VISIBLE/SHOTS/HITS/SUNK/MODE), 3D canvas container, view mode selector (CUBE/SLICE/X-RAY), fire torpedo via raycaster callback, coordinate hover feedback, board toggle → setBoardType, end turn navigation, victory auto-navigation, dispose on unmount
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
- **SceneManager mock pattern**: Shared across setup and combat tests — mock object with `vi.fn()` for all methods (including `playHitAnimation`/`playSunkAnimation`/`playMissAnimation`), `onCellClick`/`onCellHover` capture callbacks, `views` sub-object with `getInteractableMeshes`. `resetMocks()` helper clears state between tests.
- **Full user flow tests**: Select ship -> raycaster click -> verify placement in both DOM and engine.
- **Cleanup verification**: Confirm `dispose()` called on screen navigation.
- **CSS class assertions**: Visual state (hit, miss, ship, ghost) verified via `classList.contains()`.
- **`setupCombatGame()` helper**: Places all ships + decoys for both players at known positions, confirms both → Combat phase. Reused across combat and victory tests.
- **Programmatic game progression**: For victory tests, fires torpedoes and alternates turns via engine API to reach near-victory or full victory state before mounting the screen under test.
- **`vi.spyOn` for side effects**: Export session tested via spy on the module function rather than checking file output.
