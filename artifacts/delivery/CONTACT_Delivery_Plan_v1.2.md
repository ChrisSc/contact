# CONTACT — Project Delivery Plan

**Version 1.4 | March 2026**
**Reference: CONTACT GDD v1.2**

---

## Overview

CONTACT is a browser-based 3D naval combat game — Battleship reimagined in a volumetric 8×8×8 sonar cube. Two players take turns placing submarine fleets and firing torpedoes across 512 cells of three-dimensional space. A credit-based perk store lets players buy offensive and defensive abilities — spend on recon to find targets, save up for area attacks, or invest in defense to slow the opponent. The economy creates a dynamic game arc that moves from blind searching to informed hunting to psychological warfare.

This delivery plan breaks the project into 7 sequential phases, each producing a shippable increment. The arc follows a deliberate layering strategy:

**Phase 1 (Foundation)** stands up the project scaffolding, game state engine, and a fully playable game loop using slice-view grids. At the end of this phase, two players can sit down, place ships (using 8 placement axes — no purely vertical), take turns firing, and play to victory — no 3D rendering, no abilities, no audio. This is the structural proof that the core mechanics work. Critically, Phase 1 also establishes the observability layer: a structured JSONL event logger that instruments every state mutation from day one. Every subsequent phase emits events through this logger, meaning the game is fully auditable before a single line of rendering code exists.

**Phase 2 (3D Rendering)** replaces the flat slice grid with a production Three.js volumetric cube on both the setup and combat screens. All three GDD view modes (Cube, Slice, X-Ray) are implemented with custom orbit controls, raycasting for cell selection, state-driven materials with three opacity tiers, and a ghost cell overlay for 3D placement preview. This is the visual identity moment — the game starts looking like a Cold War sonar terminal.

**Phase 3 (Credit Economy & Perk Store)** layers in the credit system (hit/consecutive hit/sink rewards), perk store UI, player inventory, and all 7 purchasable perks plus the Decoy. The credit engine and store are built first, then perks are delivered in pairs (offensive + defensive counter). This is the mechanical depth layer — the thing that separates CONTACT from a Battleship skin.

**Phase 4 (Audio)** adds the Tone.js synthesized soundscape: action effects, ambient submarine hum, and phase-responsive tension scaling. Audio is deferred to this point because it has zero dependencies on prior phases and can be developed in parallel once the ability system is stable.

**Phase 5 (Visual Polish)** implements the GDD's player feedback systems — screen shake, hit pulses, sunk cascades, ability deployment animations — and finalizes the CRT aesthetic with noise layers, barrel distortion, and phosphor bloom.

**Phase 6 (Mobile & Responsive)** ensures the game plays well on tablets and phones, with touch orbit controls, responsive breakpoints, and mobile-optimized UI layouts. This is deferred because responsive design is most efficient when applied to a stable UI, not a moving target.

**Phase 7 (Integration & Release)** handles Docker containerization, production builds, comprehensive testing against the GDD spec, and release preparation. The game ships as a containerized static site playable on local WiFi.

The phases are sequential by design — each builds on the prior — but Phases 4 and 5 can run in parallel once Phase 3 stabilizes. Total scope: 20 sprints, 57 components, 311 tasks.

---

## Technology Stack

### Design Rationale

A 3,000–5,000 line single file with Three.js rendering, Tone.js audio, an 8-ability state machine, and CRT visual effects is unmaintainable and untestable. The modular approach uses a build tool to produce clean output from readable source, and a Docker container to serve the game on local WiFi.

### Language & Runtime

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript 5.x** | The game state model (dual 8×8×8 grids per player, 8 abilities with cross-referencing interactions, ship health tracking, turn counters with delayed reveals) demands type safety. Silent state corruption from a mistyped property would surface as invisible gameplay bugs. |
| Runtime | **Browser (ES2022+)** | No server-side logic. All game state lives in-memory in the browser. |
| Module System | **ES Modules** | Native browser module support. Vite handles bundling for production. |

### Build Toolchain

| Tool | Role | Rationale |
|---|---|---|
| **Vite 6.x** | Dev server + bundler | Near-zero config. Sub-second HMR during development. `vite build` produces optimized static output. Tree-shakes Three.js and Tone.js imports. |
| **vite-plugin-singlefile** | Optional single-file output | If portable distribution is ever desired, this plugin inlines all assets into one HTML file as a build target — preserving the GDD's original intent as an optional output mode. |
| **TypeScript (via Vite)** | Type checking | Vite transpiles TS natively via esbuild. `tsc --noEmit` for strict type checking in CI or pre-commit. |

### Core Libraries

| Library | Version | Role |
|---|---|---|
| **Three.js** | r128+ | 3D volumetric cube rendering. BoxGeometry + EdgesGeometry per cell. Custom orbit controls (no OrbitControls import per GDD §8.3). Raycaster for cell picking. Imported as npm module; Vite tree-shakes unused exports. |
| **Tone.js** | 14.x | Synthesized audio engine. All sounds generated programmatically (no sample files). Ambient soundscape, action effects, ability deployment sounds. Lazy-initialized on first user gesture to comply with browser autoplay policy. |
| **Google Fonts** | — | Press Start 2P (headings), Silkscreen (body). Loaded via CSS `@import`. Fallback to system monospace if CDN unavailable. |

### No Framework (Vanilla DOM)

The UI layer (menus, HUD, ability tray, handoff screens) is built with vanilla TypeScript and DOM manipulation — no React, no Vue, no Svelte. Rationale:

- The UI is simple: buttons, labels, overlays, and a Three.js canvas. No component tree complexity that justifies a framework.
- Framework overhead (virtual DOM diffing, hydration, reactivity systems) adds bundle size and cognitive load with no corresponding benefit for a game with ~10 UI screens.
- Three.js manages its own render loop; a framework's rendering model would fight it rather than help.
- Keeps the dependency tree minimal: TypeScript + Three.js + Tone.js + Vite. That's it.

### Observability (JSONL Structured Logging)

