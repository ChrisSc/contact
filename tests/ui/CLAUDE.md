# tests/ui/ — UI Component & Screen Tests

## Files

- **`slice-grid.test.ts`** — 10 tests: grid rendering, cell state CSS classes, ghost cell preview, click callbacks
- **`setup-screen.test.ts`** — 10 tests: DOM structure, ship placement flow, reset, full end-to-end placement, depth selector (9 buttons incl. ALL)
- **`screen-router.test.ts`** — 4 tests: mount/unmount lifecycle, context passing, cleanup callback invocation
- **`combat-screen.test.ts`** — 14 tests: header/grid/HUD rendering (DEPTH/VIEW/CELLS metrics), fire torpedo flow, board toggle, end turn navigation, game log, victory auto-navigation, depth selector (9 buttons incl. ALL)
- **`victory-screen.test.ts`** — 4 tests: winner designation, stats display, export session trigger, new engagement restart

## Architecture

- Component and screen **integration tests** using jsdom.
- Tests mount real components with real `GameController` instances — not mocked.
- Verifies both DOM output and engine state consistency.

## Style Guide

- **Per-file jsdom pragma**: `// @vitest-environment jsdom` at top of each file (not configured globally).
- DOM queries via `querySelector` / `querySelectorAll`.
- Event simulation via `.click()` on DOM elements.
- State verified through both CSS class assertions and `game.getCurrentPlayer()` checks.

## Patterns

- `beforeEach` creates fresh DOM container + GameController + Logger for isolation.
- **Full user flow tests**: Select ship -> click cell -> verify placement in both DOM and engine.
- **Cleanup verification**: Confirm cleanup callbacks are called on screen navigation.
- **CSS class assertions**: Visual state (hit, miss, ship, ghost) verified via `classList.contains()`.
- **`setupCombatGame()` helper**: Places all ships + decoys for both players at known positions, confirms both → Combat phase. Reused across combat and victory tests.
- **Programmatic game progression**: For victory tests, fires torpedoes and alternates turns via engine API to reach near-victory or full victory state before mounting the screen under test.
- **`vi.spyOn` for side effects**: Export session tested via spy on the module function rather than checking file output.
