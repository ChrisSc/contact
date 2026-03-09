# src/styles/ — CSS Design System

## Files

- **`variables.css`** — Design tokens (colors, spacing, fonts) + CSS reset. Single source of truth for theming.
- **`crt.css`** — Scanline overlay, vignette effect, barrel distortion (`#app` border-radius + inset box-shadow). CRT terminal aesthetic.
- **`grid.css`** — Slice grid layout, cell state classes, ghost cell preview, hover effects.
- **`ui.css`** — Screen layouts (title, help, setup, combat, victory, handoff), persistent app footer, buttons, panels, ship roster, depth/axis selectors, board toggle, HUD, fleet status (friendly + enemy with separator), perk store, inventory tray, action slots, credit display, notification banner. Both setup and combat screens use canvas-dominant overlay layout.
- **`effects.css`** — Phosphor bloom CSS utility. Applies `filter: brightness(1.05) blur(0.3px)` + stacked `text-shadow` (10px/20px/40px at decreasing alpha) to `.notification-banner` and `.combat-screen__status` elements. Amber bloom override for `--sunk`, cyan bloom for `--sonar-positive`.

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
- Green phosphor palette: dark backgrounds (`#0a0a0a`), green text/borders (`#00ff41`, `#003b00`). Extended palette: `--crt-green-dark`, `--crt-orange`, `--crt-yellow`, `--crt-amber`.
- **Ship roster decoy entry** uses amber (`--crt-amber`) for distinct visual identity: disabled/hover/selected/placed states via `ship-roster__entry--decoy*` modifiers.
- **Auto deploy button** (`.setup-screen__auto-deploy`): amber-bordered CRT-style button in roster panel for random fleet placement.
- Grid uses CSS Grid layout; responsive sizing via `clamp()` or viewport units.
- **Canvas-dominant overlay layout**: Both setup and combat screens use `position: absolute; inset: 0` for the 3D canvas, with UI elements as absolutely positioned overlays at `z-index: 10`. Top bar uses gradient fade background. Setup and combat share the same visual patterns (mode buttons, depth panel, coordinate display) with screen-specific class prefixes.

## Perk System Styling

- **Perk store** (`.perk-store`): Left-side slide-out panel at `z-index: 20`. Dark bg with CRT border. Offensive items have red border, defensive green border. Cost badges in amber.
- **Inventory tray** (`.inventory-tray`): Bottom-left overlay. Items grouped by perk type with count badges (`x3`). Offensive red-tinted, defensive green-tinted. Selected state uses glow border. Slot badges (PING/ATK/DEF) color-coded: ping=amber, attack=red, defend=green.
- **Action slots** (`.action-slots`): Below board toggle. Three states: available (dim green), used (bright green + checkmark), unavailable (dark/faded).
- **Credit display** (`.combat-screen__credits`): Amber text in top-right bar.
- **Store button** (`.combat-screen__store-btn`): Amber-bordered toggle near view modes.
- **Mute button** (`.combat-screen__mute-btn`): Green-bordered toggle next to store button. `--muted` modifier dims the button (opacity 0.6) when audio is muted.
- **Fleet pip damage** (`.combat-screen__pip--hit`): Red background at 0.8 opacity for per-cell damage on friendly fleet. Distinct from `--sunk` (0.6 opacity, used for all pips when ship fully destroyed).
- **Fleet separator** (`.combat-screen__fleet-separator`): 1px green line at 15% opacity between friendly and enemy fleet sections.
- **Sonar status** (`.combat-screen__status--sonar-positive/negative`): Cyan for contact, dim green for negative.
- **Notification banner** (`.notification-banner`): Fixed centered overlay at `z-index: 30`, pointer-events none. Messages use Press Start 2P font with glow. `--sunk` modifier: amber color/border, larger font. `--credits` modifier: green, smaller font. `--dismiss` modifier triggers fade-out animation. Appear/dismiss via `@keyframes notif-appear`/`notif-dismiss` (scale + opacity).

## Title & Help Screens

- **Title screen** (`.title-screen`): Centered flex column. `__label` (dim green, letter-spaced "CLASSIFIED // SONAR COMMAND"), `__title` (48px Press Start 2P, triple-layer green glow), `__subtitle` (14px dim green), `__version` (10px monospace, 40% opacity — shows `v{version} | {date}`), `__actions` (flex row with START + HELP buttons).
- **Help screen** (`.help-screen`): Scrollable flex column with `overflow-y: auto`. `__header` (24px green glow), `__content` (700px max-width, sections with `__section-title` + `__text` + `__table`). `__return` button at bottom with flex-shrink: 0.
- **Help tables** (`.help-screen__table`): Collapsed borders, Press Start 2P headers (9px), Silkscreen body (13px). Header row has solid green border-bottom, data rows have dim green border-bottom.

## Persistent Footer

- **App footer** (`.app-footer`): `position: fixed; bottom: 0; z-index: 5`. Spans full width. Left: "CLASSIFIED // SONAR COMMAND", right: version/date. 7px Press Start 2P, 40% opacity dim green, `pointer-events: none`. Semi-transparent dark bg.
- **Bottom clearance**: All bottom-positioned UI elements (combat bottom bar, right stack, status, hint, inventory tray, setup footer/hint) are offset 20px above their original positions to clear the persistent footer.

## CRT Effects Layering

- **Z-index convention**: scene=0, app footer=5, UI=10, store=20, banners=30, ability overlays=50, CRT noise=999, CRT scanlines=1000.
- **Phosphor bloom** (`effects.css`): CSS-only brightness/blur filter + multi-layer text-shadow applied to notification banners and combat status text.
- **Barrel distortion** (`crt.css`): `#app` gets `border-radius: 12px` + `box-shadow: inset 0 0 80px rgba(0,0,0,0.3)` for curved CRT screen edges.
- **CRT noise** (`src/ui/effects/crt-noise.ts`): Canvas-based animated grain at z-index 999, tiled 256x256. Pulseable for ability cross-effects.
- **CRT flicker** (`src/ui/flicker.ts`): RAF-driven opacity oscillation on `#app`. Pulseable via `FlickerController.pulse(intensity, durationMs)` for ability cross-effects.