Every state mutation, player action, ability resolution, and system event is logged as a structured JSONL (JSON Lines) record. This is not an afterthought bolted on in Phase 7 — the logger is scaffolded in Sprint 1.0 and instrumented into every engine function from Sprint 1.1 forward. The principle: if it changes game state, it emits a log event.

**Why observability-first in a client-side game:**

- **Debugging ability interactions.** The 8-ability matrix creates complex interaction chains (Sonar Ping → Radar Jammer inversion → Acoustic Cloak masking). When a player reports "that result looked wrong," the log provides a complete, ordered event trace to reconstruct exactly what happened.
- **Playtesting analytics.** Session logs reveal game balance issues: average turns to first hit, ability usage rates, comeback frequency, which ships survive longest, whether the 3.3% density feels right. This data shapes GDD tuning without requiring the player to fill out a survey.
- **Replay capability.** A complete JSONL log is a deterministic replay file. Feed it back into the engine and you can reconstruct any game state at any turn — useful for debugging, but also a foundation for a future replay viewer.
- **Test forensics.** When a unit test fails, the log shows the exact sequence of state mutations that led to the failure, not just the final assertion mismatch.

**Log record structure:**

Every log entry is a single JSON object on one line, with a consistent envelope:

```jsonl
{"ts":"2026-03-15T20:14:03.412Z","seq":1,"event":"game.start","session":"a1b2c3","data":{}}
{"ts":"2026-03-15T20:14:12.887Z","seq":2,"event":"fleet.place","session":"a1b2c3","data":{"player":0,"ship":"typhoon","origin":"C-2-D4","axis":"col-depth"}}
{"ts":"2026-03-15T20:15:44.201Z","seq":3,"event":"combat.fire","session":"a1b2c3","data":{"player":0,"target":"E-5-D3","result":"miss"}}
{"ts":"2026-03-15T20:16:01.558Z","seq":4,"event":"combat.fire","session":"a1b2c3","data":{"player":1,"target":"C-2-D4","result":"hit","ship":"typhoon","remaining":4}}
{"ts":"2026-03-15T20:18:33.742Z","seq":5,"event":"economy.credit","session":"a1b2c3","data":{"player":1,"amount":1,"reason":"hit","balance":6}}
{"ts":"2026-03-15T20:18:40.109Z","seq":6,"event":"economy.purchase","session":"a1b2c3","data":{"player":1,"perk":"sonar_ping","cost":3,"balance":3}}
{"ts":"2026-03-15T20:18:45.201Z","seq":7,"event":"perk.use","session":"a1b2c3","data":{"player":1,"perk":"sonar_ping","cell":"E-5-D3","result":"positive","jammed":false}}
```

| Field | Type | Description |
|---|---|---|
| `ts` | ISO 8601 string | Timestamp of event emission |
| `seq` | number | Monotonically increasing sequence number (per session) |
| `event` | string | Dot-namespaced event type (see event taxonomy below) |
| `session` | string | Unique session identifier (generated on game start) |
| `data` | object | Event-specific payload (strongly typed per event type) |

**Event taxonomy:**

| Namespace | Events | Emitted By |
|---|---|---|
| `game.*` | `game.start`, `game.phase_change`, `game.turn_start`, `game.turn_end`, `game.victory` | Turn & Session Controller |
| `fleet.*` | `fleet.place`, `fleet.remove`, `fleet.decoy_place`, `fleet.confirm` | Fleet Model |
| `combat.*` | `combat.fire`, `combat.hit`, `combat.miss`, `combat.sunk`, `combat.decoy_hit`, `combat.decoy_retract` | Combat Engine |
| `economy.*` | `economy.credit`, `economy.purchase`, `economy.balance` | Credit Engine |
| `perk.*` | `perk.use`, `perk.effect`, `perk.expire`, `perk.trigger` | Perk System |
| `view.*` | `view.mode_change`, `view.depth_change`, `view.board_toggle` | UI Controllers |
| `audio.*` | `audio.init`, `audio.mute`, `audio.phase_change` | Audio Manager |
| `system.*` | `system.error`, `system.perf` | Global error handler, perf monitors |

**Storage & export:**

Logs accumulate in an in-memory ring buffer (capped at 10,000 events to bound memory). The player can export the full session log as a `.jsonl` file via a debug menu or end-of-game option. During development, logs are also mirrored to `console.debug` with structured formatting for browser DevTools inspection.

### Project Structure

