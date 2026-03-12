# CLAUDE.md - CONTACT: 3D Naval Combat

## Project Overview

CONTACT is a browser-based 3D Battleship variant. Two players command submarine fleets hidden in a 7x7x7 volumetric grid (343 cells), firing torpedoes and deploying earned abilities to locate and destroy enemy vessels. Hot-seat local multiplayer, zero server dependencies.

**Authoritative source:** `artifacts/design/CONTACT_GDD_v1.0.md` is the game design document (GDD). All gameplay, UI, and technical decisions flow from this document. If this CLAUDE.md conflicts with the GDD, the GDD wins.

**Delivery plan:** `artifacts/delivery/CONTACT_Delivery_Plan_v1.2.md` defines the phased build order (7 phases, 20 sprints, 311 tasks). Follow this plan sequentially.

**Prototype:** `prototype/contact-prototype.jsx` is a one-shot prototype built from the GDD. This should be used to guide motif, look and feel, and provides ideas.

---

## Technology Stack

| Layer | Choice |
|---|---|
| **Language** | TypeScript 5.x |
| **Build** | Vite 6.x |
| **3D Rendering** | Three.js (r128+ via npm) |
| **Audio** | Tone.js 14.x (via npm), synthesized, no sample files |
| **Fonts** | Press Start 2P + Silkscreen (Google Fonts CDN) |
| **Single-file** | vite-plugin-singlefile |
| **Container** | Docker (nginx:alpine) |
| **Testing** | Vitest |
| **UI** | Vanilla TypeScript + DOM, no frameworks |

---

## Architecture

```
src/
├── main.ts              # Entry point, screen router, persistent CRT effects
├── types/               # Pure type definitions + readonly constants. No runtime logic.
├── engine/              # Pure game logic. Zero DOM dependencies. Testable headlessly.
├── observability/       # JSONL logger singleton, session, export
├── renderer/            # Three.js scene, custom orbit, volumetric cube, animations
├── audio/               # Tone.js synthesized SFX + ambient soundscape
├── ui/                  # Screens, components, CRT effects. Vanilla DOM only.
└── styles/              # CSS design system (variables, CRT, grid, UI, effects)
tests/                   # Mirrors src/ structure. Vitest with per-file jsdom pragmas.
artifacts/design/        # GDD (authoritative)
artifacts/delivery/      # Delivery plan
```

### Game State Model

Each player has two 7x7x7 grids: **Own Grid** (ships, incoming hits) and **Targeting Grid** (outgoing shots, recon results). `GameController` is the single stateful orchestrator; everything else is pure functions.

Key state: `currentPlayer` (0=ALPHA, 1=BRAVO), `turnCount`, `phase` (setup_p1 → setup_p2 → combat → victory), per-player `ships[]`, `credits`, `inventory: PerkInstance[]`, `silentRunningShips[]`. Win condition: all 7 enemy ships sunk.

### Dependency Flow

```
types → engine → observability
                ↘ renderer (Three.js)
                ↘ audio (Tone.js)
                ↘ ui (DOM) → renderer, audio
```

Engine has zero DOM/rendering/audio dependencies. UI orchestrates everything.

---

## Build Commands

| Command | Use Case |
|---|---|
| `npm run dev` | Vite dev server on `localhost:5173` |
| `npm run build` | Production build → `dist/` |
| `npm run build:single` | Single HTML → `dist/contact.html` |
| `npm run test` | Vitest test runner |
| `docker compose up -d` | Containerized nginx on port 8080 |

---

## Constraints

- **No `THREE.OrbitControls`**: custom drag/zoom implementation per GDD.
- **No `THREE.CapsuleGeometry`**: does not exist in r128.
- **No `localStorage`/`sessionStorage`**: all state in JS variables.
- **No UI frameworks**: vanilla DOM only.
- **Observability**: if it changes game state, it emits a log event. No exceptions.

## Critical Gotchas

1. **Decoy**: false positive across fire, drone, sonar. Decoy hit counts as hit for credits.
2. **Silent Running**: masks recon (sonar/drone/G-SONAR) but NOT damage (torpedo/depth charge). 2 opponent turns duration.
3. **Acoustic Cloak**: masks all recon. 2 opponent turns duration. Consumed on deploy (unlike jammer).
4. **Radar Jammer**: inverts sonar (yes↔no), forces drone all-false (GDD 5.4). Stays in inventory until triggered.
5. **Modifier priority**: Silent Running > Acoustic Cloak > Radar Jammer.
6. **Turn slots**: `{ pingUsed, attackUsed, defendUsed }`. Only `attackUsed` gates end turn. Purchasing perks consumes no slot.
7. **Coordinates**: 0-indexed internally, 1-indexed for display. `grid[col][row][depth]`.
8. **Placement axes**: 8 axes via `AXIS_DELTAS`, no purely vertical (depth-only).
