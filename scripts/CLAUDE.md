# scripts/ - CLI Tools

All scripts use `#!/usr/bin/env npx tsx` shebang and can be run directly.

## Files

| File | Purpose |
|---|---|
| `analyze-log.ts` | JSONL session log parser. Produces formatted battle report or `--json` output. |
| `agent-play.ts` | Claude vs Claude autonomous games. Two AI agents play a full match via tool-use loop. |
| `simulate.ts` | Deterministic bot vs bot batch simulations with strategic targeting AI. |
| `memory/` | Persistent agent memory files (`agent-alpha.md`, `agent-bravo.md`) for `agent-play.ts`. |

## analyze-log.ts

```
npx tsx scripts/analyze-log.ts <path-to-log.jsonl> [--json]
```

Parses a CONTACT JSONL session log and produces a box-drawn battle report.

**Key types:** `BattleReport`, `PlayerReport`, `TurnEvent`, `TimelineEntry`, `MomentumSnapshot`, `ShipSurvival`.

**Metrics per player (`PlayerReport`):**
- Combat: `shotsFired`, `torpedoHits`, `torpedoMisses`, `totalHits`, `hitRate`, `longestHitStreak`
- Economy: `creditsEarned`, `creditsSpent`, `creditsFinal`, `stalemateBonuses`, `stalemateBonusCredits`
- Perks: `perksBought{}`, `perksUsed{}` (keyed by perk ID)
- Recon: `sonarPingsPositive/Negative`, `droneScansTotal`, `droneContactsFound`, `depthChargeHits/Sinks`
- AI errors: `actionErrors`, `actionTotal`, `errorRate` (from `ai.action` events with `success: false`)
- Timing: `setupTime`, `avgTurnTime`

**Report sections:** Header (session, mode, AI model), winner, combat stats, economy, perk usage, recon intel, timing, ship survival table, kill order, momentum chart, key events timeline.

**Game mode detection:** Reads `mode` from `game.start` data, falls back to inferring from `ai.turn_start` presence. AI model read from `ai.turn_start` data.

**Legacy log support:** Handles older logs missing `enemy`/`method` fields on `combat.sunk` events via `normalizeSunkEvents()`.

## agent-play.ts

```
npx tsx scripts/agent-play.ts [--verbose] [--rank recruit|enlisted|officer] [--export] [--no-memory]
```

Requires `ANTHROPIC_API_KEY` env var. Two Claude instances command fleets autonomously.

- Fleet placement via `placeFleetRandomly()`
- Tool-use loop: max 8 API calls/turn, uses `gameTools` + `executeTool` from `src/engine/ai/`
- Persistent memory: per-agent strategic memory (2000 char limit) in `scripts/memory/`. Post-game reflection updates memory. `--no-memory` to skip.
- `--export` saves JSONL log to `contact-agent-<sessionId>.jsonl`
- Safety limit: 200 turns max

## simulate.ts

```
npx tsx scripts/simulate.ts [numGames] [--verbose] [--export] [--rank recruit|enlisted|officer]
```

Runs batch games between deterministic bots with strategic AI. No API calls needed.

Bot strategy: intel clustering, axis inference, scored targeting (positive scans > axis extensions > cluster neighbors > parity hunt), deterministic perk buying based on exploration %, defensive perk deployment on most valuable surviving ship.

## Integration Points

All scripts use:
- `GameController` from `src/engine/game.ts`
- Fleet/grid functions from `src/engine/fleet.ts`, `src/engine/grid.ts`
- Types from `src/types/`
- Logger from `src/observability/logger.ts`
- AI tools/briefing from `src/engine/ai/` (agent-play only)