```
contact/
├── src/
│   ├── main.ts                 # Entry point, screen router
│   ├── types/
│   │   ├── grid.ts             # Cell, CellState, Coordinate, Grid types
│   │   ├── fleet.ts            # Ship, ShipPlacement, Decoy types
│   │   ├── abilities.ts        # PerkId, PerkDefinition, PerkInstance, CreditEvent, PlayerInventory types
│   │   └── game.ts             # GameState, PlayerState, TurnAction types
│   ├── engine/
│   │   ├── grid.ts             # Grid creation, cell resolution, coordinate utils
│   │   ├── fleet.ts            # Placement validation, health tracking, sunk detection
│   │   ├── combat.ts           # Fire resolution, hit/miss/sunk logic
│   │   ├── credits.ts          # Credit engine: awards, consecutive tracking, balance
│   │   ├── perks.ts            # Perk store: catalog, purchase, inventory, deployment, effect resolution
│   │   ├── turn.ts             # Turn state machine, action validation, no-pass enforcement
│   │   └── game.ts             # Top-level game controller, phase transitions, win condition
│   ├── observability/
│   │   ├── logger.ts           # JSONL structured logger (ring buffer, console mirror)
│   │   ├── events.ts           # Typed event definitions (game.*, fleet.*, combat.*, etc.)
│   │   ├── session.ts          # Session ID generation, sequence counter
│   │   └── export.ts           # JSONL file export (download trigger)
│   ├── renderer/
│   │   ├── scene.ts            # Three.js scene, camera, renderer setup
│   │   ├── orbit.ts            # Custom drag/scroll/touch orbit controls
│   │   ├── cube.ts             # 512-cell mesh generation, material pool
│   │   ├── materials.ts        # State-driven material definitions and swap logic
│   │   ├── views.ts            # Cube/Slice/X-Ray view mode controllers
│   │   ├── raycaster.ts        # Mouse/touch cell picking
│   │   └── animations.ts       # Hit flash, sunk cascade, ability deployment VFX
│   ├── audio/
│   │   ├── manager.ts          # Tone.js context, master volume, mute
│   │   ├── effects.ts          # Action sounds (fire, hit, miss, sink)
│   │   ├── abilities.ts        # Ability deployment sounds
│   │   └── ambient.ts          # Submarine hum, sonar sweep, phase-scaled tension
│   ├── ui/
│   │   ├── screens/
│   │   │   ├── title.ts        # Title screen
│   │   │   ├── setup.ts        # Ship placement screen
│   │   │   ├── handoff.ts      # Player handoff screen
│   │   │   ├── combat.ts       # Combat screen (HUD, controls, log)
│   │   │   └── victory.ts      # Victory screen
│   │   ├── components/
│   │   │   ├── slice-grid.ts   # 2D depth-layer grid (used in setup + fallback)
│   │   │   ├── depth-selector.ts
│   │   │   ├── ability-tray.ts
│   │   │   ├── hud-bar.ts
│   │   │   └── game-log.ts
│   │   └── crt/
│   │       ├── scanlines.ts    # Scanline overlay
│   │       ├── vignette.ts     # CRT vignette
│   │       ├── flicker.ts      # Subtle flicker effect
│   │       └── noise.ts        # Static noise layer
│   └── styles/
│       ├── variables.css       # CRT color palette, font stacks
│       ├── crt.css             # Scanlines, vignette, barrel distortion
│       ├── grid.css            # Slice grid cell styles
│       └── ui.css              # Buttons, panels, HUD, overlays
├── public/
│   └── index.html              # Shell HTML (minimal, loads main.ts)
├── tests/
│   ├── engine/
│   │   ├── grid.test.ts        # Grid operations, coordinate parsing
│   │   ├── fleet.test.ts       # Placement validation, overlap, boundary
│   │   ├── combat.test.ts      # Fire resolution, sunk detection
│   │   ├── abilities.test.ts   # Earn conditions, interactions, edge cases
│   │   └── turn.test.ts        # Turn flow, no-pass, action validation
│   ├── observability/
│   │   └── logger.test.ts      # Ring buffer, event emission, export format
│   └── setup.ts                # Test utilities, mock state factories
├── Dockerfile                  # nginx:alpine + dist/ copy
├── docker-compose.yml          # Single-command startup, port mapping
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript strict mode config
├── package.json
└── README.md
```

### Containerization & Local Network Play

| Component | Implementation |
|---|---|
| **Dockerfile** | `FROM nginx:alpine` → copy `dist/` to `/usr/share/nginx/html` → expose port 8080. Three lines. |
| **docker-compose.yml** | Maps port 8080, sets restart policy. One-command startup: `docker compose up -d`. |
| **Local WiFi play** | Host machine runs the container. Second player connects via `http://<host-IP>:8080` on any device on the same network. Both devices run independent hot-seat sessions (no shared state — the game is still local two-player per device). |
| **Dev mode** | `npm run dev` launches Vite dev server with HMR on `localhost:5173`. No Docker needed during development. |

### Build Outputs

| Command | Output | Use Case |
|---|---|---|
| `npm run dev` | Vite dev server (HMR) | Development |
| `npm run build` | `dist/` folder (optimized static files) | Production deployment |
| `npm run build:single` | Single HTML file (via vite-plugin-singlefile) | Portable distribution |
| `docker compose up` | Containerized nginx serving `dist/` | Local WiFi hosting |

---

## Phase 1: Foundation

Establish the project scaffolding, core engine, game state model, and minimum playable loop. At the end of this phase, two players can place ships and fire torpedoes on a 2D slice grid with correct hit/miss/sunk resolution. No 3D rendering, no abilities, no audio.

### Sprint 1.0 — Project Scaffolding

**Component: Repository & Build Setup**
- Initialize npm project with `package.json` (name, version, scripts)
- Install and configure Vite with TypeScript support (`vite.config.ts`)
- Configure TypeScript in strict mode (`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`)
- Install Three.js and Tone.js as npm dependencies
- Create `public/index.html` shell with font imports and root mount point
- Create `src/main.ts` entry point with screen router skeleton
- Verify `npm run dev` launches Vite dev server successfully

**Component: Docker Configuration**
- Create `Dockerfile`: `nginx:alpine` base, copy `dist/` to serve root, expose port 8080
- Create `docker-compose.yml`: port mapping (8080:80), restart policy
- Create `npm run build` script and verify `dist/` output
- Verify `docker compose up` serves the game on `http://localhost:8080`
- Verify second device on local WiFi can access `http://<host-IP>:8080`

**Component: Type Definitions**
- Define `CellState` enum: `empty`, `ship`, `decoy`, `hit`, `miss`, `sunk`, `decoy_hit`
- Define `Cell` interface: `{ state: CellState, shipId: string | null }`
- Define `Coordinate` interface: `{ col: number, row: number, depth: number }`
- Define `Grid` type: three-dimensional `Cell` array (8×8×8)
- Define `Ship` interface: `{ id: string, name: string, size: number }`
- Define `ShipPlacement` interface: `{ shipId: string, origin: Coordinate, axis: PlacementAxis, cells: Coordinate[] }`
- Define `PlacementAxis` type: `'col' | 'row' | 'diag+' | 'diag-' | 'col-depth' | 'col-depth-' | 'row-depth' | 'row-depth-'` (8 axes, no purely vertical). Export `PLACEMENT_AXES` constant for cycle order.
- Define `PlayerState` interface: `{ ownGrid: Grid, targetingGrid: Grid, placements: ShipPlacement[], shipHealth: Record<string, number> }`
- Define `GamePhase` enum: `setup_p1`, `setup_p2`, `combat`, `victory`
- Define `GameState` interface: `{ phase: GamePhase, currentPlayer: 0 | 1, turnCount: number, players: [PlayerState, PlayerState], log: GameEvent[] }`
- Define `GameEvent` interface: `{ turn: number, player: 0 | 1, action: string, result: string, coordinate?: Coordinate }`
- Define `LogEvent` interface: `{ ts: string, seq: number, event: string, session: string, data: Record<string, unknown> }`
- Define event type string literals for each namespace: `game.*`, `fleet.*`, `combat.*`, `ability.*`, `view.*`, `audio.*`, `system.*`
- Define typed payload interfaces for each event (e.g., `CombatFirePayload`, `AbilityUsePayload`, `FleetPlacePayload`)

