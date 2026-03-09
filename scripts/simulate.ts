#!/usr/bin/env npx tsx

/**
 * simulate.ts — Run full CONTACT game simulations with bot players.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts [numGames] [--verbose] [--export]
 *
 * Each bot:
 *   - Places fleet randomly across all 8 axes in the 7x7x7 grid
 *   - Buys perks when credits allow (priority: sonar > jammer > cloak > drone > SR > g-sonar > depth charge)
 *   - Deploys defensive perks (jammer, cloak, silent running on most valuable surviving ship)
 *   - Uses sonar pings on random unresolved cells
 *   - Fires torpedoes with hunt/target logic (prioritize positive scan results, then adjacents of hits)
 *   - Uses recon drones, g-sonar, and depth charges situationally
 */

import * as fs from 'fs';
import * as path from 'path';
import { GameController } from '../src/engine/game';
import { FLEET_ROSTER, PLACEMENT_AXES } from '../src/types/fleet';
import type { FleetRosterEntry, PlacementAxis } from '../src/types/fleet';
import type { Coordinate } from '../src/types/grid';
import { CellState, GRID_SIZE } from '../src/types/grid';
import { GamePhase } from '../src/types/game';
import type { PlayerIndex } from '../src/types/game';
import type { PerkId } from '../src/types/abilities';
import { getCell } from '../src/engine/grid';
import { getLogger } from '../src/observability/logger';
import { serializeSession } from '../src/observability/export';

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function randomCoord(): Coordinate {
  return { col: randInt(GRID_SIZE), row: randInt(GRID_SIZE), depth: randInt(GRID_SIZE) };
}

// ---------------------------------------------------------------------------
// Bot: Fleet placement
// ---------------------------------------------------------------------------

function placeFleetRandomly(gc: GameController): void {
  for (const entry of FLEET_ROSTER) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 2000) {
      const origin = randomCoord();
      const axis = PLACEMENT_AXES[randInt(PLACEMENT_AXES.length)]!;
      placed = gc.placeShipForCurrentPlayer(entry, origin, axis);
      attempts++;
    }
    if (!placed) {
      throw new Error(`Failed to place ${entry.name} after 2000 attempts`);
    }
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
// Bot: Targeting intelligence
// ---------------------------------------------------------------------------

interface TargetingState {
  unresolved: Coordinate[];
  positiveScans: Coordinate[];   // DronePositive or SonarPositive
  huntTargets: Coordinate[];     // Adjacent to hits, not yet fired on
}

function getTargetingState(gc: GameController): TargetingState {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;

  const unresolved: Coordinate[] = [];
  const positiveScans: Coordinate[] = [];
  const huntTargets: Coordinate[] = [];
  const hitCoords: Coordinate[] = [];

  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let depth = 0; depth < GRID_SIZE; depth++) {
        const coord = { col, row, depth };
        const cell = getCell(grid, coord);
        if (!cell) continue;

        switch (cell.state) {
          case CellState.Empty:
            unresolved.push(coord);
            break;
          case CellState.DronePositive:
          case CellState.SonarPositive:
            positiveScans.push(coord);
            break;
          case CellState.Hit:
            hitCoords.push(coord);
            break;
          case CellState.DroneNegative:
          case CellState.SonarNegative:
            unresolved.push(coord); // Can still fire on these
            break;
        }
      }
    }
  }

  // Build hunt targets: neighbors of hits that haven't been resolved
  const resolvedSet = new Set<string>();
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let depth = 0; depth < GRID_SIZE; depth++) {
        const cell = getCell(grid, { col, row, depth });
        if (cell && cell.state !== CellState.Empty &&
            cell.state !== CellState.DronePositive &&
            cell.state !== CellState.SonarPositive &&
            cell.state !== CellState.DroneNegative &&
            cell.state !== CellState.SonarNegative) {
          resolvedSet.add(`${col},${row},${depth}`);
        }
      }
    }
  }

  const deltas = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const hit of hitCoords) {
    for (const [dc, dr, dd] of deltas) {
      const n = { col: hit.col + dc!, row: hit.row + dr!, depth: hit.depth + dd! };
      if (n.col >= 0 && n.col < GRID_SIZE &&
          n.row >= 0 && n.row < GRID_SIZE &&
          n.depth >= 0 && n.depth < GRID_SIZE &&
          !resolvedSet.has(`${n.col},${n.row},${n.depth}`)) {
        huntTargets.push(n);
      }
    }
  }

  return { unresolved, positiveScans, huntTargets };
}

