# tests/renderer/ - Renderer Tests

## Files

| File | Tests |
|---|---|
| `materials.test.ts` | MaterialSet per CellState, pool reuse, CYAN for recon states, dim/ghost opacity, dispose |
| `orbit.test.ts` | Spherical math, phi/distance clamping, camera positioning, reset, dispose |
| `cube.test.ts` | 343 mesh creation, coord↔mesh lookups, material swap, layer helpers, dispose |
| `views.test.ts` | CUBE/SLICE/X-RAY visibility, depth selection, material tiers, board filtering |
| `raycaster.test.ts` | NDC normalization, intersection handling, mesh source filtering |
| `animations.test.ts` | Hit flash, sunk cascade, miss fade, sonar sweep, drone scan: timing, material lifecycle, cancel/restore |
| `scene.test.ts` | Sub-component wiring, render loop, delegation, dispose |
| `visual-audit.test.ts` | GDD §2.3 audit: all 11 CellState materials, CRT palette, opacity ordering, X-RAY filtering |

## Environment

- Materials, cube, views, animations, raycaster: **no jsdom needed**
- Orbit, scene: `// @vitest-environment jsdom` + mock `THREE.WebGLRenderer` + polyfill `ResizeObserver`
