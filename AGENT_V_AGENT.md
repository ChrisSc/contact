# Agent vs Agent: Claude vs Claude

Two Claude instances command opposing submarine fleets in a 7x7x7 volumetric grid. Each agent receives a structured briefing of its game state and chooses actions via tool use — no random heuristics, pure strategic reasoning.

## Prerequisites

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable set

## Quick Start

```sh
npx tsx scripts/agent-play.ts
```

A full game typically takes 2-5 minutes and costs roughly $0.50-2.00 in API usage depending on game length and rank.

## Command Reference

```sh
# Basic game — officer rank, memory enabled
npx tsx scripts/agent-play.ts

# Verbose mode — see agent reasoning, tool calls, and results
npx tsx scripts/agent-play.ts --verbose
npx tsx scripts/agent-play.ts -v

# Set rank (controls stalemate bonus mechanic)
npx tsx scripts/agent-play.ts --rank recruit     # generous stalemate bonus (+8 CR after 8 dry turns)
npx tsx scripts/agent-play.ts --rank enlisted    # moderate bonus (+5 CR after 10 dry turns)
npx tsx scripts/agent-play.ts --rank officer     # no bonus (default)

# Disable persistent memory
npx tsx scripts/agent-play.ts --no-memory

# Export JSONL session log for analysis
npx tsx scripts/agent-play.ts --export
npx tsx scripts/agent-play.ts -e

# Combine flags
npx tsx scripts/agent-play.ts --verbose --rank recruit --export
npx tsx scripts/agent-play.ts -v --no-memory --rank enlisted -e
```

## How It Works

Each agent receives a turn briefing containing:

- **Targeting grid** — what the agent knows about the enemy (hits, misses, sonar results)
- **Own grid** — the agent's ships and incoming damage
- **Fleet status** — ship health, active defensive perks
- **Enemy status** — confirmed sunk ships
- **Inventory and credits** — available perks and purchasing power
- **Turn slots** — which action slots remain (ping, attack, defend)
- **Rank info** — current dry turn streak and stalemate bonus rules

The agent responds with tool calls (fire torpedo, use sonar, purchase perks, etc.) and the game engine executes them. The agent continues making tool calls until it ends its turn.

### Agent Tools

| Tool | Slot | Description |
|---|---|---|
| `fire_torpedo` | Attack | Fire at a single cell |
| `use_sonar_ping` | Ping | Scan a 2x2x2 volume |
| `use_recon_drone` | Attack | Reveal a 3x3x3 volume |
| `use_depth_charge` | Attack | Strike all ships in a 3x3x3 volume |
| `use_g_sonar` | Attack | Scan an entire depth layer |
| `use_radar_jammer` | Defend | Distort next enemy scan |
| `use_silent_running` | Defend | Mask one ship from recon |
| `use_acoustic_cloak` | Defend | Mask all ships from recon |
| `purchase_perk` | None | Buy a perk (no slot cost) |
| `end_turn` | -- | End the turn (attack slot must be used first) |

## Persistent Memory

Agents accumulate strategic wisdom across games through persistent memory files stored in `scripts/memory/`:

```
scripts/memory/
  agent-alpha.md    # ALPHA's strategic memory
  agent-bravo.md    # BRAVO's strategic memory
```

### The Experience Loop

```
Play game --> Reflect on results --> Update memory --> Next game loads memory --> Play better
```

1. **Before the game**: Each agent's memory file (if it exists) is loaded and appended to their system prompt as a `STRATEGIC MEMORY` section
2. **During the game**: Agents can reference their accumulated wisdom when making decisions (visible in `--verbose` mode)
3. **After the game**: Both agents independently reflect on the match results and write a replacement memory document with updated tactical advice
4. **Next game**: The updated memory is loaded, completing the loop

### Memory Format

Memory documents are written in second person with actionable advice:

```markdown
# Strategic Memory

## Opening Strategy
You should buy 2-3 sonar pings in the first few turns before committing to
torpedo fire. Spread initial shots across different depth layers.

## Credit Management
Avoid spending all credits on recon early. Keep at least 10 CR in reserve
for a recon drone when you get a promising hit cluster.

## Ship Hunting
When you get a hit, immediately check adjacent cells along all 8 placement
axes. Ships cannot be placed purely vertically, so focus on horizontal and
diagonal adjacencies first.
```

### Memory Limits

- Each memory file is capped at **2000 characters** to prevent unbounded growth
- Content is truncated at the last complete line if it exceeds the cap
- Each reflection produces a **replacement** document (not an append), so the agent must integrate prior lessons and discard outdated advice

### First Game

On the first run, no memory files exist. Agents play with the base system prompt only. After the game, the first memory files are created from scratch.

### Disabling Memory

Use `--no-memory` to run a game without loading or writing memory files:

```sh
npx tsx scripts/agent-play.ts --no-memory
```

This is useful for baseline comparisons or when you want a clean game without accumulated biases.

### Resetting Memory

Delete the memory files to start fresh:

```sh
rm -rf scripts/memory/
```

### Observing Memory Evolution

Run several games and diff the memory files between runs to watch strategies evolve:

```sh
# Run 3 games and observe
for i in 1 2 3; do
  echo "=== Game $i ==="
  npx tsx scripts/agent-play.ts --verbose
  echo "--- ALPHA memory ---"
  cat scripts/memory/agent-alpha.md
  echo ""
done
```

## Verbose Output

With `--verbose`, you'll see each agent's reasoning and every tool call:

```
──────────────────────────────────────────────────────
  TURN 1 — COMMANDER ALPHA
──────────────────────────────────────────────────────
  ALPHA: I'll start by purchasing a sonar ping to scout...
  ✓ purchase_perk({"perk_id":"sonar_ping"}) → Purchased sonar_ping. Credits remaining: 2 CR
  ✓ fire_torpedo({"coordinate":"D-4-D4"}) → Torpedo at D-4-D4: MISS (+0 CR)
  ✓ end_turn({}) → Turn ended.
```

## Log Analysis

Export and analyze agent games with the log analyzer:

```sh
npx tsx scripts/agent-play.ts --export
npx tsx scripts/analyze-log.ts contact-agent-*.jsonl
```

## Notes

- Memory files are gitignored (`scripts/memory/` is in `.gitignore`) — they are per-machine experimental artifacts
- Both agents use the same Claude model (currently `claude-sonnet-4-20250514`)
- Fleet placement is random for both sides — agents control combat strategy only
- Each agent maintains a separate conversation history across turns within a game for continuity
- The safety limit is 15 API calls per turn and 200 turns per game
