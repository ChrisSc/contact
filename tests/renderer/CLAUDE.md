# tests/renderer/ — Three.js Renderer Tests

## Files

- **`materials.test.ts`** — MaterialSet per CellState, pool reuse, hover set, transparency/depthWrite, color correctness (CYAN for DronePositive/SonarPositive), dimmed/ghost pools, setDimOpacity/setGhostOpacity scaling, MATERIAL_DEFS export completeness, dispose cleanup
- **`orbit.test.ts`** — sphericalToCartesian math, phi clamping, distance clamping, OrbitControls camera positioning, reset, setEnabled, dispose
- **`cube.test.ts`** — coordToPosition mapping, 512 mesh creation, getCellMesh/coordFromMesh lookups, updateCell material swap, updateFromGrid bulk update, cell positioning, getCellMeshesAtDepth, getAllCellMeshes, setLayerVisible, dispose cleanup
- **`views.test.ts`** — CUBE/SLICE/XRAY mode visibility, depth selection, material tier assignment, boardType filtering, getInteractableMeshes counts, transitions, mode/depth state changes
- **`raycaster.test.ts`** — NDC normalization, no-intersection handling, mesh source filtering, default mesh source fallback, dispose
- **`animations.test.ts`** — hit flash (private materials, full opacity start, pulse after 200ms, infinite loop), sunk cascade (multi-cell entries, stagger timing, RED→ORANGE lerp, completion with pooled restore), miss fade (zero start, target opacity at 300ms, one-shot completion), sonar sweep (private materials, zero start, pulse phase, completion restores pooled SonarPositive/SonarNegative, negative variant), cancelAt/cancelAll, isAnimating, duplicate cancellation, dispose cleanup
- **`scene.test.ts`** — sub-component wiring, AnimationManager instantiation, ViewManager/Raycaster instantiation, canvas appended, start/stop rAF, animations.update in render loop, setViewMode/setDepth/setBoardType delegation, dispose cleanup (including animations.dispose), callback registration
- **`visual-audit.test.ts`** — GDD §2.3 visual state audit: all 11 CellState material definitions (colors + opacities), CRT color palette completeness, material consistency (valid ranges, opacity ordering), hit flash animation contract (looping, sinusoidal pulse 0.5–1.0, period 1.5s), X-RAY board type filtering (TARGETING_VISIBLE_STATES excludes Ship, OWN_VISIBLE_STATES includes Ship). 33 tests across 5 describe blocks. Documents accepted deviation: no decoy blink animation (static yellow).

## Architecture

- Materials, cube, views, animations, and raycaster tests run **without jsdom** — Three.js geometry classes work headlessly.
- Orbit and scene tests use `// @vitest-environment jsdom` for DOM/pointer events.
- Scene tests **mock `THREE.WebGLRenderer`** (stub setSize, setClearColor, render, dispose; mock domElement as canvas) and **polyfill `ResizeObserver`**.

## Style Guide

- Per-file jsdom pragma where needed (not configured globally).
- `beforeEach` creates fresh MaterialPool/GridCube/OrbitControls for isolation.
- `afterEach` calls `dispose()` on all created objects to prevent leaks.

## Patterns

- **Pure function tests**: `sphericalToCartesian`, `clampPhi`, `clampDistance`, `coordToPosition` tested independently of classes.
- **Pool reuse assertions**: Same `getMaterials(state)` call returns identical reference (`toBe`).
- **Material swap verification**: Compare `box.material` reference before/after `updateCell()`.
- **View mode assertions**: Check `group.visible` and `box.material` references against expected pool tier (normal/dimmed/ghost).
- **Mock WebGLRenderer**: Avoids real WebGL context in jsdom; returns a real `<canvas>` element as `domElement`.
- **MockResizeObserver**: Stub with `observe`/`unobserve`/`disconnect` as `vi.fn()`.
- **Animation completion assertions**: Advance time past duration, verify `isAnimating` returns false and cell materials match pooled state (e.g., `SonarPositive`, `SonarNegative`, `Sunk`, `Miss`).
