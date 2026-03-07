# tests/renderer/ — Three.js Renderer Tests

## Files

- **`materials.test.ts`** — 17 tests: MaterialSet per CellState, pool reuse, hover set, transparency/depthWrite, color correctness, dimmed/ghost pools, setDimOpacity/setGhostOpacity scaling, dispose cleanup
- **`orbit.test.ts`** — 15 tests: sphericalToCartesian math, phi clamping, distance clamping, OrbitControls camera positioning, reset, setEnabled, dispose
- **`cube.test.ts`** — 18 tests: coordToPosition mapping, 512 mesh creation, getCellMesh/coordFromMesh lookups, updateCell material swap, updateFromGrid bulk update, cell positioning, getCellMeshesAtDepth, getAllCellMeshes, setLayerVisible, dispose cleanup
- **`views.test.ts`** — 22 tests: CUBE/SLICE/XRAY mode visibility, depth selection, material tier assignment, boardType filtering, getInteractableMeshes counts, transitions, mode/depth state changes
- **`raycaster.test.ts`** — 5 tests: NDC normalization, no-intersection handling, mesh source filtering, default mesh source fallback, dispose
- **`scene.test.ts`** — 11 tests: sub-component wiring, ViewManager/Raycaster instantiation, canvas appended, start/stop rAF, setViewMode/setDepth/setBoardType delegation, ghost cell methods (setGhostCells/clearGhostCells), dispose cleanup, callback registration

## Architecture

- Materials, cube, views, and raycaster tests run **without jsdom** — Three.js geometry classes work headlessly.
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
