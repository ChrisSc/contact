# CONTACT — JSONL Event Log Format

## Overview

CONTACT emits structured JSONL (JSON Lines) logs throughout every game session. Each log entry is a single JSON object on one line, making the output suitable for streaming parsers, `grep`, `jq`, and line-by-line ingestion.

The logger runs from the first frame of the game — it is not bolted on after the fact. Every state mutation (placement, firing, ability use, phase transition) emits an event. The result is a complete, ordered audit trail of the entire session.

**Ring buffer:** The in-memory buffer is capped at 10,000 events. When full, the oldest event is evicted (FIFO). For typical games this limit is never reached.

**Session lifecycle:** A session begins when the game initializes (`system.init`) and ends when a player exports the log or the browser tab is closed. The session ID is stable for the lifetime of the page load.

**Dev mode:** In development builds, every emitted event is also mirrored to `console.debug` with the event type as a label.

---

## Event Schema

Every log entry conforms to this envelope:

```jsonl
{"ts":"2026-03-15T20:14:03.412Z","seq":1,"event":"game.start","session":"a1b2c3d4","data":{}}
```

| Field | Type | Description |
|---|---|---|
| `ts` | ISO 8601 string | UTC timestamp of event emission (e.g. `"2026-03-15T20:14:03.412Z"`) |
| `seq` | number | Monotonically increasing integer sequence number, starting at 1, reset only on `logger.clear()` |
| `event` | string | Dot-namespaced event type (see Event Taxonomy below) |
| `session` | string | Unique session identifier generated at `system.init`; stable for the lifetime of the page load |
| `data` | object | Event-specific payload; see Payload Schemas below. Empty object `{}` for events with no payload. |

---

## Event Taxonomy

Events are namespaced by domain. The namespace prefix identifies which subsystem emitted the event.

### `game.*` — Game Lifecycle

Emitted by the turn controller and game state machine.

| Event | When emitted |
|---|---|
| `game.start` | New game initialized; players assigned |
| `game.phase_change` | Transition between game phases (setup_p1, setup_p2, combat, victory) |
| `game.turn_start` | Active player's turn begins |
| `game.turn_end` | Active player's turn concludes |
| `game.victory` | Win condition met; one player's fleet is fully sunk |

### `fleet.*` — Fleet Management

Emitted during ship placement (setup phase).

| Event | When emitted |
|---|---|
| `fleet.place` | A ship is placed in the grid |
| `fleet.remove` | A ship is removed from the grid (player adjusting placement) |
| `fleet.decoy_place` | The decoy cell is placed |
| `fleet.confirm` | Player confirms fleet placement; phase advances |
| `fleet.reset` | Player resets all placements to start over |

### `combat.*` — Combat Resolution

Emitted by the combat engine on each torpedo fire and resolution.

| Event | When emitted |
|---|---|
| `combat.fire` | A torpedo is fired at a target cell |
| `combat.hit` | The torpedo struck a ship cell |
| `combat.miss` | The torpedo struck an empty cell |
| `combat.sunk` | A ship was fully destroyed (all cells hit) |

### `ability.*` — Ability System

Emitted by the ability state machine (earn/use/resolve flow from the GDD ability pairs).

| Event | When emitted |
|---|---|
| `ability.unlock` | An ability is earned (e.g. first hit unlocks Sonar Ping) |
| `ability.use` | A player deploys an ability |
| `ability.resolve` | An ability's effect is computed and applied |
| `ability.expire` | A time-limited ability (Silent Running, Acoustic Cloak) expires |

### `economy.*` — Credit Economy

Emitted by the credit engine when credits are awarded or spent.

| Event | When emitted |
|---|---|
| `economy.credit` | Credits awarded to a player (hit, consecutive hit, or sink) |
| `economy.purchase` | A player buys a perk from the store |
| `economy.balance` | Credit balance snapshot (emitted after significant balance changes) |

### `perk.*` — Perk System

Emitted by the perk system when purchasable abilities are deployed.

| Event | When emitted |
|---|---|
| `perk.use` | A player deploys a purchased perk from their inventory |
| `perk.effect` | The perk's effect is applied (may fire separately from use for multi-step perks) |
| `perk.expire` | A time-limited perk effect expires |

