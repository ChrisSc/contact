# src/renderer/ — Three.js 3D Rendering

## Files

- **`materials.ts`** — `CRT_COLORS` palette, `MaterialSet` interface, `MaterialPool` class (normal + dimmed + ghost material pools per `CellState`)
- **`orbit.ts`** — Custom `OrbitControls` (spherical coords, pointer/wheel/pinch events, damping). Exports pure helpers: `sphericalToCartesian`, `clampPhi`, `clampDistance`. Public `dragging` getter.
- **`cube.ts`** — `GridCube` class (512 `BoxGeometry` + `EdgesGeometry` meshes in 8x8x8 layout), `coordToPosition` helper, layer helpers (`getCellMeshesAtDepth`, `getAllCellMeshes`, `setLayerVisible`)
- **`views.ts`** — `ViewManager` class: three view modes (CUBE, SLICE, X-RAY), depth layer control, board type, smooth opacity transitions, interactable mesh filtering
- **`raycaster.ts`** — `GridRaycaster` class: wraps `THREE.Raycaster` for cell picking via NDC normalization, configurable mesh source
- **`scene.ts`** — `SceneManager` orchestrator (scene, camera, renderer, orbit, cube, views, raycaster, render loop with delta time, pointer events, ghost cell overlay, resize, dispose)

## Architecture

- **No OrbitControls from Three.js** — custom implementation using spherical coordinates and pointer events.
- **MaterialPool** creates three tiers of materials: normal, dimmed (30% opacity), ghost (15% opacity). Per-tier opacity can be animated via `setDimOpacity(t)` / `setGhostOpacity(t)`.
- **GridCube** uses shared `BoxGeometry` and `EdgesGeometry` for all 512 cells. Two Maps for O(1) lookups: coord→CellMesh and mesh→Coordinate.
- **ViewManager** controls cell visibility and material assignment per view mode:
  - CUBE ALL: all visible, normal materials
  - CUBE depth: selected layer normal, others dimmed
  - SLICE: selected visible+normal, ±1 visible+ghost, rest hidden
  - X-RAY: only non-empty cells visible (filtered by board type)
- **GridRaycaster** picks cells via `THREE.Raycaster`, mesh source filtered by ViewManager.
- **SceneManager** is the entry point for both setup and combat screens. Call `updateGrid(grid)` to push state; `setViewMode()`, `setDepth()`, `setBoardType()` to control view. Pointer events for cell click/hover with orbit drag suppression. Ghost cell overlay via `setGhostCells(coords, valid)` / `clearGhostCells()` for placement preview.
- **ResizeObserver** handles responsive canvas sizing. `devicePixelRatio` capped at 2.

## Ghost Cell Overlay

- `setGhostCells(coords, valid)` temporarily swaps materials on specified cells to green (valid) or red (invalid)
- `clearGhostCells()` restores original materials
- Ghost materials (valid/invalid fill + edge) created once in constructor, disposed on cleanup
- Used by setup screen for ship/decoy placement preview in 3D

## Patterns

- Dispose pattern: every class has `dispose()` that cleans up Three.js resources and event listeners.
- Camera targets origin (0,0,0). Grid is centered at origin via `GRID_OFFSET = 3.5`.
- Fog (`FogExp2`) fades distant cells for depth perception.
- Logger events: `view.rotate` on drag end, `view.change` on scene init, `view.mode_change` on mode switch, `view.depth_change` on depth change.
- View transitions: ~200ms opacity lerp for dimmed/ghost materials.

## Coordinate System

- Internal: `grid[col][row][depth]`, 0-indexed
- 3D position: `x = col - 3.5`, `y = row - 3.5`, `z = depth - 3.5`
- Cell size 0.9, spacing 1.0

## Testing

- Materials, cube, views, and raycaster tests run without jsdom (Three.js geometry works headlessly)
- Orbit and scene tests use `@vitest-environment jsdom`
- Scene tests mock `THREE.WebGLRenderer` and polyfill `ResizeObserver`
