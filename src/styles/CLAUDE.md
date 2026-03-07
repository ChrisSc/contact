# src/styles/ — CSS Design System

## Files

- **`variables.css`** — Design tokens (colors, spacing, fonts) + CSS reset. Single source of truth for theming.
- **`crt.css`** — Scanline overlay, vignette effect, subtle flicker animation. CRT terminal aesthetic.
- **`grid.css`** — Slice grid layout, cell state classes, ghost cell preview, hover effects.
- **`ui.css`** — Screen layouts, buttons, panels, ship roster, depth/axis selectors.

## Architecture

- **CSS custom properties** (`--var`) are the single source of truth. All colors, spacing, and fonts reference variables.
- No CSS preprocessors — vanilla CSS only.
- CRT effects use `::before`/`::after` pseudo-elements (no extra DOM nodes).

## Style Guide

- **BEM naming**: `.component__element--modifier` (e.g., `.slice-grid__cell--hit`).
- Cell state CSS classes map 1:1 to `CellState` enum values from `src/types/grid.ts`.
- `!important` is used only on `.cell-hover` override — avoid elsewhere.
- Monospace-only fonts: Press Start 2P, Silkscreen, system monospace fallback.

## Patterns

- Animations via `@keyframes` (flicker, scanline scroll, glow pulse).
- Glow effects via `text-shadow` / `box-shadow` with rgba green values.
- Green phosphor palette: dark backgrounds (`#0a0a0a`), green text/borders (`#00ff41`, `#003b00`).
- Grid uses CSS Grid layout; responsive sizing via `clamp()` or viewport units.