function pickTarget(ts: TargetingState): Coordinate {
  // Priority: positive scans > hunt targets > random unresolved
  if (ts.positiveScans.length > 0) {
    return ts.positiveScans[randInt(ts.positiveScans.length)]!;
  }
  if (ts.huntTargets.length > 0) {
    return ts.huntTargets[randInt(ts.huntTargets.length)]!;
  }
  return ts.unresolved[randInt(ts.unresolved.length)]!;
}

// ---------------------------------------------------------------------------
// Bot: Perk purchasing strategy
//
// Phase-based spending: early game buys cheap intel/defense, mid-game saves
// for recon drone and g-sonar, late-game saves for depth charge.
// ---------------------------------------------------------------------------

function buyPerks(gc: GameController): PerkId[] {
  const bought: PerkId[] = [];
  const player = gc.getCurrentPlayer();
  const opponent = gc.getOpponent();
  let credits = player.credits;
  const shipsSunk = player.shipsSunk;
  const hasReconInInventory = player.inventory.some(p => p.perkId === 'recon_drone');
  const hasDCInInventory = player.inventory.some(p => p.perkId === 'depth_charge');
  const hasGSonarInInventory = player.inventory.some(p => p.perkId === 'g_sonar');
  const opponentShipsRemaining = opponent.ships.filter(s => !s.sunk).length;

  // Saving targets — reserve credits for big purchases when they make sense
  const wantRecon = shipsSunk >= 1 && !hasReconInInventory;
  const wantGSonar = shipsSunk >= 2 && !hasGSonarInInventory;
  const wantDC = shipsSunk >= 2 && !hasDCInInventory && opponentShipsRemaining >= 2;

  // Determine what we're saving for (highest priority first)
  let savingFor: PerkId | null = null;
  if (wantDC && credits >= 15) savingFor = 'depth_charge';
  else if (wantGSonar && credits >= 10) savingFor = 'g_sonar';
  else if (wantRecon && credits >= 5) savingFor = 'recon_drone';

  // Try to buy the target perk first
  if (savingFor) {
    const cost = getCost(savingFor);
    if (credits >= cost) {
      const result = gc.purchasePerk(savingFor);
      if (result) {
        credits -= cost;
        bought.push(savingFor);
        savingFor = null; // Got it, no longer saving
      }
    }
  }

  // Spend remaining credits on cheap perks, but keep a reserve if saving
  const reserve = savingFor ? getCost(savingFor) * 0.6 : 0;

  const cheapPerks: PerkId[] = ['sonar_ping', 'radar_jammer', 'acoustic_cloak', 'silent_running'];
  for (const perkId of cheapPerks) {
    const cost = getCost(perkId);
    if (credits - cost >= reserve && Math.random() < 0.6) {
      const result = gc.purchasePerk(perkId);
      if (result) {
        credits -= cost;
        bought.push(perkId);
      }
    }
  }

  return bought;
}

function getCost(perkId: PerkId): number {
  const costs: Record<PerkId, number> = {
    sonar_ping: 3, recon_drone: 10, depth_charge: 25, g_sonar: 18,
    radar_jammer: 5, silent_running: 10, acoustic_cloak: 6,
  };
  return costs[perkId];
}

// ---------------------------------------------------------------------------
// Bot: Turn execution
// ---------------------------------------------------------------------------

