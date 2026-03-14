/**
 * ai-briefing.ts — State serializers and system prompt for Claude AI agents.
 *
 * Converts game state into structured text briefings that Claude can reason about.
 * Shared between the browser AI opponent and the CLI agent-play script.
 * Pure game logic — no DOM, no SDK dependencies.
 */

import type { GameController } from '../game';
import { CellState, GRID_SIZE, DEPTH_LABELS } from '../../types/grid';
import { PERK_CATALOG } from '../../types/abilities';
import { getCell, formatCoordinate, parseCoordinate } from '../grid';

// ---------------------------------------------------------------------------
// System prompt for Claude agents
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are playing CONTACT — 3D Battleship on a 7×7×7 grid (343 cells). Sink all 7 enemy subs to win.

COORDINATES: "Col-Row-Depth", 1-indexed. Columns A-G, Rows 1-7, Depth D1-D7. Example: "C-3-D2"

FLEET: Typhoon(5), Akula(4), Seawolf(3), Virginia(3), Narwhal(3), Midget Sub(2), Piranha(2) = 22 cells.

TURN SLOTS: Ping(free), Attack(REQUIRED), Defend(free). Purchase perks anytime (no slot). You MUST attack before ending.

RULES:
- Cannot fire on X/O/S cells. CAN fire on +/- cells.
- Hit=+1CR, consecutive hit=+3CR, sink=+15CR.
- Ships are STATIC — once placed, they never move. A confirmed contact remains valid until you torpedo it.
- Ships placed along 8 axes (never purely vertical). Use hit patterns to trace orientation.
- Stalemate bonus gives both players free CR after consecutive dry turns (rank-dependent).

STRATEGY (learned from prior games — follow these):
- OPENING: Cluster initial shots in 3-4 high-probability zones. Form a hypothesis before every shot.
- HUNTING: Confirmed hit = commit 5-7 follow-ups within 2-3 turns. NEVER let a hit go cold. Finish kills before opening new hunts.
- CREDIT SPENDING: Begin perk use by turn 8-10. Prioritize kill-acceleration perks (depth charge, recon drone) over recon when you have a confirmed hit. Spend CR aggressively — unspent credits lose games.
- ACCURACY: Fewer high-confidence shots beats volume guessing. But after turn 150 if tied, shift to precision-plus-pressure.
- DEFENSE: Use defensive perks proactively when opponent lands 2+ hits in the same region.
- WIN CONDITION: Win on ships sunk first, hit differential second. Close games (5-5 ties) are decided by hit count — every marginal decision matters.

BE CONCISE. Do NOT narrate, summarize, or restate the briefing. Act immediately with tool calls. Issue ALL actions for a turn in a single response when possible (e.g. purchase + attack + end_turn together).`;

// ---------------------------------------------------------------------------
// State serializers
// ---------------------------------------------------------------------------

export function serializeTargetingGrid(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;
  const lines: string[] = [];

  lines.push('YOUR TARGETING GRID (what you know about the enemy):');
  lines.push('Legend: · = unknown, + = positive, - = negative, X = hit, O = miss, S = sunk');
  lines.push('Only depth layers with activity are shown. Omitted layers are entirely unexplored.');
  lines.push('');

  for (let depth = 0; depth < GRID_SIZE; depth++) {
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

export function serializeActionableIntel(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;
  const lines: string[] = [];

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
    for (const hitCoord of unsunkHits) {
      const parsed = parseCoordinate(hitCoord);
      if (!parsed) continue;
      const neighbors: string[] = [];
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
      const cell = getCell(grid, parsed);
      const targetable = cell && (cell.state === CellState.SonarPositive || cell.state === CellState.DronePositive);
      if (targetable) {
        lines.push(`    ${posCoord} ← FIRE HERE (confirmed ship presence)`);
      }
    }
  }

  return lines.join('\n');
}

export function serializeOwnGrid(gc: GameController): string {
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

export function serializeFleetStatus(gc: GameController): string {
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

export function serializeEnemyStatus(gc: GameController): string {
  const opponent = gc.getOpponent();
  const lines: string[] = [];

  lines.push('ENEMY FLEET STATUS (what you can observe):');
  const sunkShips = opponent.ships.filter(s => s.sunk);
  const remaining = 7 - sunkShips.length;
  lines.push(`  Ships remaining: ${remaining}/7`);
  if (sunkShips.length > 0) {
    lines.push(`  Confirmed sunk: ${sunkShips.map(s => s.name).join(', ')}`);
  }

  return lines.join('\n');
}

export function serializeInventory(gc: GameController): string {
  const player = gc.getCurrentPlayer();
  const lines: string[] = [];

  lines.push(`CREDITS: ${player.credits} CR`);
  lines.push('');

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

export function serializeTurnSlots(gc: GameController): string {
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

export function serializeRankInfo(gc: GameController): string {
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

export function buildTurnBriefing(gc: GameController, stalemateBonusAwarded: boolean = false): string {
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
