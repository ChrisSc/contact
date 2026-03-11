# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.0] - 2026-03-10

### Added

- **Rank system** with stalemate bonus mechanic, a difficulty selector on title screen (Recruit/Enlisted/Officer) that awards bonus credits when players go too long without making contact, softening the early-game credit drought at lower ranks
- Dry-turn counter tracking across all contact methods (torpedo, depth charge, sonar, drone, G-SONAR, decoy hits)
- Rank bonus notification banner in combat ("STALEMATE BONUS: +N CREDITS")
- DRY counter stat in combat bottom bar for non-officer ranks
- `--rank` flag for simulator to test balance across difficulty levels
- 15 new rank system engine tests

## [1.0.0] - 2026-03-08

### Added

- **Phase 1 (Foundation):** Project scaffolding, TypeScript type system (Grid3D, Ship, GameState, AbilityState), pure game engine (grid, fleet placement, combat resolution, turn state machine), JSONL structured logger with 10,000-event ring buffer, and a fully playable hot-seat game loop using 2D slice-view grids. Two players can place ships across 8 placement axes, take turns firing torpedoes, and play to victory with no 3D rendering or audio.

- **Phase 2 (3D Rendering):** Three.js volumetric 8x8x8 cube replacing the flat slice grid on both setup and combat screens. Three GDD view modes implemented (Cube, Slice, X-Ray) with custom drag/zoom orbit controls (no OrbitControls import), raycaster-based cell picking, state-driven materials with three opacity tiers, and ghost cell overlay for 3D placement preview.

- **Phase 3 (Credit Economy and Perk Store):** Credit engine awarding points for hits, consecutive hits, and sinks (starting balance: 5 credits). In-game perk store UI with player inventory, per-turn slot enforcement (ping/attack/defend), and all 7 purchasable perks: Sonar Ping, Recon Drone, Depth Charge, G-SONAR, Radar Jammer, Silent Running, Acoustic Cloak. Decoy placement during setup. Full perk interaction matrix including Radar Jammer inversion, Silent Running masking, and Acoustic Cloak fleet-wide concealment.

- **Phase 4 (Audio):** Tone.js synthesized soundscape with no sample files. Action effects for torpedo fire, hit, miss, and sink. Ability/perk deployment sounds. Ambient submarine hum with phase-responsive tension scaling across setup, combat, and late-game states. Lazy audio context initialization on first user gesture per browser autoplay policy.

- **Phase 5 (Visual Polish):** Screen shake on hit and sunk events, hit pulse animations on cell state change, sunk cascade VFX across the destroyed ship's cells, ability deployment animations. CRT aesthetic finalized with scanline overlay, vignette, barrel distortion, phosphor bloom, and subtle static noise.

- **Phase 6 (Mobile and Responsive):** Touch-based orbit controls for 3D grid interaction on tablets and phones. Responsive CSS breakpoints for setup, combat, and victory screens. Mobile-optimized HUD layout, perk store panel, and fleet status display.

- **Phase 7 (Integration and Release):** Docker containerization (nginx:alpine, port 8080) with multi-stage build. Single-file portable build target (`dist/contact.html`) via vite-plugin-singlefile. Comprehensive test suite covering all GDD-specified ability interactions, edge cases, and game-over conditions. Release documentation: CHANGELOG, JSONL format reference, expanded README.

### Technical

- TypeScript 5.x with `strict: true`, `noUncheckedIndexedAccess: true`, target ES2022
- Vite 6.x build system with sub-second HMR; production build tree-shakes Three.js and Tone.js
- Three.js r128+ via npm (BoxGeometry + EdgesGeometry per cell; no CapsuleGeometry)
- Tone.js 14.x via npm (all audio synthesized programmatically)
- JSONL structured logging with 10,000-event ring buffer, monotonic sequence numbers, and ISO 8601 timestamps
- Docker multi-stage build: node:alpine build stage, nginx:alpine serve stage
- Single-file portable output via vite-plugin-singlefile (`build:single` script)
- Vitest test harness with Three.js and Tone.js mocked (no WebGL or AudioContext required)
- No localStorage, sessionStorage, UI frameworks, or OrbitControls (per GDD constraints)
- All state in-memory JS variables; zero server dependencies
