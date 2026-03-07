# tests/ui/ — UI Component & Screen Tests

## Files

- **`slice-grid.test.ts`** — 10 tests: grid rendering, cell state CSS classes, ghost cell preview, click callbacks
- **`setup-screen.test.ts`** — 10 tests: DOM structure, ship placement flow, reset, full end-to-end placement
- **`screen-router.test.ts`** — 4 tests: mount/unmount lifecycle, context passing, cleanup callback invocation

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