**Component: Test Harness**
- Install Vitest as dev dependency
- Configure Vitest in `vite.config.ts`
- Create `tests/setup.ts` with mock state factories (empty grid, pre-placed fleets, mid-game states)
- Create first passing test: grid creation returns 512 empty cells
- Add `npm run test` script

**Component: Structured Logger**
- Implement `Logger` class in `observability/logger.ts`: accepts typed events, serializes to JSONL
- Implement session ID generator in `observability/session.ts`: random hex string, created on game start
- Implement monotonic sequence counter: increments per `emit()` call within a session
- Implement in-memory ring buffer: capped at 10,000 events, oldest evicted on overflow
- Implement `console.debug` mirror: structured log output in browser DevTools during development (gated by `import.meta.env.DEV`)
- Implement `exportSession()` in `observability/export.ts`: serialize ring buffer to `.jsonl` blob and trigger browser download
- Implement global error handler: catch unhandled errors/rejections → emit `system.error` event with stack trace
- Write unit tests for logger: event serialization, sequence ordering, ring buffer eviction, export format validation

### Sprint 1.1 — Game State Engine

**Component: Grid Data Model**
- Implement `createGrid()`: returns 8×8×8 array of empty cells
- Implement `getCell(grid, coord)`: safe accessor with bounds checking
- Implement `setCell(grid, coord, cell)`: immutable update returning new grid
- Implement coordinate parser: `"C-4-D3"` → `{ col: 2, row: 3, depth: 2 }`
- Implement coordinate formatter: `{ col: 2, row: 3, depth: 2 }` → `"C-4-D3"`
- Write unit tests for grid operations and coordinate round-tripping

**Component: Fleet Model**
- Define ship roster constant: Typhoon (5), Akula (4), Seawolf (3), Virginia (3), Midget Sub (2)
- Implement `AXIS_DELTAS` lookup table: maps each `PlacementAxis` to `[dCol, dRow, dDepth]` per step
- Implement `calculateShipCells(origin, axis, size)`: compute cell coordinates using `AXIS_DELTAS`
- Implement `validatePlacement(grid, ship, origin, axis)`: 8-axis constraint, boundary check, overlap detection (ships and decoy). Diagonal axes must validate both col/row bounds; cross-slice axes must validate depth bounds (including negative depth for `col-depth-`/`row-depth-`).
- Implement `placeShip(grid, ship, origin, axis)`: returns new grid with ship cells marked
- Implement `removeShip(grid, shipId)`: returns new grid with ship cells cleared (for repositioning)
- Implement `placeDecoy(grid, coord)`: validates no overlap, marks cell as decoy
- Implement `getShipHealth(grid, shipId)`: count non-hit cells for a given ship
- Implement `checkSunk(grid, shipId)`: returns true if all cells hit → mark entire ship `sunk`
- Write unit tests for placement validation on all 8 axes, overlap rejection, boundary cases (diag- row underflow, cross-slice depth overflow, col-depth-/row-depth- depth underflow), consistent depth for within-slice axes, sunk detection
- Instrument all fleet mutations: emit `fleet.place`, `fleet.remove`, `fleet.decoy_place`, `fleet.confirm` events via Logger

**Component: Turn & Session Controller**
- Implement `GameController` class: manages `GameState` transitions
- Implement phase transitions: `setup_p1` → `setup_p2` → `combat` → `victory`
- Implement turn alternation: player 0 (ALPHA) ↔ player 1 (BRAVO)
- Implement `fireTorpedo(state, coord)`: resolve cell against opponent's own grid, update both grids, return result
- Implement win condition check: all 5 opponent ships sunk → transition to `victory`
- Implement action log: append `GameEvent` on every action
- Instrument all state transitions: emit `game.start`, `game.phase_change`, `game.turn_start`, `game.turn_end`, `game.victory` events via Logger
- Instrument fire resolution: emit `combat.fire` with target coordinate, result (hit/miss/sunk), ship ID and remaining health on hit
- Write unit tests for full game loop: setup → fire → hit → sunk → victory
- Write unit tests verifying log output: correct event sequence, payload completeness, no missing events

### Sprint 1.2 — Slice View & Setup UI

**Component: CRT Visual Foundation**
- Import Press Start 2P and Silkscreen via CSS `@import` from Google Fonts
- Define CSS custom properties in `variables.css`: `--crt-green`, `--crt-green-dim`, `--crt-green-dark`, `--crt-red`, `--crt-orange`, `--crt-yellow`, `--crt-bg`
- Implement scanline overlay in `crt.css` (CSS `repeating-linear-gradient`)
- Implement CRT vignette in `crt.css` (CSS `radial-gradient`)
- Implement subtle flicker module (`flicker.ts`): randomized opacity on `requestAnimationFrame`

**Component: Slice Grid Renderer**
- Implement `SliceGrid` class: renders single depth layer as 8×8 DOM grid
- Render column headers (A–H) and row labels (1–8)
- Implement cell state visual mapping per GDD §2.3 (wireframe, solid, dot, ×, pulse, blink)
- Implement hover state: highlight cell, update coordinate display
- Implement click handler: emit cell coordinate on click

