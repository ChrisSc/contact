# tests/renderer/ — Three.js Renderer Tests

## Files

- **`materials.test.ts`** — 9 tests: MaterialSet per CellState, pool reuse (same reference), hover set distinct, transparency/depthWrite, color correctness, dispose
- **`orbit.test.ts`** — 15 tests: sphericalToCartesian math, phi clamping, distance clamping, OrbitControls camera positioning, reset, setEnabled, dispose
- **`cube.test.ts`** — 13 tests: coordToPosition mapping, 512 mesh creation, getCellMesh/coordFromMesh lookups, updateCell material swap, updateFromGrid bulk update, cell positioning, dispose cleanup
- **`scene.test.ts`** — 5 tests: sub-component wiring, canvas appended to container, cube root in scene, start/stop rAF management, dispose cleanup

## Architecture

- Materials and cube tests run **without jsdom** — Three.js geometry classes work headlessly.
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
- **Mock WebGLRenderer**: Avoids real WebGL context in jsdom; returns a real `<canvas>` element as `domElement`.
- **MockResizeObserver**: Stub with `observe`/`unobserve`/`disconnect` as `vi.fn()`.
