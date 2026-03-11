# Human vs AI: Play Against Claude

Challenge Claude Sonnet as your opponent in a full game of CONTACT. You command ALPHA, Claude commands BRAVO — placing its fleet, choosing targets, purchasing perks, and deploying abilities through real-time strategic reasoning via tool use.

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/) (starts with `sk-`)
- The key needs access to `claude-sonnet-4-6`

## Quick Start

```sh
npm run dev
```

1. On the title screen, select **VS AI**
2. Enter your Anthropic API key
3. Choose a rank (difficulty)
4. Press **START**

ALPHA (you) places your fleet manually. BRAVO's fleet is placed automatically. Combat begins immediately — no handoff screens.

## How It Works

### Your Turn (ALPHA)

Play normally: fire torpedoes, use sonar, purchase and deploy perks. All the same controls as local multiplayer.

### AI Turn (BRAVO)

When you end your turn, the screen displays **"BRAVO IS THINKING..."** while Claude decides its actions. All controls are locked and dimmed during this time — you cannot interact with the grid, change views, or open the store.

Behind the scenes, Claude receives a structured briefing containing:

- Full targeting grid (hits, misses, sonar/drone results)
- Own grid (ships, incoming damage)
- Fleet status and active defensive perks
- Inventory, credits, and the perk store
- Turn slot availability
- Rank and stalemate bonus state

Claude responds with tool calls — purchasing perks, firing torpedoes, deploying abilities — and the game engine executes them. The AI issues all actions for a turn in a single exchange when possible, then ends its turn. Control returns to you.

### Strategic Memory

The AI plays with embedded strategic knowledge learned from prior agent-vs-agent games:

- **Opening discipline** — clusters shots in high-probability zones, forms hypotheses before firing
- **Hunt commitment** — commits 5-7 follow-up shots on confirmed hits, finishes kills before opening new hunts
- **Credit management** — begins perk spending by turn 8-10, prioritizes kill-acceleration perks over pure recon
- **Defensive awareness** — deploys defensive perks proactively when under concentrated fire
- **Endgame pressure** — shifts from pure precision to precision-plus-pressure when tied late

### AI Tools

The AI has access to the same actions as a human player:

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
| `end_turn` | -- | End the turn |

### Safety Limits

- **8 API calls per turn** — if the AI exceeds this, it fires a torpedo at the first available cell and ends its turn
- **3 turns of history** — the AI retains context from its last 3 turns for continuity, older turns are summarized
- **Error recovery** — network errors, rate limits, and auth failures show a notification and the AI's turn is force-ended so you can continue

## API Key Handling

Your API key is:

- Entered on the title screen each session
- Held in a JavaScript variable only — never written to disk, localStorage, or any persistent store
- Passed directly to the Anthropic SDK with `dangerouslyAllowBrowser: true`
- Discarded when you close the tab or return to the title screen

## Cost

A typical game runs 60-120 turns (30-60 AI turns). Each AI turn uses 1-3 API calls with `max_tokens: 300`. Expect roughly **$0.10-0.50 per game** depending on length and rank. Recruit rank games tend to be shorter (more credits = faster kills), officer rank games run longer.

## Architecture

The AI opponent reuses the same core modules as the [Agent vs Agent](AGENT_V_AGENT.md) CLI mode:

```
src/engine/ai/
  ai-briefing.ts    # State serializers + system prompt (shared)
  ai-tools.ts       # Tool definitions + execution (shared)
  ai-placement.ts   # Random fleet placement (shared)
  ai-opponent.ts    # Browser SDK client + turn loop (browser only)
```

The browser `AIOpponent` class manages the Anthropic SDK client, conversation history, and the turn execution loop. The shared modules (`ai-briefing`, `ai-tools`, `ai-placement`) have zero DOM or SDK dependencies — pure game logic.

## Tips

- **Watch the AI's patterns** — Claude tends to cluster shots near confirmed hits. Use Silent Running or Acoustic Cloak when you see it closing in on a ship.
- **Spread your fleet across depth layers** — the AI searches methodically; vertical distribution makes it harder to find multiple ships quickly.
- **Use the rank system** — Recruit rank gives both players more credits via stalemate bonuses, which means more perks and faster games. Officer rank is the purest challenge.
- **Export your logs** — every game produces a JSONL event log you can export from the victory screen and analyze with `scripts/analyze-log.ts`.