**Component: Ship Placement Screen**
- Render depth layer selector (ALL + D1–D8 buttons)
- Render 8-axis selector (COL / ROW / DIAG↗ / DIAG↘ / COL+D / COL-D / ROW+D / ROW-D) with R key cycling
- Render ship roster with placed/unplaced status indicators
- Implement placement preview: ghost cells showing proposed ship position on hover
- Implement placement confirmation: click to commit, call `placeShip()`, update grid
- Implement decoy placement step after all ships placed
- Implement "Confirm Deployment" action to finalize setup
- Implement free-order placement: allow ships to be placed in any sequence (no enforced order per GDD §3.2)
- Implement ship removal/repositioning: allow clicking a placed ship to remove it and re-place before confirmation
- Implement undo/reset: allow clearing all placements to start over
- **Note:** Initially built with 2D SliceGrid; upgraded to full 3D SceneManager in Sprint 2.2 (see below)

**Component: Handoff Screen**
- Render neutral CRT screen with player designation (ALPHA/BRAVO)
- Implement "Ready" confirmation button
- Ensure no board data is visible during handoff

### Sprint 1.3 — Combat Loop (Slice Only)

**Component: Combat Screen Layout**
- Render top bar: player designation, phase label, turn counter
- Render coordinate display: live hover target in Column-Row-Depth format
- Render depth layer selector for slice navigation (ALL + D1–D8 per GDD §7.2)
- Render board toggle: targeting grid vs. own fleet view
- Implement targeting grid: hide ship positions, show hits/misses/sunk
- Implement own fleet view: show ship positions, show incoming damage
- Instrument UI state changes: emit `view.mode_change`, `view.depth_change`, `view.board_toggle` events via Logger

**Component: Fire Action**
- Implement cell click on targeting grid → call `fireTorpedo()`, render result
- Prevent firing on already-resolved cells
- Display immediate result feedback (inline result badge: HIT / MISS / SUNK)
- Trigger sunk detection → mark all ship cells orange on both grids
- Trigger win condition check after each fire

**Component: HUD & Game Log**
- Render HUD bar: depth layer, view mode, board type, turn count, cells visible, shots fired, hits scored (per GDD §7.2)
- Render enemy fleet status: per-ship health bars with sunk strikethrough
- Render scrollable game log (last N events)
- Implement turn-end action: "End Turn" button → handoff to next player
- Implement no-pass enforcement: disable "End Turn" until player has performed an action (fire or ability per GDD §4.2)

**Component: Victory Screen**
- Render winner designation (ALPHA/BRAVO)
- Display turn count at resolution
- Display session summary stats: total shots fired, hit rate, abilities used, turns elapsed
- Implement "Export Session Log" button: triggers `.jsonl` file download via `exportSession()`
- Implement "New Engagement" restart action

---

## Phase 2: Three.js 3D Rendering

Replace the flat slice grid with production Three.js rendering. Implement all three GDD view modes. Both the setup and combat screens use a canvas-dominant overlay layout with the 3D sonar cube as the primary interface. At the end of this phase, the cube is rotatable, zoomable, all view modes function per spec, and ship placement uses 3D ghost cell preview.

### Sprint 2.1 — Three.js Scene Setup

**Component: Scene Infrastructure**
- Initialize Three.js scene, camera (perspective), and WebGL renderer in `scene.ts`
- Configure renderer for CRT-compatible output (dark background, green-tinted fog)
- Implement responsive canvas sizing (fill viewport section, handle window resize)
- Implement render loop with `requestAnimationFrame`
- Implement cleanup/disposal on screen transition

**Component: Custom Orbit Controls**
- Implement mouse drag rotation in `orbit.ts` (no OrbitControls import per GDD §8.3)
- Implement scroll-to-zoom with min/max distance constraints
- Implement touch drag rotation for mobile
- Implement touch pinch-to-zoom for mobile
- Implement rotation damping for smooth feel

**Component: Grid Mesh Generation**
- Generate 512 `BoxGeometry` meshes (one per cell) with `EdgesGeometry` wireframe overlay in `cube.ts`
- Position meshes in 8×8×8 volumetric layout with consistent spacing
- Implement `MaterialPool` in `materials.ts`: three tiers per cell state — normal, dimmed (30% opacity), ghost (15% opacity). `setDimOpacity(t)` / `setGhostOpacity(t)` for animated transitions. Hover material set. Dispose pattern for all materials.
- Implement `GridCube` with shared geometry, O(1) coord↔mesh lookups, layer helpers (`getCellMeshesAtDepth`, `setLayerVisible`)
- Implement material swap on cell state change (no mesh recreation)

### Sprint 2.2 — View Modes

**Component: Cube View**
- Render all 512 cells with wireframe
- Implement depth layer selection: selected layer full opacity, others dimmed (per GDD §2.2)
- Implement "ALL" mode: all layers visible at uniform opacity
- Implement smooth opacity transitions on layer change

**Component: Slice View (3D-backed)**
- Isolate selected depth layer, hide all others
- Render ghosted outlines of adjacent layers (±1) for peripheral awareness
- Implement Raycaster for mouse/touch cell selection on isolated layer
- Ensure coordinate feedback matches slice cell under cursor

**Component: X-Ray View**
- Hide all empty cells
- On own board: show only cells containing ship segments
- On targeting board: show only action cells (hits, misses, sunk)
- Implement smooth show/hide transitions

**Component: View Mode Integration**
- Wire view mode selector (CUBE / SLICE / X-RAY) to renderer in `views.ts`
- Ensure Raycaster cell picking works correctly in all three modes
- Ensure depth layer selector interacts correctly with each view mode

**Component: Ghost Cell Overlay**
- Implement `SceneManager.setGhostCells(coords, valid)`: temporarily swap cell materials to green (valid) or red (invalid) for placement preview
- Implement `SceneManager.clearGhostCells()`: restore original materials
- Ghost materials (valid/invalid fill + edge) created once in constructor, disposed on cleanup

**Component: Combat Screen 3D Integration**
- Rewrite combat screen to canvas-dominant overlay layout: full-screen 3D canvas with UI as absolutely positioned overlays
- Wire SceneManager: view mode selector (CUBE/SLICE/X-RAY), depth panel (ALL+D1-D8), board toggle (targeting/own), coordinate display via raycaster hover, fire torpedo via raycaster cell click
- HUD stats bar: DEPTH, VISIBLE cells, SHOTS, HITS, SUNK count, MODE
- Enemy fleet panel with health pips, end turn button, controls hint
- Mock SceneManager in tests (WebGL unavailable in jsdom)