interface TurnLog {
  player: PlayerIndex;
  turn: number;
  perksBought: PerkId[];
  perksUsed: PerkId[];
  action: 'torpedo' | 'recon_drone' | 'depth_charge' | 'g_sonar';
  result?: string;
}

function executeTurn(gc: GameController, verbose: boolean): TurnLog {
  const state = gc.getState();
  const playerIdx = state.currentPlayer;
  const turn = state.turnCount;
  const perksUsed: PerkId[] = [];

  // 1. Buy perks
  const perksBought = buyPerks(gc);

  // 2. Deploy defensive perks (free actions)
  const player = gc.getCurrentPlayer();

  // Radar jammer
  const hasJammer = player.inventory.some(p => p.perkId === 'radar_jammer');
  if (hasJammer && !player.abilities.radar_jammer.active) {
    if (gc.useRadarJammer()) perksUsed.push('radar_jammer');
  }

  // Acoustic cloak
  const hasCloak = player.inventory.some(p => p.perkId === 'acoustic_cloak');
  if (hasCloak && !player.abilities.acoustic_cloak.active && !gc.getTurnSlots().defendUsed) {
    if (gc.useAcousticCloak()) perksUsed.push('acoustic_cloak');
  }

  // Silent running on most valuable surviving ship
  const hasSR = player.inventory.some(p => p.perkId === 'silent_running');
  if (hasSR && !gc.getTurnSlots().defendUsed) {
    const ships = player.ships
      .filter(s => !s.sunk)
      .sort((a, b) => b.size - a.size);
    for (const ship of ships) {
      if (gc.useSilentRunning(ship.id)) {
        perksUsed.push('silent_running');
        break;
      }
    }
  }

  // 3. Use sonar ping if available (free/ping slot)
  const hasPing = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'sonar_ping');
  if (hasPing && !gc.getTurnSlots().pingUsed) {
    const ts = getTargetingState(gc);
    if (ts.unresolved.length > 0) {
      const target = ts.unresolved[randInt(ts.unresolved.length)]!;
      const pingResult = gc.useSonarPing(target);
      if (pingResult) perksUsed.push('sonar_ping');
    }
  }

  // 4. Choose attack action
  let action: TurnLog['action'] = 'torpedo';
  let actionResult = '';
  const ts = getTargetingState(gc);

  // Try depth charge if we have one and there are hunt targets (known hits nearby)
  const hasDC = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'depth_charge');
  if (hasDC && ts.huntTargets.length >= 2) {
    // Center on a hunt target cluster
    const center = ts.huntTargets[randInt(ts.huntTargets.length)]!;
    const dcResult = gc.useDepthCharge(center);
    if (dcResult) {
      action = 'depth_charge';
      perksUsed.push('depth_charge');
      const hits = dcResult.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk').length;
      actionResult = `${hits} hits, ${dcResult.shipsSunk.length} sunk`;
    }
  }

  // Try g-sonar if we have one and haven't attacked yet
  if (!gc.getTurnSlots().attackUsed) {
    const hasGSonar = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'g_sonar');
    if (hasGSonar) {
      const depth = randInt(GRID_SIZE);
      const gResult = gc.useGSonar(depth);
      if (gResult) {
        action = 'g_sonar';
        perksUsed.push('g_sonar');
        const contacts = gResult.cells.filter(c => c.written && c.displayedResult).length;
        actionResult = `depth ${depth + 1}: ${contacts} contacts`;
      }
    }
  }

  // Try recon drone if we have one and haven't attacked yet
  if (!gc.getTurnSlots().attackUsed) {
    const hasDrone = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'recon_drone');
    if (hasDrone && ts.unresolved.length > 20) {
      const center = ts.unresolved[randInt(ts.unresolved.length)]!;
      const droneResult = gc.useReconDrone(center);
      if (droneResult) {
        action = 'recon_drone';
        perksUsed.push('recon_drone');
        const contacts = droneResult.cells.filter(c => c.written && c.displayedResult).length;
        actionResult = `${contacts} contacts`;
      }
    }
  }

  // Fall back to torpedo
  if (!gc.getTurnSlots().attackUsed) {
    action = 'torpedo';
    const freshTs = getTargetingState(gc);
    let target = pickTarget(freshTs);
    let fireResult = gc.fireTorpedo(target);

    // Retry if null (already targeted)
    let retries = 0;
    while (!fireResult && retries < 50) {
      target = freshTs.unresolved[randInt(freshTs.unresolved.length)]!;
      fireResult = gc.fireTorpedo(target);
      retries++;
    }

    if (fireResult) {
      actionResult = fireResult.result;
      if (fireResult.result === 'sunk') {
        actionResult += ` (${fireResult.shipId})`;
      }
    }
  }

  // 5. End turn (if game not over)
  if (gc.getState().phase === GamePhase.Combat) {
    gc.endTurn();
  }

  const log: TurnLog = { player: playerIdx, turn, perksBought, perksUsed, action, result: actionResult };

  if (verbose) {
    const p = playerIdx === 0 ? 'ALPHA' : 'BRAVO';
    const bought = perksBought.length ? ` | bought: ${perksBought.join(', ')}` : '';
    const used = perksUsed.length ? ` | used: ${perksUsed.join(', ')}` : '';
    console.log(`  T${String(turn).padStart(3)} ${p} | ${action.padEnd(13)} → ${actionResult}${bought}${used}`);
  }

  return log;
}

