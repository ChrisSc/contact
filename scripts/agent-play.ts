#!/usr/bin/env npx tsx

/**
 * agent-play.ts — Claude vs Claude submarine warfare.
 *
 * Two Claude instances command opposing submarine fleets in a 7x7x7 volumetric
 * grid. Each agent receives a structured view of its game state and chooses
 * actions via tool use — no random heuristics, pure strategic reasoning.
 *
 * Usage:
 *   npx tsx scripts/agent-play.ts [--verbose] [--rank recruit|enlisted|officer] [--export] [--no-memory]
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { GameController } from '../src/engine/game';
import type { FireResult, DepthChargeResult } from '../src/engine/game';
import { FLEET_ROSTER, PLACEMENT_AXES } from '../src/types/fleet';
import type { Coordinate } from '../src/types/grid';
import { CellState, GRID_SIZE, COLUMN_LABELS, DEPTH_LABELS } from '../src/types/grid';
import { GamePhase } from '../src/types/game';
import type { PlayerIndex, Rank } from '../src/types/game';
import { RANK_CONFIGS } from '../src/types/game';
import { PERK_CATALOG } from '../src/types/abilities';
import type { PerkId } from '../src/types/abilities';
import { getCell, formatCoordinate, parseCoordinate } from '../src/engine/grid';
import { getLogger } from '../src/observability/logger';
import { serializeSession } from '../src/observability/export';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const exportJsonl = args.includes('--export') || args.includes('-e');
const noMemory = args.includes('--no-memory');
let rank: Rank = 'officer';
const rankIdx = args.indexOf('--rank');
if (rankIdx !== -1 && args[rankIdx + 1]) {
  const val = args[rankIdx + 1] as string;
  if (val === 'recruit' || val === 'enlisted' || val === 'officer') rank = val;
  else { console.error(`Invalid rank: ${val}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Persistent memory
// ---------------------------------------------------------------------------

const MEMORY_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'memory');
const MEMORY_MAX_CHARS = 2000;

type PlayerKey = 'alpha' | 'bravo';

function memoryPath(playerKey: PlayerKey): string {
  return path.join(MEMORY_DIR, `agent-${playerKey}.md`);
}

function loadMemory(playerKey: PlayerKey): string | null {
  const fp = memoryPath(playerKey);
  try {
    const content = fs.readFileSync(fp, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

function saveMemory(playerKey: PlayerKey, content: string): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  let text = content;
  if (text.length > MEMORY_MAX_CHARS) {
    // Truncate at last complete line within limit
    text = text.slice(0, MEMORY_MAX_CHARS);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline > 0) text = text.slice(0, lastNewline);
  }
  fs.writeFileSync(memoryPath(playerKey), text, 'utf-8');
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Tool definitions for Claude
// ---------------------------------------------------------------------------

const gameTools: Anthropic.Tool[] = [
  {
    name: 'purchase_perk',
    description: 'Buy a perk from the store. Costs credits but does NOT consume a turn slot. You can buy multiple perks per turn. Perks go into your inventory and must be used separately.',
    input_schema: {
      type: 'object' as const,
      properties: {
        perk_id: {
          type: 'string',
          enum: ['sonar_ping', 'recon_drone', 'depth_charge', 'g_sonar', 'radar_jammer', 'silent_running', 'acoustic_cloak'],
          description: 'The perk to purchase',
        },
      },
      required: ['perk_id'],
    },
  },
  {
    name: 'use_sonar_ping',
    description: 'Use a Sonar Ping from inventory. Scans a 2x2x2 volume (up to 8 cells) for ship presence. Uses the PING slot (free, does not prevent attacking). Coordinate is the min-corner of the 2x2x2 cube.',
    input_schema: {
      type: 'object' as const,
      properties: {
        coordinate: {
          type: 'string',
          description: 'Target coordinate, e.g. "C-3-D2" (column-row-depth, 1-indexed)',
        },
      },
      required: ['coordinate'],
    },
  },
  {
    name: 'fire_torpedo',
    description: 'Fire a torpedo at a single cell. Uses the ATTACK slot. This is your primary weapon — hit=1 CR, consecutive hit=+8 CR, sink=+15 CR.',
    input_schema: {
      type: 'object' as const,
      properties: {
        coordinate: {
          type: 'string',
          description: 'Target coordinate, e.g. "C-3-D2" (column-row-depth, 1-indexed)',
        },
      },
      required: ['coordinate'],
    },
  },
  {
    name: 'use_recon_drone',
    description: 'Deploy a Recon Drone from inventory. Reveals contents of a 3x3x3 volume (up to 27 cells). Uses the ATTACK slot (cannot also fire torpedo this turn).',
    input_schema: {
      type: 'object' as const,
      properties: {
        coordinate: {
          type: 'string',
          description: 'Center coordinate of the 3x3x3 scan volume, e.g. "D-4-D4"',
        },
      },
      required: ['coordinate'],
    },
  },
  {
    name: 'use_depth_charge',
    description: 'Deploy a Depth Charge from inventory. Strikes ALL occupied cells in a 3x3x3 volume — damages ships and reveals the area. Uses the ATTACK slot. Very expensive (25 CR) but devastating when you know where ships are.',
    input_schema: {
      type: 'object' as const,
      properties: {
        coordinate: {
          type: 'string',
          description: 'Center coordinate of the 3x3x3 blast radius, e.g. "D-4-D4"',
        },
      },
      required: ['coordinate'],
    },
  },
  {
    name: 'use_g_sonar',
    description: 'Deploy G-SONAR from inventory. Scans an entire depth layer (all 49 cells at one depth). Uses the ATTACK slot. Reveals ship segments on the chosen depth.',
    input_schema: {
      type: 'object' as const,
      properties: {
        depth: {
          type: 'number',
          description: 'Depth layer to scan, 1-7 (displayed as D1-D7)',
        },
      },
      required: ['depth'],
    },
  },
  {
    name: 'use_radar_jammer',
    description: 'Deploy a Radar Jammer from inventory. Inverts the next enemy Sonar Ping result and forces Recon Drone to return all-false. Uses the DEFEND slot. Stays active until triggered by opponent.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'use_silent_running',
    description: 'Deploy Silent Running from inventory on one of your ships. Masks that ship from recon (sonar/drone/G-SONAR) for 2 opponent turns. Does NOT protect from damage. Uses the DEFEND slot.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ship_id: {
          type: 'string',
          description: 'ID of the ship to cloak, e.g. "typhoon", "akula", "seawolf", etc.',
        },
      },
      required: ['ship_id'],
    },
  },
  {
    name: 'use_acoustic_cloak',
    description: 'Deploy Acoustic Cloak from inventory. ALL your ships are masked from recon for 2 opponent turns. Uses the DEFEND slot. Consumed on deployment.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'end_turn',
    description: 'End your turn. You MUST have used your attack slot before ending (fire torpedo, recon drone, depth charge, or G-SONAR). Call this when you are done with all actions for this turn.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// State serializer — converts game state into a briefing for Claude
// ---------------------------------------------------------------------------

function serializeTargetingGrid(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;
  const lines: string[] = [];

  lines.push('YOUR TARGETING GRID (what you know about the enemy):');
  lines.push('Legend: · = unknown, + = positive, - = negative, X = hit, O = miss, S = sunk');
  lines.push('Only depth layers with activity are shown. Omitted layers are entirely unexplored.');
  lines.push('');

  for (let depth = 0; depth < GRID_SIZE; depth++) {
    // Check if this layer has any activity
    let hasActivity = false;
    for (let row = 0; row < GRID_SIZE && !hasActivity; row++) {
      for (let col = 0; col < GRID_SIZE && !hasActivity; col++) {
        const cell = getCell(grid, { col, row, depth });
        if (cell && cell.state !== CellState.Empty) hasActivity = true;
      }
    }
    if (!hasActivity) continue;

    lines.push(`  Depth ${DEPTH_LABELS[depth]}:`);
    lines.push('    A B C D E F G');
    for (let row = 0; row < GRID_SIZE; row++) {
      let rowStr = `  ${row + 1} `;
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = getCell(grid, { col, row, depth });
        if (!cell || cell.state === CellState.Empty) rowStr += '· ';
        else if (cell.state === CellState.Hit) rowStr += 'X ';
        else if (cell.state === CellState.Miss) rowStr += 'O ';
        else if (cell.state === CellState.Sunk) rowStr += 'S ';
        else if (cell.state === CellState.SonarPositive || cell.state === CellState.DronePositive) rowStr += '+ ';
        else if (cell.state === CellState.SonarNegative || cell.state === CellState.DroneNegative) rowStr += '- ';
        else rowStr += '· ';
      }
      lines.push(rowStr);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function serializeActionableIntel(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;
  const lines: string[] = [];

  // Collect unsunk hits and positive contacts
  const unsunkHits: string[] = [];
  const positives: string[] = [];
  let totalExplored = 0;

  for (let depth = 0; depth < GRID_SIZE; depth++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = getCell(grid, { col, row, depth });
        if (!cell || cell.state === CellState.Empty) continue;
        totalExplored++;
        const coord = formatCoordinate({ col, row, depth });
        if (cell.state === CellState.Hit) unsunkHits.push(coord);
        else if (cell.state === CellState.SonarPositive || cell.state === CellState.DronePositive) positives.push(coord);
      }
    }
  }

  lines.push('ACTIONABLE INTEL:');
  lines.push(`  Explored: ${totalExplored}/343 cells (${(totalExplored / 343 * 100).toFixed(0)}%)`);

  if (unsunkHits.length > 0) {
    lines.push(`  UNSUNK HITS (${unsunkHits.length}) — ships damaged but not yet sunk, investigate adjacent cells:`);
    // Group hits and find unexplored neighbors
    for (const hitCoord of unsunkHits) {
      const parsed = parseCoordinate(hitCoord);
      if (!parsed) continue;
      const neighbors: string[] = [];
      // Check all 26 neighbors for unexplored cells
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dd = -1; dd <= 1; dd++) {
            if (dc === 0 && dr === 0 && dd === 0) continue;
            const nc = parsed.col + dc, nr = parsed.row + dr, nd = parsed.depth + dd;
            if (nc < 0 || nc >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE || nd < 0 || nd >= GRID_SIZE) continue;
            const nCell = getCell(grid, { col: nc, row: nr, depth: nd });
            if (!nCell || nCell.state === CellState.Empty) {
              neighbors.push(formatCoordinate({ col: nc, row: nr, depth: nd }));
            }
          }
        }
      }
      if (neighbors.length > 0) {
        lines.push(`    ${hitCoord} → unexplored neighbors: ${neighbors.join(', ')}`);
      } else {
        lines.push(`    ${hitCoord} → all neighbors explored`);
      }
    }
  } else {
    lines.push('  No unsunk hits. Fire at unexplored areas to find ships.');
  }

  if (positives.length > 0) {
    lines.push(`  POSITIVE CONTACTS (${positives.length}) — confirmed ship presence, HIGH PRIORITY torpedo targets:`);
    for (const posCoord of positives) {
      const parsed = parseCoordinate(posCoord);
      if (!parsed) continue;
      // Check if this cell itself is still targetable (not yet resolved by torpedo)
      const cell = getCell(grid, parsed);
      const targetable = cell && (cell.state === CellState.SonarPositive || cell.state === CellState.DronePositive);
      if (targetable) {
        lines.push(`    ${posCoord} ← FIRE HERE (confirmed ship presence)`);
      }
    }
  }

  return lines.join('\n');
}

function serializeOwnGrid(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.ownGrid;
  const lines: string[] = [];

  lines.push('YOUR OWN GRID (your ships and incoming damage):');
  lines.push('Legend: · = empty, # = your ship, D = decoy, X = hit, O = enemy miss, S = sunk, d = decoy hit');
  lines.push('Only layers with your ships or incoming fire shown.');
  lines.push('');

  for (let depth = 0; depth < GRID_SIZE; depth++) {
    let hasContent = false;
    for (let row = 0; row < GRID_SIZE && !hasContent; row++) {
      for (let col = 0; col < GRID_SIZE && !hasContent; col++) {
        const cell = getCell(grid, { col, row, depth });
        if (cell && cell.state !== CellState.Empty) hasContent = true;
      }
    }
    if (!hasContent) continue;

    lines.push(`  Depth ${DEPTH_LABELS[depth]}:`);
    lines.push('    A B C D E F G');
    for (let row = 0; row < GRID_SIZE; row++) {
      let rowStr = `  ${row + 1} `;
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = getCell(grid, { col, row, depth });
        if (!cell || cell.state === CellState.Empty) rowStr += '· ';
        else if (cell.state === CellState.Ship) rowStr += '# ';
        else if (cell.state === CellState.Decoy) rowStr += 'D ';
        else if (cell.state === CellState.Hit) rowStr += 'X ';
        else if (cell.state === CellState.Miss) rowStr += 'O ';
        else if (cell.state === CellState.Sunk) rowStr += 'S ';
        else if (cell.state === CellState.DecoyHit) rowStr += 'd ';
        else rowStr += '· ';
      }
      lines.push(rowStr);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function serializeFleetStatus(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const lines: string[] = [];

  lines.push('YOUR FLEET STATUS:');
  for (const ship of player.ships) {
    const health = ship.size - ship.hits;
    const status = ship.sunk ? 'SUNK' : `${health}/${ship.size} HP`;
    const sr = player.silentRunningShips.find(s => s.shipId === ship.id);
    const srTag = sr ? ` [SR: ${sr.turnsRemaining} turns]` : '';
    lines.push(`  ${ship.name} (${ship.id}): ${status}${srTag}`);
  }

  const cloakActive = player.abilities.acoustic_cloak.active;
  if (cloakActive) {
    lines.push(`  [ACOUSTIC CLOAK ACTIVE: ${player.abilities.acoustic_cloak.turnsRemaining} turns remaining]`);
  }
  const jammerActive = player.abilities.radar_jammer.active;
  if (jammerActive) {
    lines.push(`  [RADAR JAMMER ARMED — will trigger on next enemy sonar/drone]`);
  }

  return lines.join('\n');
}

function serializeEnemyStatus(gc: GameController): string {
  const opponent = gc.getOpponent();
  const lines: string[] = [];

  lines.push('ENEMY FLEET STATUS (what you can observe):');
  // The attacker knows how many ships they've sunk and which ones
  const sunkShips = opponent.ships.filter(s => s.sunk);
  const remaining = 7 - sunkShips.length;
  lines.push(`  Ships remaining: ${remaining}/7`);
  if (sunkShips.length > 0) {
    lines.push(`  Confirmed sunk: ${sunkShips.map(s => s.name).join(', ')}`);
  }

  return lines.join('\n');
}

function serializeInventory(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const lines: string[] = [];

  lines.push(`CREDITS: ${player.credits} CR`);
  lines.push('');

  // Inventory
  if (player.inventory.length > 0) {
    lines.push('INVENTORY (ready to use):');
    const counts: Record<string, number> = {};
    for (const p of player.inventory) {
      counts[p.perkId] = (counts[p.perkId] || 0) + 1;
    }
    for (const [id, count] of Object.entries(counts)) {
      const def = PERK_CATALOG.find(p => p.id === id);
      if (def) lines.push(`  ${def.name} x${count} (slot: ${def.slot})`);
    }
  } else {
    lines.push('INVENTORY: empty');
  }

  lines.push('');
  lines.push('PERK STORE:');
  for (const perk of PERK_CATALOG) {
    const affordable = player.credits >= perk.cost ? '✓' : '✗';
    lines.push(`  ${affordable} ${perk.name} (${perk.id}): ${perk.cost} CR — ${perk.description}`);
  }

  return lines.join('\n');
}

function serializeTurnSlots(gc: GameController): string {
  const slots = gc.getTurnSlots();
  const lines: string[] = [];

  lines.push('TURN SLOTS:');
  lines.push(`  Ping slot:   ${slots.pingUsed ? 'USED' : 'AVAILABLE'} (sonar ping — free action)`);
  lines.push(`  Attack slot: ${slots.attackUsed ? 'USED' : 'AVAILABLE'} (torpedo / recon drone / depth charge / G-SONAR)`);
  lines.push(`  Defend slot: ${slots.defendUsed ? 'USED' : 'AVAILABLE'} (radar jammer / silent running / acoustic cloak)`);
  lines.push('');
  if (!slots.attackUsed) {
    lines.push('  ⚠ You MUST use your attack slot before ending your turn.');
  } else {
    lines.push('  ✓ Attack slot used. You may end your turn.');
  }

  return lines.join('\n');
}

function serializeRankInfo(gc: GameController): string {
  const rankConfig = gc.getRankConfig();
  const dryTurns = gc.getDryTurnCounter();
  const lines: string[] = [];

  lines.push(`RANK: ${rankConfig.label}`);
  if (rankConfig.dryTurnThreshold !== null) {
    lines.push(`  Stalemate bonus: +${rankConfig.creditBonus} CR to BOTH players after ${rankConfig.dryTurnThreshold} consecutive dry turns (no contact by either side).`);
    lines.push(`  Current dry turn streak: ${dryTurns}/${rankConfig.dryTurnThreshold}`);
  } else {
    lines.push(`  No stalemate bonus at this rank.`);
  }

  return lines.join('\n');
}

function buildTurnBriefing(gc: GameController, stalemateBonusAwarded: boolean = false): string {
  const state = gc.getState();
  const designation = state.currentPlayer === 0 ? 'ALPHA' : 'BRAVO';
  const rankConfig = gc.getRankConfig();

  const header = [
    `═══════════════════════════════════════════════════`,
    `TURN ${state.turnCount} — COMMANDER ${designation}`,
    `═══════════════════════════════════════════════════`,
    '',
  ];

  if (stalemateBonusAwarded) {
    header.push(`⚡ STALEMATE BONUS RECEIVED: +${rankConfig.creditBonus} CR awarded to you (and your opponent) because ${rankConfig.dryTurnThreshold} consecutive turns passed with no contact by either side. This is a rank mechanic, NOT a hit reward.`);
    header.push('');
  }

  const sections = [
    ...header,
    serializeRankInfo(gc),
    '',
    serializeTurnSlots(gc),
    '',
    serializeInventory(gc),
    '',
    serializeFleetStatus(gc),
    '',
    serializeEnemyStatus(gc),
    '',
    serializeActionableIntel(gc),
    '',
    serializeTargetingGrid(gc),
    '',
    serializeOwnGrid(gc),
  ];

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// System prompt for Claude agents
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are playing CONTACT — 3D Battleship on a 7×7×7 grid (343 cells). Sink all 7 enemy subs to win.

COORDINATES: "Col-Row-Depth", 1-indexed. Columns A-G, Rows 1-7, Depth D1-D7. Example: "C-3-D2"

FLEET: Typhoon(5), Akula(4), Seawolf(3), Virginia(3), Narwhal(3), Midget Sub(2), Piranha(2) = 22 cells.

TURN SLOTS: Ping(free), Attack(REQUIRED), Defend(free). Purchase perks anytime (no slot). You MUST attack before ending.

RULES:
- Cannot fire on X/O/S cells. CAN fire on +/- cells.
- Hit=+1CR, consecutive hit=+8CR, sink=+15CR.
- Ships are STATIC — once placed, they never move. A confirmed contact remains valid until you torpedo it.
- Ships placed along 8 axes (never purely vertical). Use hit patterns to trace orientation.
- Stalemate bonus gives both players free CR after consecutive dry turns (rank-dependent).

BE CONCISE. Do NOT narrate, summarize, or restate the briefing. Act immediately with tool calls. Issue ALL actions for a turn in a single response when possible (e.g. purchase + attack + end_turn together).`;

// ---------------------------------------------------------------------------
// Fleet placement (reuse random from simulate.ts for now)
// ---------------------------------------------------------------------------

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randomCoord(): Coordinate {
  return { col: randInt(GRID_SIZE), row: randInt(GRID_SIZE), depth: randInt(GRID_SIZE) };
}

function placeFleetRandomly(gc: GameController): void {
  for (const entry of FLEET_ROSTER) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 2000) {
      placed = gc.placeShipForCurrentPlayer(entry, randomCoord(), PLACEMENT_AXES[randInt(PLACEMENT_AXES.length)]!);
      attempts++;
    }
    if (!placed) throw new Error(`Failed to place ${entry.name}`);
  }
  // Place decoy
  let decoyPlaced = false;
  let attempts = 0;
  while (!decoyPlaced && attempts < 500) {
    decoyPlaced = gc.placeDecoyForCurrentPlayer(randomCoord());
    attempts++;
  }
}

// ---------------------------------------------------------------------------
// Tool execution — maps Claude tool calls to GameController methods
// ---------------------------------------------------------------------------

interface ToolResult {
  success: boolean;
  message: string;
  turnOver?: boolean;
}

function safeParseCoordinate(input: Record<string, unknown>): Coordinate | null {
  const raw = input.coordinate;
  if (typeof raw !== 'string') return null;
  return parseCoordinate(raw);
}

function executeTool(gc: GameController, toolName: string, input: Record<string, unknown>): ToolResult {
  switch (toolName) {
    case 'purchase_perk': {
      const perkId = input.perk_id;
      if (typeof perkId !== 'string') {
        return { success: false, message: `Missing perk_id. Valid perks: sonar_ping, recon_drone, depth_charge, g_sonar, radar_jammer, silent_running, acoustic_cloak` };
      }
      const validPerks = ['sonar_ping', 'recon_drone', 'depth_charge', 'g_sonar', 'radar_jammer', 'silent_running', 'acoustic_cloak'];
      if (!validPerks.includes(perkId)) {
        return { success: false, message: `Invalid perk_id: "${perkId}". Valid perks: ${validPerks.join(', ')}` };
      }
      const result = gc.purchasePerk(perkId as PerkId);
      if (result) {
        const player = gc.getCurrentPlayer();
        return { success: true, message: `Purchased ${perkId}. Credits remaining: ${player.credits} CR` };
      }
      return { success: false, message: `Cannot purchase ${perkId}. Check credits and availability.` };
    }

    case 'use_sonar_ping': {
      const coord = safeParseCoordinate(input);
      if (!coord) return { success: false, message: `Invalid coordinate: ${JSON.stringify(input.coordinate)}. Use format "C-3-D2" (column-row-depth, 1-indexed).` };
      const result = gc.useSonarPing(coord);
      if (result) {
        const positiveCells = result.cells.filter(c => c.displayedResult);
        const total = result.cells.length;
        const negativeCells = result.cells.filter(c => !c.displayedResult);
        let msg = `Sonar ping at ${input.coordinate}: ${positiveCells.length}/${total} cells positive.`;
        if (positiveCells.length > 0) {
          msg += ` CONTACTS at: ${positiveCells.map(c => formatCoordinate(c.coord)).join(', ')}.`;
        }
        if (negativeCells.length > 0) {
          msg += ` Clear: ${negativeCells.map(c => formatCoordinate(c.coord)).join(', ')}.`;
        }
        if (result.jammed) msg += ' (WARNING: result may have been jammed!)';
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot use sonar ping. Check: ping slot available? Sonar ping in inventory?` };
    }

    case 'fire_torpedo': {
      const coord = safeParseCoordinate(input);
      if (!coord) return { success: false, message: `Invalid coordinate: ${JSON.stringify(input.coordinate)}. Use format "C-3-D2" (column-row-depth, 1-indexed).` };
      if (gc.getTurnSlots().attackUsed) {
        return { success: false, message: `Attack slot already used this turn. Call end_turn now.` };
      }
      // Check if cell is already resolved
      const targetCell = getCell(gc.getCurrentPlayer().targetingGrid, coord);
      if (targetCell && (targetCell.state === CellState.Hit || targetCell.state === CellState.Miss || targetCell.state === CellState.Sunk)) {
        return { success: false, message: `Cell ${input.coordinate} already resolved (${targetCell.state}). Pick a different unexplored cell.` };
      }
      const result = gc.fireTorpedo(coord);
      if (result) {
        let msg = `Torpedo at ${input.coordinate}: ${result.result.toUpperCase()}`;
        if (result.result === 'sunk') msg += ` — ${result.shipId} destroyed!`;
        if (result.creditsAwarded) msg += ` (+${result.creditsAwarded} CR)`;
        msg += ' Attack slot used. End your turn now or use remaining free slots (ping/defend).';
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot fire torpedo at ${input.coordinate}. Try a different cell.` };
    }

    case 'use_recon_drone': {
      const coord = safeParseCoordinate(input);
      if (!coord) return { success: false, message: `Invalid coordinate: ${JSON.stringify(input.coordinate)}. Use format "C-3-D2" (column-row-depth, 1-indexed).` };
      const result = gc.useReconDrone(coord);
      if (result) {
        const positiveCells = result.cells.filter(c => c.displayedResult);
        let msg = `Recon drone at ${input.coordinate}: ${positiveCells.length} contacts in 3x3x3 volume.`;
        if (positiveCells.length > 0) {
          msg += ` SHIP SEGMENTS at: ${positiveCells.map(c => formatCoordinate(c.coord)).join(', ')}.`;
        }
        msg += ' Attack slot used. End your turn now or use remaining free slots (ping/defend).';
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot deploy recon drone. Check: attack slot available? Drone in inventory?` };
    }

    case 'use_depth_charge': {
      const coord = safeParseCoordinate(input);
      if (!coord) return { success: false, message: `Invalid coordinate: ${JSON.stringify(input.coordinate)}. Use format "C-3-D2" (column-row-depth, 1-indexed).` };
      const result = gc.useDepthCharge(coord);
      if (result) {
        const hitCells = result.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk');
        let msg = `Depth charge at ${input.coordinate}: ${hitCells.length} hits`;
        if (hitCells.length > 0) {
          msg += ` at ${hitCells.map(c => `${formatCoordinate(c.coord)}(${c.result})`).join(', ')}`;
        }
        if (result.shipsSunk.length > 0) msg += `. Ships sunk: ${result.shipsSunk.join(', ')}`;
        msg += ` (+${result.totalCreditsAwarded} CR)`;
        msg += '. Attack slot used. End your turn now or use remaining free slots (ping/defend).';
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot deploy depth charge. Check: attack slot available? Depth charge in inventory?` };
    }

    case 'use_g_sonar': {
      const depthInput = typeof input.depth === 'number' ? input.depth : parseInt(input.depth as string);
      if (isNaN(depthInput) || depthInput < 1 || depthInput > 7) {
        return { success: false, message: `Invalid depth: ${JSON.stringify(input.depth)}. Use 1-7.` };
      }
      const depth = depthInput - 1; // Convert 1-indexed to 0-indexed
      const result = gc.useGSonar(depth);
      if (result) {
        const positiveCells = result.cells.filter(c => c.displayedResult);
        let msg = `G-SONAR at depth D${depthInput}: ${positiveCells.length} contacts across the entire layer.`;
        if (positiveCells.length > 0) {
          msg += ` SHIP SEGMENTS at: ${positiveCells.map(c => formatCoordinate(c.coord)).join(', ')}.`;
        }
        msg += ' Attack slot used. End your turn now or use remaining free slots (ping/defend).';
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot deploy G-SONAR. Check: attack slot available? G-SONAR in inventory?` };
    }

    case 'use_radar_jammer': {
      const result = gc.useRadarJammer();
      if (result) return { success: true, message: 'Radar jammer deployed. Will distort next enemy sonar/drone scan.' };
      return { success: false, message: 'Cannot deploy radar jammer. Check: defend slot available? Jammer in inventory? Already active?' };
    }

    case 'use_silent_running': {
      const shipId = input.ship_id;
      if (typeof shipId !== 'string') {
        return { success: false, message: `Missing ship_id. Valid IDs: typhoon, akula, seawolf, virginia, narwhal, midget_sub, piranha` };
      }
      const result = gc.useSilentRunning(shipId);
      if (result) return { success: true, message: `Silent running activated on ${shipId} for 2 opponent turns.` };
      return { success: false, message: `Cannot activate silent running on ${shipId}. Check: defend slot available? SR in inventory? Ship alive and not already under SR?` };
    }

    case 'use_acoustic_cloak': {
      const result = gc.useAcousticCloak();
      if (result) return { success: true, message: 'Acoustic cloak deployed. All ships masked from recon for 2 opponent turns.' };
      return { success: false, message: 'Cannot deploy acoustic cloak. Check: defend slot available? Cloak in inventory? Not already active?' };
    }

    case 'end_turn': {
      const result = gc.endTurn();
      if (result) return { success: true, message: 'Turn ended.', turnOver: true };
      return { success: false, message: 'Cannot end turn. You must use your attack slot first (fire torpedo, recon drone, depth charge, or G-SONAR).' };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

// ---------------------------------------------------------------------------
// Agent turn — one Claude API conversation for one player's turn
// ---------------------------------------------------------------------------

async function executeAgentTurn(
  gc: GameController,
  turnMessages: Array<{ alpha: Anthropic.MessageParam[]; bravo: Anthropic.MessageParam[] }>,
  systemPrompt: string,
  stalemateBonusAwarded: boolean = false,
): Promise<void> {
  const state = gc.getState();
  const playerIdx = state.currentPlayer;
  const designation = playerIdx === 0 ? 'ALPHA' : 'BRAVO';
  const msgKey = playerIdx === 0 ? 'alpha' : 'bravo';

  const briefing = buildTurnBriefing(gc, stalemateBonusAwarded);

  if (verbose) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  TURN ${state.turnCount} — COMMANDER ${designation}`);
    console.log(`${'─'.repeat(56)}`);
  }

  // Keep only last 3 turns of history per player to bound context size
  const recentHistory = turnMessages.slice(-3);
  const playerHistory = recentHistory.flatMap(t => t[msgKey]);

  const messages: Anthropic.MessageParam[] = [
    ...playerHistory,
    { role: 'user', content: briefing },
  ];

  let turnOver = false;
  let apiCalls = 0;
  const maxApiCalls = 8; // safety limit per turn

  while (!turnOver && apiCalls < maxApiCalls && gc.getState().phase === GamePhase.Combat) {
    apiCalls++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      tools: gameTools,
      messages,
    });

    // Process response content
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Extract any text reasoning
    for (const block of assistantContent) {
      if (block.type === 'text' && verbose) {
        console.log(`  ${designation}: ${block.text}`);
      }
    }

    // Process tool calls
    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      // Claude didn't use any tools — might need prompting
      messages.push({ role: 'user', content: 'Act now. Use tools — do not narrate.' });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue;

      const result = executeTool(gc, toolUse.name, toolUse.input as Record<string, unknown>);

      if (verbose) {
        const icon = result.success ? '✓' : '✗';
        console.log(`  ${icon} ${toolUse.name}(${JSON.stringify(toolUse.input)}) → ${result.message}`);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.message,
        is_error: !result.success,
      });

      if (result.turnOver) turnOver = true;

      // Check for victory mid-turn
      if (gc.getState().phase === GamePhase.Victory) {
        turnOver = true;
        break;
      }
    }

    messages.push({ role: 'user', content: toolResults });

    // If turn ended or game over, break
    if (turnOver) break;
  }

  if (apiCalls >= maxApiCalls && !turnOver) {
    console.warn(`  ⚠ ${designation} hit API call limit (${maxApiCalls}). Force-ending turn.`);
    // Force a torpedo on a random empty cell to end the turn
    if (!gc.getTurnSlots().attackUsed) {
      for (let col = 0; col < GRID_SIZE; col++) {
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let depth = 0; depth < GRID_SIZE; depth++) {
            const result = gc.fireTorpedo({ col, row, depth });
            if (result) { break; }
          }
          if (gc.getTurnSlots().attackUsed) break;
        }
        if (gc.getTurnSlots().attackUsed) break;
      }
    }
    gc.endTurn();
  }

  // Store a minimal turn summary for short-term continuity (not the full briefing)
  const lastActions = messages
    .filter(m => m.role === 'user' && Array.isArray(m.content))
    .flatMap(m => (m.content as Anthropic.ToolResultBlockParam[]))
    .filter(b => b.type === 'tool_result' && !b.is_error)
    .map(b => b.content)
    .join('; ');
  const turnRecord = { alpha: [] as Anthropic.MessageParam[], bravo: [] as Anthropic.MessageParam[] };
  turnRecord[msgKey] = [
    { role: 'user' as const, content: `[Turn ${state.turnCount} summary] ${lastActions || 'no actions'}` },
    { role: 'assistant' as const, content: 'Acknowledged.' },
  ];
  turnMessages.push(turnRecord);
}

// ---------------------------------------------------------------------------
// Post-game reflection — agents update their persistent memory
// ---------------------------------------------------------------------------

async function reflectAndUpdateMemory(
  playerKey: PlayerKey,
  designation: string,
  gameState: ReturnType<GameController['getState']>,
  existingMemory: string | null,
): Promise<void> {
  const pi = playerKey === 'alpha' ? 0 : 1;
  const opp = playerKey === 'alpha' ? 1 : 0;
  const p = gameState.players[pi]!;
  const o = gameState.players[opp]!;
  const won = gameState.winner === pi;
  const hitRate = p.shotsFired > 0 ? ((p.shotsHit / p.shotsFired) * 100).toFixed(1) : '0.0';
  const oppHitRate = o.shotsFired > 0 ? ((o.shotsHit / o.shotsFired) * 100).toFixed(1) : '0.0';

  const memoryContext = existingMemory
    ? `YOUR EXISTING STRATEGIC MEMORY (from previous games):\n${existingMemory}`
    : 'This is your FIRST game — you have no prior memory.';

  console.log(`  ${designation} reflection: outcome=${won ? 'WON' : 'LOST'} (winner=${gameState.winner}, pi=${pi})`);

  const reflectionPrompt = `You just finished a game of CONTACT (3D submarine warfare). Reflect on the game and produce a strategic memory document.

GAME RESULTS:
- Outcome: *** YOU ${won ? 'WON' : 'LOST'} ***
- Game ended on turn ${gameState.turnCount}
- Your stats: ${p.shotsFired} shots, ${p.shotsHit} hits (${hitRate}%), ${p.shipsSunk} ships sunk, ${p.perksUsed} perks used, ${p.credits} CR remaining
- Opponent stats: ${o.shotsFired} shots, ${o.shotsHit} hits (${oppHitRate}%), ${o.shipsSunk} ships sunk, ${o.perksUsed} perks used
- REMINDER: You ${won ? 'WON this game. Your strategy worked — analyze what went RIGHT and preserve those lessons.' : 'LOST this game. Analyze what went WRONG and how to improve.'}

${memoryContext}

Write a REPLACEMENT strategic memory document (not an append). This document will be loaded before your next game to help you play better.

RULES FOR THE DOCUMENT:
- Maximum 2000 characters — be concise
- Use second person: "You should...", "Avoid...", "Remember..."
- Focus on ACTIONABLE tactical advice, not game narration
- Include insights about: opening strategy, credit management, recon vs attack balance, defensive perk timing, ship hunting patterns, common mistakes to avoid
- If you have existing memory, integrate what still seems valid and update/remove what doesn't
- Prioritize lessons that changed your understanding over obvious advice`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: reflectionPrompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('\n');

  saveMemory(playerKey, text);
  console.log(`  ${designation} memory updated (${Math.min(text.length, MEMORY_MAX_CHARS)} chars)`);
}

// ---------------------------------------------------------------------------
// Game runner
// ---------------------------------------------------------------------------

async function runGame(): Promise<void> {
  const rankLabel = RANK_CONFIGS[rank].label;
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  CONTACT — CLAUDE vs CLAUDE                           ║`);
  console.log(`║  Rank: ${rankLabel.padEnd(47)}║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  const gc = new GameController(undefined, rank);

  // Setup both fleets (random placement for now)
  console.log('Setting up ALPHA fleet...');
  placeFleetRandomly(gc);
  gc.confirmSetup();

  console.log('Setting up BRAVO fleet...');
  placeFleetRandomly(gc);
  gc.confirmSetup();

  console.log(`\nCombat begins. 7 ships each, 343 cells. Fight!\n`);

  // Load persistent memory and build per-agent system prompts
  const alphaMemory = noMemory ? null : loadMemory('alpha');
  const bravoMemory = noMemory ? null : loadMemory('bravo');

  function buildSystemPrompt(memory: string | null): string {
    if (!memory) return SYSTEM_PROMPT;
    return `${SYSTEM_PROMPT}\n\n═══════════════════════════════════════════════════\nSTRATEGIC MEMORY — LESSONS FROM PREVIOUS GAMES\n═══════════════════════════════════════════════════\n${memory}`;
  }

  const alphaSystemPrompt = buildSystemPrompt(alphaMemory);
  const bravoSystemPrompt = buildSystemPrompt(bravoMemory);

  if (!noMemory) {
    console.log(`Memory: ALPHA ${alphaMemory ? `(${alphaMemory.length} chars)` : '(none)'}, BRAVO ${bravoMemory ? `(${bravoMemory.length} chars)` : '(none)'}`);
  }

  const turnMessages: Array<{ alpha: Anthropic.MessageParam[]; bravo: Anthropic.MessageParam[] }> = [];
  let safety = 0;
  let nextTurnStalemateBonus = false;

  while (gc.getState().phase === GamePhase.Combat && safety < 200) {
    const currentSystemPrompt = gc.getState().currentPlayer === 0 ? alphaSystemPrompt : bravoSystemPrompt;
    await executeAgentTurn(gc, turnMessages, currentSystemPrompt, nextTurnStalemateBonus);

    // Check rank bonus — if awarded, the NEXT player's turn should be informed
    const bonus = gc.getLastRankBonus();
    if (bonus) {
      nextTurnStalemateBonus = true;
      if (verbose) {
        const p = bonus.player === 0 ? 'ALPHA' : 'BRAVO';
        console.log(`  ⤷ STALEMATE BONUS: ${p} +${bonus.amount} CR`);
      }
    } else {
      nextTurnStalemateBonus = false;
    }

    safety++;
  }

  // Results
  const state = gc.getState();
  const winner = state.winner;
  const winnerName = winner === 0 ? 'ALPHA' : 'BRAVO';

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  VICTORY: COMMANDER ${winnerName.padEnd(35)}║`);
  console.log(`║  Game ended on turn ${String(state.turnCount).padEnd(34)}║`);
  console.log(`╠════════════════════════════════════════════════════════╣`);

  for (const pi of [0, 1] as PlayerIndex[]) {
    const p = state.players[pi];
    const name = pi === 0 ? 'ALPHA' : 'BRAVO';
    const hitRate = p.shotsFired > 0 ? ((p.shotsHit / p.shotsFired) * 100).toFixed(1) : '0.0';
    console.log(`║  ${name}: ${p.shotsFired} shots, ${p.shotsHit} hits (${hitRate}%), ${p.shipsSunk} sunk  ${' '.repeat(Math.max(0, 12 - hitRate.length))}║`);
    console.log(`║         Credits: ${p.credits} CR remaining, ${p.perksUsed} perks used${' '.repeat(Math.max(0, 16 - String(p.credits).length))}║`);
  }
  console.log(`╚════════════════════════════════════════════════════════╝`);

  // Post-game reflection — both agents update their memory in parallel
  if (!noMemory) {
    console.log('\nReflecting on game...');
    await Promise.all([
      reflectAndUpdateMemory('alpha', 'ALPHA', state, alphaMemory),
      reflectAndUpdateMemory('bravo', 'BRAVO', state, bravoMemory),
    ]);
  }

  // Export JSONL if requested
  if (exportJsonl) {
    const logger = getLogger();
    const jsonl = serializeSession(logger.getBuffer());
    const filename = `contact-agent-${logger.getSessionId()}.jsonl`;
    fs.writeFileSync(filename, jsonl + '\n');
    console.log(`\nExported ${logger.getBuffer().length} events → ${filename}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

runGame().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
