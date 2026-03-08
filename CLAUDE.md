# CLAUDE.md — CONTACT: 3D Naval Combat

## Project Overview

CONTACT is a browser-based 3D Battleship variant. Two players command submarine fleets hidden in an 8x8x8 volumetric grid (512 cells), firing torpedoes and deploying earned abilities to locate and destroy enemy vessels. Hot-seat local multiplayer, zero server dependencies.

**Authoritative source:** `artifacts/design/CONTACT_GDD_v1.0.md` is the game design document (GDD). All gameplay, UI, and technical decisions flow from this document. If this CLAUDE.md conflicts with the GDD, the GDD wins.

**Delivery plan:** `artifacts/delivery/CONTACT_Delivery_Plan_v1.2.md` defines the phased build order (7 phases, 20 sprints, 311 tasks). Follow this plan sequentially.

**Prototype:** `protoype/contact-prototype.jsx` is a one-shot prototype built from the GDD.  This should be used to guide motif, look and feel, and provides ideas.

---

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript 5.x | Type safety for complex game state (dual 8x8x8 grids, 8 abilities, delayed reveals) |
| **Runtime** | Browser (ES2022+) | No server-side logic. All state in-memory. |
| **Modules** | ES Modules | Native browser support. Vite handles bundling. |
| **Build** | Vite 6.x | Sub-second HMR, `vite build` for optimized output, tree-shakes Three.js/Tone.js |
| **3D Rendering** | Three.js (r128+ via npm) | Volumetric cube, raycasting, custom orbit controls |
| **Audio** | Tone.js 14.x (via npm) | Synthesized SFX and ambient audio, no sample files |
| **Fonts** | Press Start 2P + Silkscreen | Google Fonts CDN, fallback to system monospace |
| **Single-file** | vite-plugin-singlefile | Optional build target for portable distribution |
| **Container** | Docker (nginx:alpine) | Local WiFi hosting via `docker compose up` |
| **Testing** | Vitest | Unit + integration tests, co-located with Vite config |
| **UI** | Vanilla TypeScript + DOM | No framework. Three.js manages its own render loop. |

---

## Observability (First-Class)

Structured JSONL logging is instrumented from Sprint 1.0 — not bolted on later. Every state mutation emits a log event through the Logger. This enables debugging ability interactions, playtesting analytics, replay capability, and test forensics.

- Ring buffer capped at 10,000 events
- Console mirror in dev mode (`import.meta.env.DEV`)
- Export as `.jsonl` file via debug menu or end-of-game option
- Event taxonomy: `game.*`, `fleet.*`, `combat.*`, `ability.*`, `view.*`, `audio.*`, `system.*`

---

## Architecture

### Project Structure

```
contact/
├── src/
│   ├── main.ts                 # Entry point, screen router
│   ├── types/                  # TypeScript type definitions
│   ├── engine/                 # Pure game logic (grid, fleet, combat, abilities, turn, game)
│   ├── observability/          # JSONL logger, events, session, export
│   ├── renderer/               # Three.js scene, orbit, cube, materials, views, raycaster, animations
│   ├── audio/                  # Tone.js manager, effects, abilities, ambient
│   ├── ui/                     # Screens (title, setup, handoff, combat, victory), components, CRT effects
│   └── styles/                 # CSS (variables, crt, grid, ui)
├── public/
│   └── index.html              # Shell HTML
├── tests/                      # Vitest test files
├── artifacts/
│   ├── design/                 # GDD and design docs
│   └── delivery/               # Delivery plan
├── Dockerfile
├── docker-compose.yml
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Game State Model

Each player has two 8x8x8 3D arrays:
- **Own Grid** — ship placements, decoy, incoming hits/misses
- **Targeting Grid** — outgoing shots, drone/sonar results

Top-level state tracks:
- `currentPlayer` (0=ALPHA | 1=BRAVO)
- `turnCount`
- `phase` (setup_p1 | setup_p2 | combat | victory)
- Per-player: `abilities` (earned/used), `ships[]` (health, cells, sunk flag)
- Win condition: all 5 ships of one player sunk

---

## Build Commands

| Command | Output | Use Case |
|---|---|---|
| `npm run dev` | Vite dev server (HMR) on `localhost:5173` | Development |
| `npm run build` | `dist/` folder (optimized static files) | Production |
| `npm run build:single` | Single HTML file (via vite-plugin-singlefile) | Portable distribution |
| `npm run test` | Vitest test runner | Testing |
| `docker compose up -d` | Containerized nginx serving `dist/` on port 8080 | Local WiFi hosting |

### Output

Build output goes to `./dist/` in the project directory. Single-file build outputs to `./dist/contact.html`.

---

## Game Flow (GDD Reference)

### Phase 1: Setup
1. Display ALPHA's 8x8x8 grid
2. Player places 5 ships + 1 decoy along any single axis (no bending, no diagonal, no overlap, no OOB)
3. Confirm placement -> handoff screen -> BRAVO places fleet
4. Both confirmed -> transition to Combat

### Phase 2: Combat (alternating turns)
1. Active player sees Own Grid + Targeting Grid
2. One action per turn: Fire Torpedo OR Deploy Ability (if earned)
3. No passing allowed
4. After resolution -> handoff screen -> next player

### Phase 3: Resolution
- All 5 ships sunk -> game over -> display winner

---

## Fleet Composition

| Vessel | Size |
|---|:---:|
| Typhoon | 5 |
| Akula | 4 |
| Seawolf | 3 |
| Virginia | 3 |
| Midget Sub | 2 |

Total occupied cells: 17 / 512 (3.3% density)

---

## Earned Abilities (Summary)

| Pair | Offensive | Defensive |
|---|---|---|
| Intelligence | Sonar Ping (first hit scored, FREE) | Radar Jammer (first hit received, FREE) |
| Reconnaissance | Recon Drone (sink 1st ship, ATTACK) | Decoy (free at setup) |
| Heavy Ordnance | Depth Charge (sink 2nd ship, ATTACK) | Silent Running (lose 1st ship, FREE) |
| Global Intel | G-SONAR (sink 3rd ship, ATTACK) | Acoustic Cloak (enemy uses G-SONAR, FREE) |

See GDD Section 5.2 for full ability rules and interactions.

---

## Constraints

- **No `THREE.OrbitControls`** — custom drag/zoom implementation per GDD.
- **No `THREE.CapsuleGeometry`** — does not exist in r128. Use Box, Sphere, or Cylinder.
- **No `localStorage`/`sessionStorage`** — all state in JS variables.
- **No UI frameworks** — vanilla DOM only.
- **Observability** — if it changes game state, it emits a log event. No exceptions.

## Critical Gotchas

1. **Decoy interaction complexity** — false positive across fire, drone, sonar. Test each path.
2. **Silent Running timing** — track turns since activation, auto-reveal after 2 opponent turns.
3. **Acoustic Cloak trigger** — earned reactively when enemy uses G-SONAR, not proactively.
4. **Radar Jammer** — inverts sonar ping (yes<->no). For drone scan, returns all-false (GDD 5.4).