// ---------------------------------------------------------------------------
// Simulation runner
// ---------------------------------------------------------------------------

interface GameResult {
  winner: PlayerIndex;
  turns: number;
  turnLogs: TurnLog[];
  stats: [PlayerStats, PlayerStats];
}

interface PlayerStats {
  shotsFired: number;
  shotsHit: number;
  hitRate: number;
  credits: number;
  creditsSpent: number;
  perksBought: Record<PerkId, number>;
  perksUsed: Record<PerkId, number>;
  shipsSunk: number;
}

function emptyPerkCounts(): Record<PerkId, number> {
  return {
    sonar_ping: 0, recon_drone: 0, depth_charge: 0, g_sonar: 0,
    radar_jammer: 0, silent_running: 0, acoustic_cloak: 0,
  };
}

function runGame(verbose: boolean): GameResult {
  const gc = new GameController();

  // Setup both players
  placeFleetRandomly(gc);
  gc.confirmSetup();
  placeFleetRandomly(gc);
  gc.confirmSetup();

  const turnLogs: TurnLog[] = [];
  let safety = 0;

  while (gc.getState().phase === GamePhase.Combat && safety < 1000) {
    const log = executeTurn(gc, verbose);
    turnLogs.push(log);
    safety++;
  }

  const state = gc.getState();
  const winner = state.winner ?? 0;

  // Gather stats
  const stats: [PlayerStats, PlayerStats] = [buildStats(turnLogs, 0), buildStats(turnLogs, 1)];

  // Overlay engine stats
  for (const pi of [0, 1] as PlayerIndex[]) {
    const p = state.players[pi];
    stats[pi].shotsFired = p.shotsFired;
    stats[pi].shotsHit = p.shotsHit;
    stats[pi].hitRate = p.shotsFired > 0 ? p.shotsHit / p.shotsFired : 0;
    stats[pi].shipsSunk = p.shipsSunk;
    stats[pi].credits = p.credits;
  }

  return { winner, turns: state.turnCount, turnLogs, stats };
}

function buildStats(logs: TurnLog[], player: PlayerIndex): PlayerStats {
  const bought = emptyPerkCounts();
  const used = emptyPerkCounts();
  let creditsSpent = 0;

  for (const log of logs) {
    if (log.player !== player) continue;
    for (const p of log.perksBought) {
      bought[p]++;
      creditsSpent += getCost(p);
    }
    for (const p of log.perksUsed) {
      used[p]++;
    }
  }

  return {
    shotsFired: 0, shotsHit: 0, hitRate: 0, credits: 0,
    creditsSpent, perksBought: bought, perksUsed: used, shipsSunk: 0,
  };
}