**Component: Setup Screen 3D Upgrade**
- Rewrite setup screen from 2D SliceGrid to canvas-dominant overlay layout matching combat screen pattern
- Wire SceneManager: view mode selector, depth panel, coordinate display via raycaster hover, ship/decoy placement via raycaster cell click
- 8-axis selector overlay (COL/ROW/DIAG↗/DIAG↘/COL+D/COL-D/ROW+D/ROW-D) with R key cycling
- Ship roster as right-side overlay with selection and removal callbacks
- Ghost cell preview via `SceneManager.setGhostCells()` — green for valid, red for invalid placement
- Board type fixed to `'own'` (always shows own grid with ships visible)
- Footer overlay: RESET ALL and CONFIRM DEPLOYMENT buttons
- Mock SceneManager in tests (same pattern as combat screen tests)

### Sprint 2.3 — Cell State Visuals (3D)

**Component: State-Driven Materials**
- Empty: dim green wireframe (`EdgesGeometry`, low-alpha `LineBasicMaterial`)
- Ship (own board): solid green block (`MeshBasicMaterial`, green, moderate alpha)
- Hit: red emissive material with pulse animation (sinusoidal intensity)
- Miss: dim green dot (small inner mesh or sprite)
- Sunk: orange emissive material (static glow)
- Decoy: yellow blinking material (toggling alpha on interval)
- Hover: brighter wireframe + subtle fill

**Component: Transition Animations**
- Implement hit flash: brief full-brightness red, then settle to pulse
- Implement sunk cascade: all cells of ship transition red→orange in sequence
- Implement miss placement: fade-in dot marker

---

## Phase 3: Credit Economy & Perk Store

Implement the credit economy, perk store, player inventory, and all 7 purchasable perks per GDD §5. The credit engine and store UI are built first (Sprint 3.1), then perks are delivered in pairs — offensive + defensive counter (Sprints 3.2–3.4). The Decoy is already implemented (placed during setup); this phase wires it into the perk interaction system.

### Sprint 3.1 — Credit Engine, Store UI & Sonar Ping

**Component: Credit Engine**
- Define credit types in `types/abilities.ts`: `CreditEvent`, `PerkId`, `PerkDefinition`, `PerkInstance`, `PlayerInventory`
- Implement credit tracker in `engine/credits.ts`: starting balance (5), credit awards (hit=1, consecutive hit=5, sink=10)
- Implement consecutive hit detection: track per-player whether previous turn was a hit
- Integrate credit awards into `GameController.fireTorpedo()`: award credits on hit/sink, check consecutive
- Implement perk store logic in `engine/perks.ts`: purchase validation (sufficient credits), deduct credits, add to inventory
- Define perk catalog with pricing: Sonar Ping (3), Recon Drone (10), Depth Charge (25), G-SONAR (18), Radar Jammer (5), Silent Running (10), Acoustic Cloak (6)
- Instrument all economy events: emit `economy.credit`, `economy.purchase`, `economy.balance` events via Logger
- Write unit tests for credit awards, consecutive hit detection, purchase flow, insufficient funds

**Component: Store & Inventory UI**
- Render credit display in combat screen top bar: current balance, prominently visible
- Render perk store panel in `ui/components/perk-store.ts`: browse perks, show name/cost/description, purchase button
- Grey out perks with insufficient credits
- Render inventory tray in `ui/components/inventory-tray.ts`: purchased perks available for deployment
- Visual distinction: offensive perks vs. defensive perks
- Implement deploy-from-inventory flow: click to select, confirm to deploy
- Integrate store/inventory into combat screen turn flow

**Component: Turn Action Slots**
- Refactor combat turn to support three action slots: Ping (optional) → Attack (required) → Defend (optional)
- Implement action slot tracking in `engine/game.ts`: `pingUsed`, `attackUsed`, `defendUsed` per turn
- Update End Turn validation: require attack action taken
- Update combat screen UI to reflect available action slots

**Component: Sonar Ping (Offensive — Ping Slot)**
- Implement cell selector: player picks one cell to ping
- Implement ping logic: binary yes/no — does a ship segment exist at this cell?
- Check for active Radar Jammer on opponent → invert result if jammed
- Check for active Acoustic Cloak on opponent → return negative if cloaked
- Implement result display: sonar sweep animation, then YES/NO indicator on cell
- Deduct from inventory on use; does NOT consume attack action
- Write unit tests for ping logic, jammer interaction, cloak interaction
- Emit `perk.use` event with cell, raw result, jammed/cloaked flags, displayed result

### Sprint 3.2 — Pair 1: Reconnaissance (Recon Drone + Radar Jammer)

**Component: Recon Drone (Offensive — Attack Slot)**
- Implement target selector UI: player picks center cell for 3×3×3 scan volume (up to 27 cells, clipped at grid bounds)
- Render scan area preview (3×3×3 ghost cells highlighted) before confirmation
- Implement scan logic: reveal which cells in the 3×3×3 volume contain ship segments (not identity/orientation)
- Handle decoy within scan area: decoy appears as occupied cell (poisons intel)
- Check for active Radar Jammer → return false scan results if jammed
- Check for active Acoustic Cloak → return all-negative for cloaked cells
- Render scan results on targeting grid (CellState.DronePositive / DroneNegative)
- Deduct from inventory; consumes attack action
- Write unit tests for scan logic, decoy poisoning, jammer interaction, edge-of-grid scan areas

**Component: Radar Jammer (Defensive — Defend Slot)**
- Implement activation: deploy from inventory during defend slot
- Implement interaction: when opponent uses Sonar Ping, invert result (yes↔no); when opponent uses Recon Drone, return all-false scan results (GDD §5.4)
- Implement visual feedback: static burst animation on activation
- Jammer is consumed on trigger (not on deploy — persists until triggered or end of game)
- Write unit tests for jammer trigger on ping, jammer trigger on drone, jammer expiry