### `view.*` — UI & Camera

Emitted by UI controllers when the player changes their view.

| Event | When emitted |
|---|---|
| `view.change` | Top-level view change (e.g. switching between own grid and targeting grid) |
| `view.depth_change` | Active depth layer changed (D1–D8) |
| `view.mode_change` | 3D view mode changed (Cube / Slice / X-Ray) |
| `view.rotate` | Camera orbit/rotation applied |
| `view.board_toggle` | Board display toggled (own grid vs targeting grid) |

### `audio.*` — Audio System

Emitted by the Tone.js audio manager.

| Event | When emitted |
|---|---|
| `audio.init` | Audio context initialized on first user gesture |
| `audio.play` | A sound effect or ambient track starts playing |
| `audio.mute` | Audio muted or unmuted |
| `audio.phase_change` | Ambient music transitions to match game phase (setup, combat, tension) |

### `system.*` — System Events

Emitted by the global error handler and session infrastructure.

| Event | When emitted |
|---|---|
| `system.init` | Logger and session initialized; first event in every log |
| `system.error` | An unhandled error was caught by the global error handler |
| `system.export` | The player triggered a JSONL log export |

---

## Payload Schemas

### `game.start`

```json
{}
```

No payload. The session ID in the envelope identifies the game.

### `game.phase_change`

```json
{ "from": "setup_p2", "to": "combat" }
```

| Field | Type | Values |
|---|---|---|
| `from` | string | `setup_p1`, `setup_p2`, `combat`, `victory` |
| `to` | string | `setup_p1`, `setup_p2`, `combat`, `victory` |

### `game.turn_start` / `game.turn_end`

```json
{ "player": 0, "turn": 12 }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Active player (0 = ALPHA, 1 = BRAVO) |
| `turn` | number | Current turn number |

### `game.victory`

```json
{ "winner": 1, "designation": "BRAVO", "turnCount": 34 }
```

| Field | Type | Description |
|---|---|---|
| `winner` | `0 \| 1` | Winning player index |
| `designation` | string | `"ALPHA"` or `"BRAVO"` |
| `turnCount` | number | Total turns played |

### `fleet.place`

```json
{ "player": 0, "ship": "typhoon", "origin": "C-2-D4", "axis": "col-depth" }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player placing the ship |
| `ship` | string | Ship identifier: `typhoon`, `akula`, `seawolf`, `virginia`, `midget_sub` |
| `origin` | string | Coordinate string of the ship's anchor cell (e.g. `"C-2-D4"` = column C, row 2, depth 4) |
| `axis` | string | Placement axis: `col`, `row`, `diag+`, `diag-`, `col-depth`, `col-depth-`, `row-depth`, `row-depth-` |

### `fleet.remove`

```json
{ "player": 0, "ship": "typhoon" }
```

### `fleet.decoy_place`

```json
{ "player": 0, "origin": "F-6-D2" }
```

### `fleet.confirm`

```json
{ "player": 0 }
```

### `combat.fire`

```json
{ "player": 0, "target": "E-5-D3", "result": "hit", "ship": "akula", "remaining": 3 }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Firing player |
| `target` | string | Target coordinate string |
| `result` | string | `"hit"` or `"miss"` |
| `ship` | string | (present on hit) Ship that was struck |
| `remaining` | number | (present on hit) Remaining undamaged cells on that ship |

### `combat.sunk`

```json
{ "player": 0, "ship": "akula", "enemy": 1, "method": "torpedo" }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player who landed the sinking shot |
| `ship` | string | Ship that was sunk |
| `enemy` | `0 \| 1` | Player whose ship was sunk |
| `method` | string | `"torpedo"` or `"depth_charge"` |

### `ability.unlock`

```json
{ "player": 0, "ability": "sonar_ping", "trigger": "first_hit" }
```

### `ability.use`

