# src/renderer/ - Three.js 3D Rendering

## Files

| File | Role |
|---|---|
| `materials.ts` | `CRT_COLORS` palette, `MaterialPool` (normal + dimmed + ghost tiers per `CellState`) |
| `orbit.ts` | Custom `OrbitControls` (spherical coords, pointer/wheel/pinch). `wasDragging` + `consumeDrag()` for click suppression (5px threshold). Public `targetY` field for vertical camera offset. |
| `cube.ts` | `GridCube`: 343 cells (shared `BoxGeometry`/`EdgesGeometry`), O(1) coord-to-mesh lookups, layer helpers |
| `views.ts` | `ViewManager`: CUBE/SLICE/X-RAY modes, depth layer control, board type, opacity transitions |
| `raycaster.ts` | `GridRaycaster`: cell picking via NDC, mesh source filtered by ViewManager |
| `animations.ts` | `AnimationManager`: private material copies per animated cell, keyed by coord. Runs after ViewManager in render loop. Multi-cell animations deduplicate via `processed` Set. |
| `scene.ts` | `SceneManager`: orchestrator (scene, camera, renderer, all sub-systems, render loop, pointer events, overlays, resize, dispose). Responsive FOV + orbit offset in `resize()`. |

## Key Decisions

- **No THREE.OrbitControls**: custom spherical coordinate implementation.
- **Three overlay systems** coexist independently: ghost cells (placement preview), SR overlay (CYAN), friendly fleet overlay (GREEN). Each has separate storage; `updateGrid()` clears all.
- **AnimationManager creates private material copies** per cell, not shared pool materials. Completed one-shots restore to pooled materials via `MaterialPool`.
- **Coordinate system**: `grid[col][row][depth]` → 3D position: `x = col - 3`, `y = row - 3`, `z = depth - 3`. Cell size 0.9, spacing 1.0.
- **Responsive camera**: `resize()` adjusts FOV (60° landscape, 70° portrait) and `orbit.targetY` (-1.4 desktop to shift cube up, +0.8 portrait to center in cropped canvas).

## View Modes

| Mode | Behavior |
|---|---|
| CUBE ALL | All 343 cells visible, normal materials |
| CUBE depth | Selected layer normal, others dimmed (30% opacity) |
| SLICE | Selected visible, ±1 ghost (15% opacity), rest hidden |
| X-RAY | Only non-empty cells visible (filtered by board type) |

## Testing

- Materials, cube, views, animations, raycaster: run **without jsdom** (Three.js geometry works headlessly).
- Orbit, scene: require `// @vitest-environment jsdom`. Scene mocks `THREE.WebGLRenderer` and polyfills `ResizeObserver`.
- Orbit test accounts for `targetY` offset when checking camera distance.
