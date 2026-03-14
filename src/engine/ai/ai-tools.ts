/**
 * ai-tools.ts — Tool definitions and execution for Claude AI agents.
 *
 * Shared between the browser AI opponent and the CLI agent-play script.
 * Pure game logic — no DOM, no SDK dependencies.
 */

import type { GameController } from '../game';
import type { PerkId } from '../../types/abilities';
import type { Coordinate } from '../../types/grid';
import { CellState, GRID_SIZE } from '../../types/grid';
import { getCell, formatCoordinate, parseCoordinate } from '../grid';

// ---------------------------------------------------------------------------
// Tool definitions for Claude
// ---------------------------------------------------------------------------

export interface AIToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const gameTools: AIToolDefinition[] = [
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
    description: 'Fire a torpedo at a single cell. Uses the ATTACK slot. This is your primary weapon — hit=1 CR, consecutive hit=+3 CR, sink=+15 CR.',
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
// Tool execution — maps Claude tool calls to GameController methods
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  message: string;
  turnOver?: boolean;
}

function safeParseCoordinate(input: Record<string, unknown>): Coordinate | null {
  const raw = input.coordinate;
  if (typeof raw !== 'string') return null;
  return parseCoordinate(raw);
}

export function executeTool(gc: GameController, toolName: string, input: Record<string, unknown>): ToolResult {
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

/**
 * Force-end an AI turn when it hits the safety limit.
 * Fires a torpedo at the first available cell, then ends the turn.
 */
export function forceEndTurn(gc: GameController): void {
  if (!gc.getTurnSlots().attackUsed) {
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          const result = gc.fireTorpedo({ col, row, depth });
          if (result) break;
        }
        if (gc.getTurnSlots().attackUsed) break;
      }
      if (gc.getTurnSlots().attackUsed) break;
    }
  }
  gc.endTurn();
}