```json
{ "player": 0, "ability": "recon_drone", "target": "D-4-D3", "result": "positive" }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player using the ability |
| `ability` | string | Ability identifier |
| `target` | string | (optional) Target coordinate |
| `result` | string | (optional) Resolution result |

### `ability.expire`

```json
{ "player": 0, "ability": "silent_running", "ship": "seawolf" }
```

### `economy.credit`

```json
{ "player": 1, "type": "hit", "amount": 1, "balance": 6 }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player receiving credits |
| `type` | string | Credit reason: `"hit"`, `"consecutive_hit"`, `"sink"` |
| `amount` | number | Credits awarded this event |
| `balance` | number | Player's credit balance after this award |

### `economy.purchase`

```json
{ "player": 1, "perkId": "sonar_ping", "cost": 3, "balance": 3 }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Purchasing player |
| `perkId` | string | Perk identifier (see Perk Catalog in README) |
| `cost` | number | Credits spent |
| `balance` | number | Remaining credits after purchase |

### `economy.balance`

```json
{ "player": 0, "balance": 12 }
```

### `perk.use`

```json
{ "player": 1, "perkId": "sonar_ping", "instanceId": "sonar_ping_1", "target": "E-5-D3", "result": "positive" }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player deploying the perk |
| `perkId` | string | Perk identifier |
| `instanceId` | string | Unique instance ID (e.g. `sonar_ping_1`); distinguishes multiple purchases of the same perk |
| `target` | string | (optional) Target coordinate |
| `result` | string | (optional) Effect result |

### `perk.effect`

```json
{ "player": 1, "perkId": "silent_running", "shipId": "seawolf", "turnsRemaining": 2 }
```

| Field | Type | Description |
|---|---|---|
| `player` | `0 \| 1` | Player whose perk is active |
| `perkId` | string | Perk identifier |
| `shipId` | string | (optional) Ship affected by the effect |
| `turnsRemaining` | number | (optional) Turns before expiry for duration-based perks |

### `perk.expire`

```json
{ "player": 1, "perkId": "acoustic_cloak", "shipId": null }
```

### `view.depth_change`

```json
{ "depth": 3 }
```

### `view.mode_change`

```json
{ "mode": "slice" }
```

Values: `"cube"`, `"slice"`, `"xray"`

### `system.error`

```json
{ "message": "Cannot read properties of undefined", "filename": "src/engine/combat.ts", "lineno": 42, "colno": 8 }
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Error message |
| `filename` | string | (optional) Source file |
| `lineno` | number | (optional) Line number |
| `colno` | number | (optional) Column number |

---

## Export Instructions

### Via Victory Screen

At the end of every game, the victory screen presents an **Export Session Log** button. Clicking it triggers an immediate browser file download of the complete session log as `contact-session-<id>.jsonl`.

### Programmatic Export

From any browser console or test harness:

```typescript
import { exportSession } from './src/observability/export';
exportSession(); // triggers browser download
```

Or to access the raw buffer:

```typescript
import { getLogger } from './src/observability/logger';
const events = getLogger().getBuffer();
```

---

## Example jq Queries

The following queries assume your exported log is named `session.jsonl`.

**Count events by type:**
```sh
jq -s 'group_by(.event) | map({event: .[0].event, count: length})' session.jsonl
```

**Extract all combat fires:**
```sh
jq 'select(.event == "combat.fire")' session.jsonl
```

**Calculate hit rate:**
```sh
jq -s '[.[] | select(.event == "combat.fire")] | {fired: length, hits: [.[] | select(.data.result == "hit")] | length} | .hits / .fired * 100' session.jsonl
```

**Track credit balance over time:**
```sh
jq 'select(.event == "economy.credit" or .event == "economy.balance")' session.jsonl
```

**List all perk purchases:**
```sh
jq 'select(.event == "economy.purchase")' session.jsonl
```

**Get game duration and winner:**
```sh
jq -s '{start: .[0].ts, end: .[-1].ts, winner: [.[] | select(.event == "game.victory")][0].data}' session.jsonl
```

**Show all events for a single player:**
```sh
jq 'select(.data.player == 0)' session.jsonl
```

**List abilities used in order:**
```sh
jq 'select(.event == "ability.use" or .event == "perk.use") | [.seq, .event, .data.ability // .data.perkId]' session.jsonl
```
