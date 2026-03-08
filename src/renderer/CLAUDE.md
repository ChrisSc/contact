# src/renderer/ — Three.js 3D Rendering

## Files

- **`materials.ts`** — `CRT_COLORS` palette (includes CYAN for recon states), `MaterialSet`/`MaterialDef` interfaces, `MATERIAL_DEFS` lookup, `MaterialPool` class (normal + dimmed + ghost material pools per `CellState`)
- **`orbit.ts`** — Custom `OrbitControls` (spherical coords, pointer/wheel/pinch events, damping). Exports pure helpers: `sphericalToCartesian`, `clampPhi`, `clampDistance`. Public `dragging` getter.
- **`cube.ts`** — `GridCube` class (512 `BoxGeometry` + `EdgesGeometry` meshes in 8x8x8 layout), `coordToPosition` helper, layer helpers (`getCellMeshesAtDepth`, `getAllCellMeshes`, `setLayerVisible`)
- **`views.ts`** — `ViewManager` class: three view modes (CUBE, SLICE, X-RAY), depth layer control, board type, smooth opacity transitions, interactable mesh filtering
- **`raycaster.ts`** — `GridRaycaster` class: wraps `THREE.Raycaster` for cell picking via NDC normalization, configurable mesh source
- **`animations.ts`** — `AnimationManager` class: combat animation effects (hit flash, sunk cascade, miss fade). Private material copies per animated cell, keyed by coord. Runs after ViewManager in render loop.
- **`scene.ts`** — `SceneManager` orchestrator (scene, camera, renderer, orbit, cube, views, animations, raycaster, render loop with delta time, pointer events, ghost cell overlay, resize, dispose)

## Architecture

- **No OrbitControls from Three.js** — custom implementation using spherical coordinates and pointer events.
- **MaterialPool** creates three tiers of materials: normal, dimmed (30% opacity), ghost (15% opacity). Per-tier opacity can be animated via `setDimOpacity(t)` / `setGhostOpacity(t)`. Exports `MATERIAL_DEFS` for reading base opacity values.
- **AnimationManager** creates **private material copies** per animated cell (not shared pool materials) so opacity/color can be modulated independently. Keyed by coordKey — new animation on same cell cancels previous and disposes its materials. `update(dt)` runs after `ViewManager.update(dt)` so animation materials overwrite view materials. Completed one-shot animations restore cells to pooled materials via `MaterialPool`.
- **GridCube** uses shared `BoxGeometry` and `EdgesGeometry` for all 512 cells. Two Maps for O(1) lookups: coord→CellMesh and mesh→Coordinate.
- **ViewManager** controls cell visibility and material assignment per view mode:
  - CUBE ALL: all visible, normal materials
  - CUBE depth: selected layer normal, others dimmed
  - SLICE: selected visible+normal, ±1 visible+ghost, rest hidden
  - X-RAY: only non-empty cells visible (filtered by board type)
- **GridRaycaster** picks cells via `THREE.Raycaster`, mesh source filtered by ViewManager.
- **SceneManager** is the entry point for both setup and combat screens. Call `updateGrid(grid)` to push state; `setViewMode()`, `setDepth()`, `setBoardType()` to control view. Pointer events for cell click/hover with orbit drag suppression. Ghost cell overlay via `setGhostCells(coords, valid)` / `clearGhostCells()` for placement preview. Combat animations via `playHitAnimation(coord)`, `playSunkAnimation(coords)`, `playMissAnimation(coord)`.
- **ResizeObserver** handles responsive canvas sizing. `devicePixelRatio` capped at 2.

## Ghost Cell Overlay

- `setGhostCells(coords, valid)` temporarily swaps materials on specified cells to green (valid) or red (invalid)
- `clearGhostCells()` restores original materials
- Ghost materials (valid/invalid fill + edge) created once in constructor, disposed on cleanup
- Used by setup screen for ship/decoy placement preview in 3D

## Combat Animations

| Animation | Trigger | Duration | Behavior |
|-----------|---------|----------|----------|
| **Hit Flash** | `playHitFlash(coord)` | Infinite (looping) | 200ms full red opacity, then sinusoidal pulse 0.5–1.0, period 1.5s |
| **Sunk Cascade** | `playSunkCascade(coords)` | `125ms × (n-1) + 300ms` | Sequential RED→ORANGE color lerp per cell, 125ms stagger. Completes → restores pooled Sunk materials |
| **Miss Fade** | `playMissFade(coord)` | 300ms | Linear fade-in from 0 to target opacity (0.15 fill, 0.2 edge). Completes → restores pooled Miss materials |

- Duplicate animation on same cell cancels previous and disposes its materials.
- Combat screen wires animations in `handleFire()`: hit→`playHitAnimation`, sunk→`playSunkAnimation` (using ship cells from opponent state), miss→`playMissAnimation`.
- Logger emits `view.change` with `animation_start`/`animation_complete` actions.

## Recon State Colors

- `DronePositive` and `SonarPositive` use `CRT_COLORS.CYAN` (0x33ffcc) to visually differentiate from standard green ship/empty states.

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