// ---------------------------------------------------------------------------
// Aggregate metrics & output
// ---------------------------------------------------------------------------

interface AggregateMetrics {
  gamesPlayed: number;
  alphaWins: number;
  bravoWins: number;
  turns: { min: number; max: number; avg: number; median: number };
  hitRate: { alpha: number; bravo: number };
  avgCreditsSpent: { alpha: number; bravo: number };
  perksBought: Record<PerkId, number>;
  perksUsed: Record<PerkId, number>;
  avgShipsSunk: { alpha: number; bravo: number };
}

function aggregate(results: GameResult[]): AggregateMetrics {
  const n = results.length;
  const turns = results.map(r => r.turns).sort((a, b) => a - b);
  const alphaWins = results.filter(r => r.winner === 0).length;

  const totalBought = emptyPerkCounts();
  const totalUsed = emptyPerkCounts();
  let alphaHitRate = 0, bravoHitRate = 0;
  let alphaSpent = 0, bravoSpent = 0;
  let alphaSunk = 0, bravoSunk = 0;

  for (const r of results) {
    alphaHitRate += r.stats[0].hitRate;
    bravoHitRate += r.stats[1].hitRate;
    alphaSpent += r.stats[0].creditsSpent;
    bravoSpent += r.stats[1].creditsSpent;
    alphaSunk += r.stats[0].shipsSunk;
    bravoSunk += r.stats[1].shipsSunk;

    for (const pi of [0, 1] as PlayerIndex[]) {
      for (const [k, v] of Object.entries(r.stats[pi].perksBought)) {
        totalBought[k as PerkId] += v;
      }
      for (const [k, v] of Object.entries(r.stats[pi].perksUsed)) {
        totalUsed[k as PerkId] += v;
      }
    }
  }

  return {
    gamesPlayed: n,
    alphaWins,
    bravoWins: n - alphaWins,
    turns: {
      min: turns[0]!,
      max: turns[turns.length - 1]!,
      avg: turns.reduce((a, b) => a + b, 0) / n,
      median: turns[Math.floor(n / 2)]!,
    },
    hitRate: { alpha: alphaHitRate / n, bravo: bravoHitRate / n },
    avgCreditsSpent: { alpha: alphaSpent / n, bravo: bravoSpent / n },
    perksBought: totalBought,
    perksUsed: totalUsed,
    avgShipsSunk: { alpha: alphaSunk / n, bravo: bravoSunk / n },
  };
}

