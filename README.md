# CONTACT: 3D Naval Combat

Browser-based 3D Battleship variant. Two players command submarine fleets hidden in an 8x8x8 volumetric grid, firing torpedoes and deploying earned abilities to locate and destroy enemy vessels. Hot-seat local multiplayer, zero server dependencies.

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
| `npm run build:single` | Single portable HTML file |
| `npm run test` | Run tests |
| `docker compose up -d` | Serve on port 8080 |

## How to Play

1. **Setup** — Each player places 5 submarines + 1 decoy in the 8x8x8 grid
2. **Combat** — Alternate turns: fire a torpedo or deploy an earned ability
3. **Victory** — Sink all 5 enemy subs to win

### Fleet

| Vessel | Size |
|---|:---:|
| Typhoon | 5 |
| Akula | 4 |
| Seawolf | 3 |
| Virginia | 3 |
| Midget Sub | 2 |

## Docs

- [Game Design Document](artifacts/design/CONTACT_GDD_v1.0.md)
- [Delivery Plan](artifacts/delivery/CONTACT_Delivery_Plan_v1.2.md)

## License

All rights reserved.