### Sprint 3.3 — Pair 2: Heavy Ordnance (Depth Charge + Silent Running)

**Component: Depth Charge (Offensive — Attack Slot)**
- Implement target selector UI: player picks center cell for 3×3×3 strike volume (27 cells)
- Render strike volume preview (27 cells highlighted) before confirmation
- Implement strike logic: resolve hit/miss on every occupied cell in the volume
- Handle multiple hits in a single action (partial ship damage, possible multi-sink)
- Render volume strike animation: expanding shockwave from center
- Deduct from inventory; consumes attack action
- Award credits for each hit/sink within the strike
- Write unit tests for volume strike, multi-hit, multi-sink, credit awards

**Component: Silent Running (Defensive — Defend Slot)**
- Implement activation: deploy from inventory, select one own ship to hide
- Implement ship masking: selected ship invisible to Sonar Ping, Recon Drone, and G-SONAR for 2 opponent turns
- Implement turn countdown: cloak expires after 2 opponent turns
- Torpedoes still hit normally — Silent Running only affects recon perks
- Implement visual state: ship ghost effect on own grid during active period
- Deduct from inventory on deploy
- Emit `perk.effect` on activation (ship, turns remaining) and `perk.expire` on reveal
- Write unit tests for recon masking, torpedo pass-through, turn countdown

### Sprint 3.4 — Pair 3: Global Intelligence (G-SONAR + Acoustic Cloak)

**Component: G-SONAR (Offensive — Attack Slot)**
- Implement depth selector UI: player picks one depth layer to scan (64 cells)
- Implement scan logic: reveal which cells at the selected depth contain ship segments
- Check for active Acoustic Cloak → return all-negative for cloaked cells
- Render scan results on targeting grid at selected depth
- Deduct from inventory; consumes attack action
- Write unit tests for scan logic, cloak interaction, sunk-ship exclusion from results

**Component: Acoustic Cloak (Defensive — Defend Slot)**
- Implement activation: deploy from inventory, masks all own ship segments
- Implement interaction: any G-SONAR, Sonar Ping, or Recon Drone returns negative during cloak window
- Implement turn countdown: cloak expires after 2 opponent turns
- Implement visual feedback: brief fade-to-silence effect on activation
- Deduct from inventory on deploy
- Write unit tests for cloak vs. each recon type, turn countdown, stacking with other defensives

---

## Phase 4: Audio Engine

Implement full Tone.js audio system per GDD §7.4. All audio synthesized programmatically — no sample files.

### Sprint 4.1 — Audio Framework & Core Effects

**Component: Audio Manager**
- Initialize Tone.js context with user-gesture activation (browser autoplay policy) in `audio/manager.ts`
- Implement master volume control with mute toggle
- Implement audio state: track game phase for dynamic layering
- Implement audio enable/disable UI control
- Instrument audio lifecycle: emit `audio.init`, `audio.mute`, `audio.phase_change` events via Logger

**Component: Action Sound Effects**
- Synthesize torpedo fire sound (percussive transient + low sweep) in `audio/effects.ts`
- Synthesize hit sound (sharp metallic impact with distortion)
- Synthesize miss sound (subtle sonar ping, soft decay)
- Synthesize ship sunk sound (low rumble + cascading tones)
- Map each action type to its sound trigger

**Component: Ambient Soundscape**
- Synthesize submarine hum (low-frequency oscillator, continuous) in `audio/ambient.ts`
- Synthesize periodic sonar sweep (timed ping with reverb tail)
- Implement phase-responsive layering: add tension layers as game progresses (more frequent pings, deeper hum, subtle noise floor increase)

### Sprint 4.2 — Perk Audio & Phase Scaling

**Component: Perk Sound Effects**
- Synthesize Sonar Ping deploy sound (focused sweep tone) in `audio/abilities.ts`
- Synthesize Recon Drone scan sound (scanning wash, left-to-right pan)
- Synthesize Radar Jammer activation (static burst / white noise crack)
- Synthesize Silent Running activation (fade-to-silence, low pass filter sweep)
- Synthesize Depth Charge sound (deep detonation with expanding reverb)
- Synthesize G-SONAR sound (broad spectrum sweep across full layer)
- Synthesize Acoustic Cloak sound (reverse reverb / absorption effect)
- Synthesize purchase sound (credit deduction confirmation tone)
- Synthesize insufficient-funds rejection sound (error buzz)

**Component: Dynamic Audio Scaling**
- Implement game phase detection (early/mid/escalation/endgame per GDD §6.1)
- Scale ambient intensity per phase: sparser in early, denser and more urgent in endgame
- Scale sonar ping frequency: slower early, faster late
- Add low-frequency tension drone in endgame

---

## Phase 5: Visual Polish & Feedback

Implement all GDD §7.3 player feedback systems and finalize the CRT aesthetic.

### Sprint 5.1 — Hit/Miss/Sunk Feedback

**Component: Hit Feedback**
- Implement red flash on hit cell (brief full-screen tint or cell flash) in `renderer/animations.ts`
- Implement screen shake (camera/viewport jitter, 200–300ms duration)
- Implement cell pulse glow animation (sinusoidal emissive intensity, persistent)

**Component: Miss Feedback**
- Implement dim marker placement animation (fade-in)
- Coordinate with miss audio trigger

**Component: Ship Sunk Feedback**
- Implement red→orange transition cascade across all ship cells (staggered timing)
- Implement notification banner: "VESSEL DESTROYED: [SHIP NAME]"
- Implement ability unlock notification: "[ABILITY NAME] AVAILABLE" banner if applicable

### Sprint 5.2 — Ability Feedback & CRT Effects

**Component: Ability Deployment Animations**
- Sonar Ping: full-screen sonar sweep (rotating radial wipe, green)
- Recon Drone: scan wash effect (horizontal sweep revealing scan results)
- Radar Jammer: static burst (screen-wide noise flash, brief)
- Silent Running: fade-to-silence (darken screen edges, audio dip)
- Depth Charge: column detonation sequence (sequential red flashes top→bottom)
- G-SONAR: broad sonar wash (expanding ring effect)
- Acoustic Cloak: stealth activation (brief screen dim + particle absorption)

