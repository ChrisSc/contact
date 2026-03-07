# src/renderer/ — Three.js 3D Rendering

## Files

- **`materials.ts`** — `CRT_COLORS` palette, `MaterialSet` interface, `MaterialPool` class (pooled materials per `CellState`)
- **`orbit.ts`** — Custom `OrbitControls` (spherical coords, pointer/wheel/pinch events, damping). Exports pure helpers: `sphericalToCartesian`, `clampPhi`, `clampDistance`
- **`cube.ts`** — `GridCube` class (512 `BoxGeometry` + `EdgesGeometry` meshes in 8x8x8 layout), `coordToPosition` helper
- **`scene.ts`** — `SceneManager` orchestrator (scene, camera, renderer, orbit, cube, render loop, resize, dispose)

## Architecture

- **No OrbitControls from Three.js** — custom implementation using spherical coordinates and pointer events.
- **MaterialPool** creates materials once, reuses via `getMaterials(state)`. Material swap = reference assignment, no mesh recreation.
- **GridCube** uses shared `BoxGeometry` and `EdgesGeometry` for all 512 cells. Two Maps for O(1) lookups: coord→CellMesh and mesh→Coordinate.
- **SceneManager** is the single entry point for the combat screen. Call `updateGrid(grid)` to push state to the renderer.
- **ResizeObserver** handles responsive canvas sizing. `devicePixelRatio` capped at 2.

## Patterns

- Dispose pattern: every class has `dispose()` that cleans up Three.js resources and event listeners.
- Camera targets origin (0,0,0). Grid is centered at origin via `GRID_OFFSET = 3.5`.
- Fog (`FogExp2`) fades distant cells for depth perception.
- Logger events: `view.rotate` on drag end, `view.change` on scene init.

## Coordinate System

- Internal: `grid[col][row][depth]`, 0-indexed
- 3D position: `x = col - 3.5`, `y = row - 3.5`, `z = depth - 3.5`
- Cell size 0.9, spacing 1.0

## Testing

- Materials and cube tests run without jsdom (Three.js geometry works headlessly)
- Orbit and scene tests use `@vitest-environment jsdom`
- Scene tests mock `THREE.WebGLRenderer` and polyfill `ResizeObserver`