function printResults(metrics: AggregateMetrics): void {
  const bar = '═'.repeat(56);
  console.log();
  console.log(`╔${bar}╗`);
  console.log(`║  CONTACT — SIMULATION RESULTS                        ║`);
  console.log(`╠${bar}╣`);

  console.log(`║  Games played:  ${String(metrics.gamesPlayed).padStart(6)}                             ║`);
  console.log(`╠${bar}╣`);

  // Win rates
  const alphaRate = ((metrics.alphaWins / metrics.gamesPlayed) * 100).toFixed(1);
  const bravoRate = ((metrics.bravoWins / metrics.gamesPlayed) * 100).toFixed(1);
  console.log(`║  WIN RATE                                            ║`);
  console.log(`║    ALPHA: ${String(metrics.alphaWins).padStart(5)} wins  (${alphaRate.padStart(5)}%)                    ║`);
  console.log(`║    BRAVO: ${String(metrics.bravoWins).padStart(5)} wins  (${bravoRate.padStart(5)}%)                    ║`);
  console.log(`╠${bar}╣`);

  // Turn stats
  console.log(`║  GAME LENGTH (turns)                                 ║`);
  console.log(`║    Min: ${String(metrics.turns.min).padStart(5)}   Max: ${String(metrics.turns.max).padStart(5)}                       ║`);
  console.log(`║    Avg: ${metrics.turns.avg.toFixed(1).padStart(5)}   Median: ${String(metrics.turns.median).padStart(5)}                   ║`);
  console.log(`╠${bar}╣`);

  // Hit rates
  console.log(`║  HIT RATE (avg)                                      ║`);
  console.log(`║    ALPHA: ${(metrics.hitRate.alpha * 100).toFixed(1).padStart(5)}%                                   ║`);
  console.log(`║    BRAVO: ${(metrics.hitRate.bravo * 100).toFixed(1).padStart(5)}%                                   ║`);
  console.log(`╠${bar}╣`);

  // Ships sunk
  console.log(`║  SHIPS SUNK (avg per game)                           ║`);
  console.log(`║    ALPHA: ${metrics.avgShipsSunk.alpha.toFixed(1).padStart(5)}                                      ║`);
  console.log(`║    BRAVO: ${metrics.avgShipsSunk.bravo.toFixed(1).padStart(5)}                                      ║`);
  console.log(`╠${bar}╣`);

  // Credits
  console.log(`║  CREDITS SPENT (avg per game per player)             ║`);
  console.log(`║    ALPHA: ${metrics.avgCreditsSpent.alpha.toFixed(0).padStart(5)} CR                                  ║`);
  console.log(`║    BRAVO: ${metrics.avgCreditsSpent.bravo.toFixed(0).padStart(5)} CR                                  ║`);
  console.log(`╠${bar}╣`);

  // Perk usage
  console.log(`║  PERKS PURCHASED (total across all games)            ║`);
  const perkOrder: PerkId[] = ['sonar_ping', 'radar_jammer', 'acoustic_cloak', 'recon_drone', 'silent_running', 'g_sonar', 'depth_charge'];
  for (const perk of perkOrder) {
    const name = perk.replace(/_/g, ' ').toUpperCase();
    const count = metrics.perksBought[perk];
    const used = metrics.perksUsed[perk];
    console.log(`║    ${name.padEnd(18)} bought: ${String(count).padStart(5)}  used: ${String(used).padStart(5)}  ║`);
  }

  console.log(`╚${bar}╝`);
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const exportJsonl = args.includes('--export') || args.includes('-e');
const numGames = parseInt(args.find(a => !a.startsWith('-')) ?? '100', 10);

console.log(`\nRunning ${numGames} simulated games${verbose ? ' (verbose)' : ''}...\n`);

const results: GameResult[] = [];
const startTime = performance.now();

for (let i = 0; i < numGames; i++) {
  if (verbose) {
    console.log(`\n── Game ${i + 1} ${'─'.repeat(44)}`);
  }
  const result = runGame(verbose);
  results.push(result);

  if (exportJsonl) {
    const logger = getLogger();
    const jsonl = serializeSession(logger.getBuffer());
    const filename = `contact-${logger.getSessionId()}.jsonl`;
    fs.writeFileSync(filename, jsonl + '\n');
    if (verbose) {
      console.log(`  → exported ${filename} (${logger.getBuffer().length} events)`);
    }
  }

  if (verbose) {
    const w = result.winner === 0 ? 'ALPHA' : 'BRAVO';
    console.log(`  → ${w} wins in ${result.turns} turns`);
  }

  // Progress for non-verbose
  if (!verbose && numGames >= 20 && (i + 1) % Math.ceil(numGames / 20) === 0) {
    const pct = (((i + 1) / numGames) * 100).toFixed(0);
    process.stdout.write(`  ${pct}%\r`);
  }
}

const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

const metrics = aggregate(results);
printResults(metrics);
console.log(`Completed in ${elapsed}s (${(parseFloat(elapsed) / numGames * 1000).toFixed(1)}ms per game)\n`);
