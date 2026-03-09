# CONTACT: 3D Naval Combat

[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude%20Opus%204.6-cc785c?logo=anthropic&logoColor=white)](https://claude.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Browser-based 3D Battleship variant. Two players command submarine fleets hidden in a 7x7x7 volumetric grid, firing torpedoes and deploying earned abilities to locate and destroy enemy vessels. Hot-seat local multiplayer, zero server dependencies.

![CONTACT gameplay — Recon Drone scan revealing contacts in the 7x7x7 volumetric grid](game-play.png)

## Tech Stack

- **TypeScript 5.x** + **Vite 6.x**
- **Three.js** — 3D volumetric grid rendering
- **Tone.js** — Synthesized audio (no sample files)
- **Vanilla DOM** — No UI frameworks
- **Vitest** — Testing
- **Docker** — Optional local WiFi hosting

## Getting Started

```sh
npm install
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Dev server with HMR on `localhost:5173` |
| `npm run build` | Production build to `dist/` |
| `npm run build:single` | Single portable HTML file (`dist/contact.html`) |
| `npm run test` | Run tests |
| `npm run simulate` | Run bot-vs-bot game simulations |
| `docker compose up -d` | Serve on port 8080 |

## How to Play

1. **Setup** — Each player places 7 submarines + 1 decoy in the 7x7x7 grid
2. **Combat** — Alternate turns: fire a torpedo, use a perk, or do both (one per slot)
3. **Victory** — Sink all 7 enemy subs to win

Each turn you have three slots available: one **ping** action, one **attack** action, and one **defend** action. Firing a torpedo always uses the attack slot. Perks consume the slot matching their type.

### Credit Economy

Credits fund the perk store. You earn them by landing shots:

| Action | Credits Earned |
|---|---|
| Hit | +1 |
| Consecutive hit (chain) | +8 |
| Sink | +15 |

Starting credits: **5**. Credits accumulate across turns within a game.

### Fleet

| Vessel | Size |
|---|:---:|
| Typhoon | 5 |
| Akula | 4 |
| Seawolf | 3 |
| Virginia | 3 |
| Narwhal | 3 |
| Midget Sub | 2 |
| Piranha | 2 |

Ships may be placed along 8 axes — any direction except purely vertical (depth-only):

- **Within a depth slice:** `col`, `row`, `diag+`, `diag-`
- **Crossing depth layers:** `col-depth`, `col-depth-`, `row-depth`, `row-depth-`

Press **R** during placement to cycle through axes. Press **F** to flip direction.

### Perk Store

Perks are purchased with credits during combat and deployed on your turn.

| Perk | Slot | Cost | Description |
|---|---|:---:|---|
| Sonar Ping | Ping | 3 | Scans a 2x2x2 volume (up to 8 cells) for ship presence |
| Radar Jammer | Defend | 5 | Inverts the next enemy Sonar Ping result; suppresses Recon Drone |
| Recon Drone | Attack | 10 | Reveals contents of a 3x3x3 volume (up to 27 cells) |
| Silent Running | Defend | 10 | Masks one ship from recon scans for 2 opponent turns |
| Acoustic Cloak | Defend | 6 | Masks your entire fleet from recon for 2 opponent turns |
| G-SONAR | Attack | 18 | Scans a full depth layer (49 cells), reveals all ship segments |
| Depth Charge | Attack | 25 | Strikes all occupied cells in a 3x3x3 volume |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Cycle placement axis (during setup) |
| `F` | Flip placement direction (during setup) |
| `S` | Toggle between own grid and targeting grid (during combat) |

### View Modes

Switch between three 3D views during combat:

- **Cube** — Full volumetric 7x7x7 cube, orbit freely
- **Slice** — Single depth layer shown as a flat grid
- **X-Ray** — Semi-transparent cube revealing interior cells

## Session Logging

Every game session produces a structured JSONL event log covering all placements, shots, perk uses, and phase transitions. At game end, export the log from the victory screen for analysis with `jq` or any JSON Lines tool.

See [docs/JSONL_FORMAT.md](docs/JSONL_FORMAT.md) for the full event schema, payload reference, and example queries.

## Docs

- [Game Design Document](artifacts/design/CONTACT_GDD_v1.0.md)
- [Delivery Plan](artifacts/delivery/CONTACT_Delivery_Plan_v1.2.md)
- [JSONL Log Format](docs/JSONL_FORMAT.md)
- [Changelog](CHANGELOG.md)

## Simulation

Run automated bot-vs-bot games to test game balance and perk economy:

```sh
npm run simulate            # 100 games (default)
npm run simulate -- 1000    # custom game count
npm run simulate -- 1 -v    # single game, verbose turn-by-turn output
```

Bots place fleets randomly across all 8 axes, buy and deploy perks with a phase-based spending strategy, and use hunt/target logic with sonar-guided targeting. Results include win rates, average game length, hit rates, credit spending, and perk purchase/usage breakdowns.

## License

[MIT](LICENSE)
