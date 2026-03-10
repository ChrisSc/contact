# src/styles/ — CSS Design System

## Files

| File | Role |
|---|---|
| `variables.css` | Design tokens (colors, spacing, fonts) + CSS reset. Single source of truth for theming. |
| `crt.css` | Scanline overlay, vignette, barrel distortion (`#app` border-radius + inset box-shadow) |
| `grid.css` | Slice grid layout, cell state classes (map 1:1 to `CellState` enum), ghost preview, hover |
| `ui.css` | All screen layouts, buttons, panels, ship roster, depth/axis selectors, perk store, inventory tray, action slots, credit display, notification banner, persistent footer, rank selector, rank bonus notification |
| `effects.css` | Phosphor bloom utility (brightness/blur filter + multi-layer text-shadow) |

## Conventions

- **BEM naming**: `.component__element--modifier`
- **CSS custom properties** are the single source of truth — all colors, spacing, fonts reference `--var`
- **No preprocessors** — vanilla CSS only
- **Monospace-only fonts**: Press Start 2P, Silkscreen, system monospace fallback
- **Green phosphor palette**: dark backgrounds (`#0a0a0a`), green text/borders (`#00ff41`). Extended: `--crt-orange`, `--crt-amber`, `--crt-cyan`

## Z-Index Convention

| Layer | Z-Index |
|---|---|
| 3D scene | 0 |
| App footer | 5 |
| UI overlays | 10 |
| Perk store | 20 |
| Notification banners | 30 |
| Ability overlays | 50 |
| CRT noise | 999 |
| CRT scanlines | 1000 |

## Layout Pattern

Both setup and combat screens use **canvas-dominant overlay layout**: 3D canvas at `position: absolute; inset: 0`, UI elements as absolutely positioned overlays at z-index 10+. Top bar uses gradient fade background.