**Component: CRT Shader Refinements**
- Implement static noise layer (animated grain overlay) in `ui/crt/noise.ts`
- Implement CRT barrel distortion (subtle CSS transform or shader)
- Implement phosphor bloom on bright elements (CSS glow + blur layers)
- Implement screen flicker variation (randomized intensity tied to game events)

---

## Phase 6: Mobile & Responsive Design

Ensure the game is fully playable on tablets and phones per GDD §1.5 responsive requirement.

### Sprint 6.1 — Responsive Layout

**Component: Breakpoint System**
- Define breakpoints: desktop (>1024px), tablet (768–1024px), mobile (<768px)
- Implement responsive viewport sizing for Three.js canvas
- Implement collapsible/stacked layout for combat screen panels on mobile
- Scale grid cell sizes per breakpoint
- Ensure all text remains legible at each breakpoint

**Component: Mobile Navigation**
- Implement swipe-based depth layer navigation
- Implement tap-to-select cell (with touch-friendly hit targets ≥44px)
- Implement long-press for cell info tooltip
- Adjust view mode and board toggle buttons for touch (larger, spaced)

### Sprint 6.2 — Touch Controls for 3D

**Component: Touch Orbit Controls**
- Implement single-finger drag for cube rotation
- Implement two-finger pinch for zoom
- Implement touch dead zone to prevent accidental rotation during cell selection
- Test and tune rotation sensitivity for mobile

**Component: Mobile UI Adjustments**
- Reposition ability tray for thumb reach (bottom of screen)
- Implement expandable/collapsible game log
- Implement compact HUD mode for small screens
- Test handoff screen usability on mobile (adequate tap target for Ready button)

---

## Phase 7: Integration, Testing & Release

Production build, containerized deployment, comprehensive testing, and release preparation.

### Sprint 7.1 — Build & Containerization

**Component: Production Build**
- Configure Vite production build: minification, tree-shaking, asset hashing
- Configure `vite-plugin-singlefile` as optional build target (`npm run build:single`)
- Verify `dist/` output loads correctly in browser (no console errors, all assets resolve)
- Verify single-file output is functional (portable distribution option)
- Profile bundle size; target under 500KB gzipped (excluding font CDN)

**Component: Docker Deployment**
- Finalize `Dockerfile`: `nginx:alpine`, copy `dist/`, expose 8080, configure MIME types
- Finalize `docker-compose.yml`: port mapping, restart policy, container naming
- Write `README.md` deployment section: `docker compose up -d` instructions
- Test local WiFi access from second device (phone, tablet, laptop)
- Test that game state is fully independent per browser tab (no shared state leaks)

**Component: Performance Optimization**
- Profile Three.js render loop: target 60fps on mid-range hardware
- Implement object pooling for cell meshes (avoid GC pressure)
- Implement frustum culling for off-screen cells
- Optimize material count: share materials across cells in same state
- Lazy-initialize Tone.js context (only on first user interaction)
- Implement periodic `system.perf` event emission: frame rate, render time, memory usage (sampled every 30s, gated by dev mode)

### Sprint 7.2 — Testing

**Component: Unit Tests (Engine)**
- Test grid operations: create, get, set, coordinate round-trip
- Test fleet placement: all 5 ships on each of 8 axes (col, row, diag+, diag-, col-depth, col-depth-, row-depth, row-depth-), boundary cases (diag- row underflow, cross-slice depth overflow, negative depth underflow), overlap rejection
- Test decoy: placement, hit → false confirmation, next-turn retraction, drone interaction
- Test all 8 abilities: earn conditions, activation, effect resolution, consumption
- Test ability interactions: Sonar Ping vs. Radar Jammer, Recon Drone vs. Decoy, G-SONAR vs. Acoustic Cloak, Silent Running delayed reveal
- Test win condition: verify each possible last-ship-sunk scenario
- Test edge cases: firing all 512 cells, abilities used on same turn as sink, simultaneous unlock conditions
- Test logger: ring buffer eviction at 10,000 events, sequence monotonicity, JSONL export format validity
- Test event completeness: play a full game to victory and verify no state mutation occurs without a corresponding log event

**Component: Integration Tests (UI + Engine)**
- Test full game loop: setup → combat → victory for both players
- Test view mode switching mid-combat: state preservation
- Test handoff screen: no data leakage between turns
- Test no-pass enforcement: End Turn disabled until action taken

**Component: Cross-Browser & Device Testing**
- Test on Chrome, Firefox, Safari, Edge (desktop)
- Test on iOS Safari, Android Chrome (mobile)
- Test touch controls on iPad, Android tablet
- Test Docker-served build on local WiFi from multiple devices
- Test font fallback: graceful degradation if Google Fonts CDN unavailable

### Sprint 7.3 — Release Preparation

**Component: Final Audit**
- Audit all visual states against GDD §2.3 visual language table
- Audit all ability behaviors against GDD §5.2 ability matrix
- Audit game arc pacing against GDD §6.1 phase progression
- Verify classification markings and branding per GDD §7.2 (title bar, footer)

**Component: Documentation**
- Write in-game help/rules screen (accessible from title screen)
- Write keyboard shortcut reference (if applicable)
- Write `README.md`: project overview, tech stack, dev setup, build commands
- Document JSONL log format: event taxonomy, payload schemas, export instructions, and example `jq` queries for session analysis
- Add version number and build date to footer
- Create CHANGELOG for v1.0 release

---

## Summary

| Phase | Sprints | Components | Tasks |
|---|---|---|---|
| 1 — Foundation | 4 | 16 | 108 |
| 2 — Three.js 3D Rendering | 3 | 9 | 39 |
| 3 — Ability System | 4 | 10 | 60 |
| 4 — Audio Engine | 2 | 5 | 24 |
| 5 — Visual Polish & Feedback | 2 | 5 | 19 |
| 6 — Mobile & Responsive | 2 | 4 | 17 |
| 7 — Integration & Release | 3 | 8 | 44 |
| **Total** | **20** | **57** | **311** |
