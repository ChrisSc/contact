#!/usr/bin/env npx tsx

/**
 * agent-play.ts — Claude vs Claude submarine warfare.
 *
 * Two Claude instances command opposing submarine fleets in a 7x7x7 volumetric
 * grid. Each agent receives a structured view of its game state and chooses
 * actions via tool use — no random heuristics, pure strategic reasoning.
 *
 * Usage:
 *   npx tsx scripts/agent-play.ts [--verbose] [--rank recruit|enlisted|officer] [--export]
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
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
let rank: Rank = 'officer';
const rankIdx = args.indexOf('--rank');
if (rankIdx !== -1 && args[rankIdx + 1]) {
  const val = args[rankIdx + 1] as string;
  if (val === 'recruit' || val === 'enlisted' || val === 'officer') rank = val;
  else { console.error(`Invalid rank: ${val}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

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
  lines.push('Each depth layer D1-D7 is a 7x7 grid. Columns A-G, Rows 1-7.');
  lines.push('Legend: · = unknown, + = sonar/drone positive, - = sonar/drone negative, X = hit, O = miss, S = sunk');
  lines.push('');

  for (let depth = 0; depth < GRID_SIZE; depth++) {
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

function serializeOwnGrid(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.ownGrid;
  const lines: string[] = [];

  lines.push('YOUR OWN GRID (your ships and incoming damage):');
  lines.push('Legend: · = empty, # = your ship, D = decoy, X = hit on your ship, O = enemy miss, S = sunk segment, d = decoy hit');
  lines.push('');

  for (let depth = 0; depth < GRID_SIZE; depth++) {
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

function buildTurnBriefing(gc: GameController): string {
  const state = gc.getState();
  const designation = state.currentPlayer === 0 ? 'ALPHA' : 'BRAVO';

  const sections = [
    `═══════════════════════════════════════════════════`,
    `TURN ${state.turnCount} — COMMANDER ${designation}`,
    `═══════════════════════════════════════════════════`,
    '',
    serializeTurnSlots(gc),
    '',
    serializeInventory(gc),
    '',
    serializeFleetStatus(gc),
    '',
    serializeEnemyStatus(gc),
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

const SYSTEM_PROMPT = `You are COMMANDER CLAUDE, an elite submarine warfare tactician playing CONTACT — a 3D Battleship variant on a 7×7×7 volumetric grid (343 cells).

MISSION: Locate and destroy all 7 enemy submarines hidden in the grid.

COORDINATE SYSTEM: Coordinates are "Column-Row-Depth" format, 1-indexed.
- Columns: A-G (left to right)
- Rows: 1-7 (top to bottom)
- Depth: D1-D7 (shallow to deep)
- Example: "C-3-D2" = column C, row 3, depth layer 2

FLEET (both sides have identical compositions):
- Typhoon (5 cells), Akula (4), Seawolf (3), Virginia (3), Narwhal (3), Midget Sub (2), Piranha (2)
- Total: 7 ships, 22 cells out of 343

TURN STRUCTURE — you have 3 independent action slots per turn:
1. PING SLOT (free): Use a sonar ping if you have one in inventory
2. ATTACK SLOT (required): Fire torpedo OR use recon drone OR depth charge OR G-SONAR
3. DEFEND SLOT (free): Deploy radar jammer OR silent running OR acoustic cloak
- You can also purchase perks at any time (no slot cost)
- You MUST use your attack slot before ending your turn

STRATEGY GUIDANCE:
- Early game: Buy sonar pings (3 CR) to scout cheaply. Fire torpedoes at spread-out positions.
- When you get a hit (+): Focus fire on adjacent cells to trace the ship's axis.
- Ships are placed along 8 axes (horizontal, vertical, diagonal). Use hit patterns to deduce orientation.
- Sonar positive (+) means a ship exists somewhere in the 2x2x2 volume — narrow it down.
- Save up for recon drone (10 CR) when you have a promising area.
- Depth charges (25 CR) are devastating when you have clustered hits — use them to finish ships.
- Deploy defensive perks proactively: jammer when expecting enemy recon, cloak to protect the fleet.
- Silent Running masks recon but NOT damage — use it on your most valuable surviving ship.

CRITICAL RULES:
- You cannot fire on cells already marked as Hit (X), Miss (O), or Sunk (S).
- You CAN fire on cells marked as sonar/drone positive (+) or negative (-).
- Consecutive hits earn bonus credits (+8 CR). Sinking a ship earns +15 CR.
- Think strategically about credit management — expensive perks can be game-changing.

Play to WIN. Be aggressive with attacks, smart with recon, and protective of your fleet.`;

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

function executeTool(gc: GameController, toolName: string, input: Record<string, unknown>): ToolResult {
  switch (toolName) {
    case 'purchase_perk': {
      const perkId = input.perk_id as PerkId;
      const result = gc.purchasePerk(perkId);
      if (result) {
        const player = gc.getCurrentPlayer();
        return { success: true, message: `Purchased ${perkId}. Credits remaining: ${player.credits} CR` };
      }
      return { success: false, message: `Cannot purchase ${perkId}. Check credits and availability.` };
    }

    case 'use_sonar_ping': {
      const coord = parseCoordinate(input.coordinate as string);
      if (!coord) return { success: false, message: `Invalid coordinate: ${input.coordinate}` };
      const result = gc.useSonarPing(coord);
      if (result) {
        const positives = result.cells.filter(c => c.displayedResult).length;
        const total = result.cells.length;
        return { success: true, message: `Sonar ping at ${input.coordinate}: ${positives}/${total} cells positive.${result.jammed ? ' (WARNING: result may have been jammed!)' : ''}` };
      }
      return { success: false, message: `Cannot use sonar ping. Check: ping slot available? Sonar ping in inventory?` };
    }

    case 'fire_torpedo': {
      const coord = parseCoordinate(input.coordinate as string);
      if (!coord) return { success: false, message: `Invalid coordinate: ${input.coordinate}` };
      const result = gc.fireTorpedo(coord);
      if (result) {
        let msg = `Torpedo at ${input.coordinate}: ${result.result.toUpperCase()}`;
        if (result.result === 'sunk') msg += ` — ${result.shipId} destroyed!`;
        if (result.creditsAwarded) msg += ` (+${result.creditsAwarded} CR)`;
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot fire torpedo at ${input.coordinate}. Cell may already be resolved or attack slot already used.` };
    }

    case 'use_recon_drone': {
      const coord = parseCoordinate(input.coordinate as string);
      if (!coord) return { success: false, message: `Invalid coordinate: ${input.coordinate}` };
      const result = gc.useReconDrone(coord);
      if (result) {
        const contacts = result.cells.filter(c => c.written && c.displayedResult).length;
        return { success: true, message: `Recon drone at ${input.coordinate}: ${contacts} contacts detected in 3x3x3 volume.` };
      }
      return { success: false, message: `Cannot deploy recon drone. Check: attack slot available? Drone in inventory?` };
    }

    case 'use_depth_charge': {
      const coord = parseCoordinate(input.coordinate as string);
      if (!coord) return { success: false, message: `Invalid coordinate: ${input.coordinate}` };
      const result = gc.useDepthCharge(coord);
      if (result) {
        const hits = result.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk').length;
        let msg = `Depth charge at ${input.coordinate}: ${hits} hits`;
        if (result.shipsSunk.length > 0) msg += `, ${result.shipsSunk.length} ships sunk (${result.shipsSunk.join(', ')})`;
        msg += ` (+${result.totalCreditsAwarded} CR)`;
        return { success: true, message: msg };
      }
      return { success: false, message: `Cannot deploy depth charge. Check: attack slot available? Depth charge in inventory?` };
    }

    case 'use_g_sonar': {
      const depthInput = input.depth as number;
      const depth = depthInput - 1; // Convert 1-indexed to 0-indexed
      const result = gc.useGSonar(depth);
      if (result) {
        const contacts = result.cells.filter(c => c.written && c.displayedResult).length;
        return { success: true, message: `G-SONAR at depth D${depthInput}: ${contacts} contacts across the entire layer.` };
      }
      return { success: false, message: `Cannot deploy G-SONAR. Check: attack slot available? G-SONAR in inventory?` };
    }

    case 'use_radar_jammer': {
      const result = gc.useRadarJammer();
      if (result) return { success: true, message: 'Radar jammer deployed. Will distort next enemy sonar/drone scan.' };
      return { success: false, message: 'Cannot deploy radar jammer. Check: defend slot available? Jammer in inventory? Already active?' };
    }

    case 'use_silent_running': {
      const shipId = input.ship_id as string;
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
): Promise<void> {
  const state = gc.getState();
  const playerIdx = state.currentPlayer;
  const designation = playerIdx === 0 ? 'ALPHA' : 'BRAVO';
  const msgKey = playerIdx === 0 ? 'alpha' : 'bravo';

  const briefing = buildTurnBriefing(gc);

  if (verbose) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  TURN ${state.turnCount} — COMMANDER ${designation}`);
    console.log(`${'─'.repeat(56)}`);
  }

  // Build messages: carry forward this player's conversation history for continuity
  const playerHistory = turnMessages.length > 0
    ? turnMessages.flatMap(t => t[msgKey])
    : [];

  const messages: Anthropic.MessageParam[] = [
    ...playerHistory,
    { role: 'user', content: briefing },
  ];

  let turnOver = false;
  let apiCalls = 0;
  const maxApiCalls = 15; // safety limit per turn

  while (!turnOver && apiCalls < maxApiCalls && gc.getState().phase === GamePhase.Combat) {
    apiCalls++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
      messages.push({ role: 'user', content: 'You must take an action. Use your available tools to make your move. Remember: you MUST use your attack slot (fire torpedo, recon drone, depth charge, or G-SONAR) before ending your turn.' });
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

  // Store this turn's messages for continuity
  const turnRecord = { alpha: [] as Anthropic.MessageParam[], bravo: [] as Anthropic.MessageParam[] };
  // Only store the briefing + final summary to keep context manageable
  turnRecord[msgKey] = [
    { role: 'user', content: briefing },
    { role: 'assistant', content: `Turn ${state.turnCount} complete.` },
  ];
  turnMessages.push(turnRecord);
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

  const turnMessages: Array<{ alpha: Anthropic.MessageParam[]; bravo: Anthropic.MessageParam[] }> = [];
  let safety = 0;

  while (gc.getState().phase === GamePhase.Combat && safety < 200) {
    await executeAgentTurn(gc, turnMessages);

    // Check rank bonus
    const bonus = gc.getLastRankBonus();
    if (bonus && verbose) {
      const p = bonus.player === 0 ? 'ALPHA' : 'BRAVO';
      console.log(`  ⤷ STALEMATE BONUS: ${p} +${bonus.amount} CR`);
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
