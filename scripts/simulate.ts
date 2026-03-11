#!/usr/bin/env npx tsx

/**
 * simulate.ts — Run full CONTACT game simulations with smart bot players.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts [numGames] [--verbose] [--export] [--rank recruit|enlisted|officer]
 *
 * Each bot uses axis-aware intelligence:
 *   - Places fleet randomly across all 8 axes in the 7x7x7 grid
 *   - Builds intel analysis: clusters unsunk hits, infers ship axes, generates next-targets
 *   - Buys perks deterministically based on intel quality and exploration %
 *   - Deploys defensive perks (jammer, cloak, silent running on most valuable surviving ship)
 *   - Uses sonar pings near hit clusters or maximum-coverage cells
 *   - Fires torpedoes with priority: positive scans > axis extensions > cluster neighbors > parity hunt
 *   - Uses recon drones, g-sonar, and depth charges with scored targeting
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
import type { Rank } from '../src/types/game';
import { RANK_CONFIGS } from '../src/types/game';
import type { PerkId } from '../src/types/abilities';
import { getCell } from '../src/engine/grid';
import { getLogger } from '../src/observability/logger';
import { serializeSession } from '../src/observability/export';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_DELTAS: Record<PlacementAxis, [number, number, number]> = {
  'col':        [1, 0, 0],
  'row':        [0, 1, 0],
  'diag+':      [1, 1, 0],
  'diag-':      [1, -1, 0],
  'col-depth':  [1, 0, 1],
  'col-depth-': [1, 0, -1],
  'row-depth':  [0, 1, 1],
  'row-depth-': [0, 1, -1],
};

const ALL_AXIS_DELTA_VALUES = Object.values(AXIS_DELTAS);

const TOTAL_CELLS = GRID_SIZE * GRID_SIZE * GRID_SIZE; // 343

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

function coordKey(c: Coordinate): string {
  return `${c.col},${c.row},${c.depth}`;
}

function inBounds(c: Coordinate): boolean {
  return c.col >= 0 && c.col < GRID_SIZE &&
         c.row >= 0 && c.row < GRID_SIZE &&
         c.depth >= 0 && c.depth < GRID_SIZE;
}

function distToCenter(c: Coordinate): number {
  return Math.abs(c.col - 3) + Math.abs(c.row - 3) + Math.abs(c.depth - 3);
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
// Bot: Intel analysis (replaces TargetingState)
// ---------------------------------------------------------------------------

interface HitCluster {
  hits: Coordinate[];
  axis: PlacementAxis | null;
  nextTargets: Coordinate[];
  allNeighbors: Coordinate[];
}

interface IntelAnalysis {
  unresolved: Coordinate[];
  negativeScans: Coordinate[];
  positiveScans: Coordinate[];
  hitCoords: Coordinate[];
  hitClusters: HitCluster[];
  depthExplored: number[];
  consecutiveHitAvailable: boolean;
  totalExplored: number;
}

function buildIntelAnalysis(gc: GameController): IntelAnalysis {
  const player = gc.getCurrentPlayer();
  const grid = player.targetingGrid;

  const unresolved: Coordinate[] = [];
  const negativeScans: Coordinate[] = [];
  const positiveScans: Coordinate[] = [];
  const hitCoords: Coordinate[] = [];
  const depthExplored = new Array(GRID_SIZE).fill(0) as number[];
  let totalExplored = 0;

  // Cells that have been fired on (hit/miss/sunk/decoy_hit) — not targetable
  const firedSet = new Set<string>();

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
            firedSet.add(coordKey(coord));
            depthExplored[depth]++;
            totalExplored++;
            break;
          case CellState.DroneNegative:
          case CellState.SonarNegative:
            negativeScans.push(coord);
            unresolved.push(coord); // Can still fire on these
            break;
          case CellState.Miss:
          case CellState.Sunk:
          case CellState.DecoyHit:
            firedSet.add(coordKey(coord));
            depthExplored[depth]++;
            totalExplored++;
            break;
        }
      }
    }
  }

  // Also count positive/negative scans as explored for depth density
  for (const c of positiveScans) { depthExplored[c.depth]++; totalExplored++; }
  for (const c of negativeScans) { depthExplored[c.depth]++; totalExplored++; }

  // Build set of all non-targetable cells (fired + sunk)
  const nonTargetable = new Set(firedSet);
  // Sunk cells are in firedSet already. Positive/negative scans ARE targetable.

  // --- Cluster building via BFS ---
  const hitSet = new Set(hitCoords.map(coordKey));
  const visited = new Set<string>();
  const hitClusters: HitCluster[] = [];

  for (const hit of hitCoords) {
    const key = coordKey(hit);
    if (visited.has(key)) continue;

    // BFS to find connected hits (connected = delta matches any axis delta or negation)
    const cluster: Coordinate[] = [];
    const queue = [hit];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      for (const [dc, dr, dd] of ALL_AXIS_DELTA_VALUES) {
        for (const sign of [1, -1]) {
          const neighbor: Coordinate = {
            col: current.col + dc * sign,
            row: current.row + dr * sign,
            depth: current.depth + dd * sign,
          };
          const nk = coordKey(neighbor);
          if (hitSet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(neighbor);
          }
        }
      }
    }

    // --- Axis inference ---
    let axis: PlacementAxis | null = null;
    if (cluster.length >= 2) {
      // Check if vector between first two hits is a scalar multiple of an axis delta
      const a = cluster[0]!;
      const b = cluster[1]!;
      const dx = b.col - a.col;
      const dy = b.row - a.row;
      const dz = b.depth - a.depth;

      for (const [axisName, [adx, ady, adz]] of Object.entries(AXIS_DELTAS)) {
        // Check if (dx, dy, dz) is a scalar multiple of (adx, ady, adz)
        // i.e., dx/adx === dy/ady === dz/adz (handling zeros)
        const ratios: number[] = [];
        let valid = true;
        for (const [d, ad] of [[dx, adx], [dy, ady], [dz, adz]] as [number, number][]) {
          if (ad === 0) {
            if (d !== 0) { valid = false; break; }
          } else {
            ratios.push(d / ad);
          }
        }
        if (valid && ratios.length > 0 && ratios.every(r => r === ratios[0] && r !== 0)) {
          axis = axisName as PlacementAxis;
          break;
        }
      }
    }

    // --- Next targets ---
    const nextTargets: Coordinate[] = [];
    const allNeighbors: Coordinate[] = [];
    const addedNext = new Set<string>();
    const addedNeighbor = new Set<string>();

    if (axis !== null) {
      // Extend from endpoints along the inferred axis
      const delta = AXIS_DELTAS[axis];
      // Find endpoints: sort cluster along axis
      const sorted = [...cluster].sort((a, b) => {
        return (a.col * delta[0] + a.row * delta[1] + a.depth * delta[2]) -
               (b.col * delta[0] + b.row * delta[1] + b.depth * delta[2]);
      });
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;

      // Extend in both directions from endpoints
      for (const [endpoint, sign] of [[first, -1], [last, 1]] as [Coordinate, number][]) {
        for (let step = 1; step <= 4; step++) { // Up to ship size 5
          const candidate: Coordinate = {
            col: endpoint.col + delta[0] * sign * step,
            row: endpoint.row + delta[1] * sign * step,
            depth: endpoint.depth + delta[2] * sign * step,
          };
          const ck = coordKey(candidate);
          if (!inBounds(candidate) || nonTargetable.has(ck)) break;
          if (!addedNext.has(ck)) {
            nextTargets.push(candidate);
            addedNext.add(ck);
          }
        }
      }
    }

    // All neighbors (for single-hit clusters or fallback)
    for (const h of cluster) {
      for (const [dc, dr, dd] of ALL_AXIS_DELTA_VALUES) {
        for (const sign of [1, -1]) {
          const neighbor: Coordinate = {
            col: h.col + dc * sign,
            row: h.row + dr * sign,
            depth: h.depth + dd * sign,
          };
          const nk = coordKey(neighbor);
          if (inBounds(neighbor) && !nonTargetable.has(nk) && !addedNeighbor.has(nk)) {
            allNeighbors.push(neighbor);
            addedNeighbor.add(nk);
          }
        }
      }
    }

    hitClusters.push({ hits: cluster, axis, nextTargets, allNeighbors });
  }

  // Sort clusters: largest first
  hitClusters.sort((a, b) => b.hits.length - a.hits.length);

  const consecutiveHitAvailable = player.lastTurnHit;

  return {
    unresolved, negativeScans, positiveScans, hitCoords,
    hitClusters, depthExplored, consecutiveHitAvailable, totalExplored,
  };
}

// ---------------------------------------------------------------------------
// Bot: Smart targeting
// ---------------------------------------------------------------------------

function pickTarget(intel: IntelAnalysis): Coordinate {
  // 1. Positive scans — prefer those adjacent to hits (consecutive bonus potential)
  if (intel.positiveScans.length > 0) {
    const hitKeys = new Set(intel.hitCoords.map(coordKey));
    const adjacentToHit = intel.positiveScans.filter(ps => {
      for (const [dc, dr, dd] of ALL_AXIS_DELTA_VALUES) {
        for (const sign of [1, -1]) {
          if (hitKeys.has(coordKey({ col: ps.col + dc * sign, row: ps.row + dr * sign, depth: ps.depth + dd * sign }))) {
            return true;
          }
        }
      }
      return false;
    });
    if (adjacentToHit.length > 0) {
      return adjacentToHit[randInt(adjacentToHit.length)]!;
    }
    return intel.positiveScans[randInt(intel.positiveScans.length)]!;
  }

  // 2. Cluster next-targets (axis-inferred extensions), largest clusters first
  for (const cluster of intel.hitClusters) {
    if (cluster.nextTargets.length > 0) {
      // Pick first (closest to endpoint)
      return cluster.nextTargets[0]!;
    }
  }

  // 3. Cluster all-neighbors (fallback for single-hit or axis-unknown clusters)
  for (const cluster of intel.hitClusters) {
    if (cluster.allNeighbors.length > 0) {
      return cluster.allNeighbors[randInt(cluster.allNeighbors.length)]!;
    }
  }

  // 4. 3D parity hunt — (col + row + depth) % 2 === 0, prefer center
  const parityCells = intel.unresolved.filter(c => (c.col + c.row + c.depth) % 2 === 0);
  if (parityCells.length > 0) {
    // Sort by distance to center, take from closest ~20%
    parityCells.sort((a, b) => distToCenter(a) - distToCenter(b));
    const top = Math.max(1, Math.floor(parityCells.length * 0.2));
    return parityCells[randInt(top)]!;
  }

  // 5. Any unresolved
  if (intel.unresolved.length > 0) {
    return intel.unresolved[randInt(intel.unresolved.length)]!;
  }

  // Fallback (shouldn't happen)
  return randomCoord();
}

// ---------------------------------------------------------------------------
// Bot: Smart sonar targeting
// ---------------------------------------------------------------------------

function pickSonarTarget(intel: IntelAnalysis): Coordinate | null {
  if (intel.unresolved.length === 0) return null;

  const unresolvedSet = new Set(intel.unresolved.map(coordKey));
  const positiveSet = new Set(intel.positiveScans.map(coordKey));

  function countUseful(origin: Coordinate): number {
    let count = 0;
    for (let dc = 0; dc <= 1; dc++) {
      for (let dr = 0; dr <= 1; dr++) {
        for (let dd = 0; dd <= 1; dd++) {
          const c: Coordinate = { col: origin.col + dc, row: origin.row + dr, depth: origin.depth + dd };
          if (inBounds(c)) {
            const k = coordKey(c);
            if (unresolvedSet.has(k) || positiveSet.has(k)) count++;
          }
        }
      }
    }
    return count;
  }

  // 1. Near single-hit clusters (axis unknown) — offset to maximize new info
  for (const cluster of intel.hitClusters) {
    if (cluster.hits.length === 1 && cluster.axis === null) {
      const h = cluster.hits[0]!;
      let bestOrigin: Coordinate | null = null;
      let bestCount = 0;
      // Try all 8 offsets that place hit at corner of 2x2x2
      for (const [odc, odr, odd] of [[-1,-1,-1],[-1,-1,0],[-1,0,-1],[-1,0,0],[0,-1,-1],[0,-1,0],[0,0,-1],[0,0,0]]) {
        const origin: Coordinate = { col: h.col + odc, row: h.row + odr, depth: h.depth + odd };
        if (inBounds(origin)) {
          const count = countUseful(origin);
          if (count > bestCount) { bestCount = count; bestOrigin = origin; }
        }
      }
      if (bestOrigin && bestCount >= 4) return bestOrigin;
    }
  }

  // 2. Near positive scans
  for (const ps of intel.positiveScans) {
    let bestOrigin: Coordinate | null = null;
    let bestCount = 0;
    for (const [odc, odr, odd] of [[-1,-1,-1],[-1,-1,0],[-1,0,-1],[-1,0,0],[0,-1,-1],[0,-1,0],[0,0,-1],[0,0,0]]) {
      const origin: Coordinate = { col: ps.col + odc, row: ps.row + odr, depth: ps.depth + odd };
      if (inBounds(origin)) {
        const count = countUseful(origin);
        if (count > bestCount) { bestCount = count; bestOrigin = origin; }
      }
    }
    if (bestOrigin && bestCount >= 4) return bestOrigin;
  }

  // 3. Maximum coverage — sample random origins
  let bestOrigin: Coordinate | null = null;
  let bestCount = 0;
  for (let i = 0; i < 20; i++) {
    const origin: Coordinate = {
      col: randInt(GRID_SIZE - 1),
      row: randInt(GRID_SIZE - 1),
      depth: randInt(GRID_SIZE - 1),
    };
    const count = countUseful(origin);
    if (count > bestCount) { bestCount = count; bestOrigin = origin; }
  }

  return bestOrigin ?? intel.unresolved[randInt(intel.unresolved.length)]!;
}

// ---------------------------------------------------------------------------
// Bot: Smart depth charge targeting
// ---------------------------------------------------------------------------

function pickDepthChargeTarget(intel: IntelAnalysis): { center: Coordinate; score: number } | null {
  const hitKeys = new Set(intel.hitCoords.map(coordKey));
  const positiveKeys = new Set(intel.positiveScans.map(coordKey));
  const unresolvedSet = new Set(intel.unresolved.map(coordKey));

  function scoreCenter(center: Coordinate): number {
    let score = 0;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dd = -1; dd <= 1; dd++) {
          const c: Coordinate = { col: center.col + dc, row: center.row + dr, depth: center.depth + dd };
          if (!inBounds(c)) continue;
          const k = coordKey(c);
          if (hitKeys.has(k)) score += 3;
          else if (positiveKeys.has(k)) score += 2;
          else if (unresolvedSet.has(k)) score += 0.5;
        }
      }
    }
    return score;
  }

  // Use cluster centroids and positive scan locations as candidates
  const candidates: Coordinate[] = [];
  for (const cluster of intel.hitClusters) {
    // Centroid of cluster
    const cx = Math.round(cluster.hits.reduce((s, h) => s + h.col, 0) / cluster.hits.length);
    const cy = Math.round(cluster.hits.reduce((s, h) => s + h.row, 0) / cluster.hits.length);
    const cz = Math.round(cluster.hits.reduce((s, h) => s + h.depth, 0) / cluster.hits.length);
    candidates.push({ col: Math.min(cx, GRID_SIZE - 2), row: Math.min(cy, GRID_SIZE - 2), depth: Math.min(cz, GRID_SIZE - 2) });
    // Also add individual hits as candidates
    for (const h of cluster.hits) candidates.push(h);
  }
  for (const ps of intel.positiveScans) candidates.push(ps);

  let bestCenter: Coordinate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    // Clamp to valid DC center (needs 1 cell margin for 3x3x3)
    const center: Coordinate = {
      col: Math.max(1, Math.min(GRID_SIZE - 2, c.col)),
      row: Math.max(1, Math.min(GRID_SIZE - 2, c.row)),
      depth: Math.max(1, Math.min(GRID_SIZE - 2, c.depth)),
    };
    const score = scoreCenter(center);
    if (score > bestScore) { bestScore = score; bestCenter = center; }
  }

  if (bestCenter && bestScore >= 4) {
    return { center: bestCenter, score: bestScore };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bot: Smart G-SONAR depth selection
// ---------------------------------------------------------------------------

function pickGSonarDepth(intel: IntelAnalysis): number {
  const scores: number[] = [];
  for (let d = 0; d < GRID_SIZE; d++) {
    const unexplored = (GRID_SIZE * GRID_SIZE) - intel.depthExplored[d]!;
    const hitsAtDepth = intel.hitCoords.filter(c => c.depth === d).length;
    const positivesAtDepth = intel.positiveScans.filter(c => c.depth === d).length;
    scores.push(unexplored * 1 + hitsAtDepth * 3 + positivesAtDepth * 2);
  }

  let bestDepth = 3; // Default to middle
  let bestScore = -1;
  for (let d = 0; d < GRID_SIZE; d++) {
    const score = scores[d]!;
    // Tie-break: prefer middle depths (2-4)
    const middleBonus = (d >= 2 && d <= 4) ? 0.1 : 0;
    if (score + middleBonus > bestScore) {
      bestScore = score + middleBonus;
      bestDepth = d;
    }
  }
  return bestDepth;
}

// ---------------------------------------------------------------------------
// Bot: Smart recon drone targeting
// ---------------------------------------------------------------------------

function pickDroneTarget(intel: IntelAnalysis): Coordinate {
  const unresolvedSet = new Set(intel.unresolved.map(coordKey));
  const positiveSet = new Set(intel.positiveScans.map(coordKey));

  function countUseful3x3x3(center: Coordinate): number {
    let count = 0;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dd = -1; dd <= 1; dd++) {
          const c: Coordinate = { col: center.col + dc, row: center.row + dr, depth: center.depth + dd };
          if (inBounds(c)) {
            const k = coordKey(c);
            if (unresolvedSet.has(k) || positiveSet.has(k)) count++;
          }
        }
      }
    }
    return count;
  }

  // 1. Center on hit cluster with unknown axis
  for (const cluster of intel.hitClusters) {
    if (cluster.axis === null && cluster.hits.length === 1) {
      const h = cluster.hits[0]!;
      // Clamp to valid drone center
      return {
        col: Math.max(1, Math.min(GRID_SIZE - 2, h.col)),
        row: Math.max(1, Math.min(GRID_SIZE - 2, h.row)),
        depth: Math.max(1, Math.min(GRID_SIZE - 2, h.depth)),
      };
    }
  }

  // 2. Center on positive scan region
  if (intel.positiveScans.length > 0) {
    const ps = intel.positiveScans[0]!;
    return {
      col: Math.max(1, Math.min(GRID_SIZE - 2, ps.col)),
      row: Math.max(1, Math.min(GRID_SIZE - 2, ps.row)),
      depth: Math.max(1, Math.min(GRID_SIZE - 2, ps.depth)),
    };
  }

  // 3. Sample random centers, pick highest unexplored count
  let bestCenter: Coordinate = { col: 3, row: 3, depth: 3 };
  let bestCount = 0;
  for (let i = 0; i < 30; i++) {
    const center: Coordinate = {
      col: 1 + randInt(GRID_SIZE - 2),
      row: 1 + randInt(GRID_SIZE - 2),
      depth: 1 + randInt(GRID_SIZE - 2),
    };
    const count = countUseful3x3x3(center);
    if (count > bestCount) { bestCount = count; bestCenter = center; }
  }
  return bestCenter;
}

// ---------------------------------------------------------------------------
// Bot: Perk purchasing strategy (deterministic, intel-driven)
// ---------------------------------------------------------------------------

function buyPerks(gc: GameController, intel: IntelAnalysis): PerkId[] {
  const bought: PerkId[] = [];
  const player = gc.getCurrentPlayer();
  const opponent = gc.getOpponent();
  let credits = player.credits;
  const opponentShipsRemaining = opponent.ships.filter(s => !s.sunk).length;
  const ownDamagedShips = player.ships.filter(s => !s.sunk && s.hits > 0).length;
  const explorationPct = intel.totalExplored / TOTAL_CELLS;
  const hasActionableIntel = intel.hitClusters.length > 0 || intel.positiveScans.length > 0;

  const hasPing = player.inventory.some(p => p.perkId === 'sonar_ping');
  const hasJammer = player.inventory.some(p => p.perkId === 'radar_jammer') || player.abilities.radar_jammer.active;
  const hasDC = player.inventory.some(p => p.perkId === 'depth_charge');
  const hasGSonar = player.inventory.some(p => p.perkId === 'g_sonar');
  const hasDrone = player.inventory.some(p => p.perkId === 'recon_drone');

  function tryBuy(perkId: PerkId): boolean {
    const cost = getCost(perkId);
    if (credits >= cost) {
      const result = gc.purchasePerk(perkId);
      if (result) {
        credits -= cost;
        bought.push(perkId);
        return true;
      }
    }
    return false;
  }

  // Big purchases: DC when actionable intel, G-SONAR/Drone for exploration
  if (!hasDC && hasActionableIntel && intel.hitClusters.length >= 1 && credits >= 25) {
    tryBuy('depth_charge');
  }
  if (!hasGSonar && explorationPct < 0.5 && credits >= 18) {
    tryBuy('g_sonar');
  }
  if (!hasDrone && explorationPct < 0.6 && credits >= 10) {
    tryBuy('recon_drone');
  }

  // Always maintain 1 sonar ping
  if (!hasPing && credits >= 3) {
    tryBuy('sonar_ping');
  }

  // Jammer if none active/in-inventory
  if (!hasJammer && credits >= 5) {
    tryBuy('radar_jammer');
  }

  // Defensive perks when own ships are taking damage
  if (ownDamagedShips >= 1 && credits >= 6) {
    const hasCloak = player.inventory.some(p => p.perkId === 'acoustic_cloak') || player.abilities.acoustic_cloak.active;
    if (!hasCloak) tryBuy('acoustic_cloak');
  }
  if (ownDamagedShips >= 2 && credits >= 10) {
    const hasSR = player.inventory.some(p => p.perkId === 'silent_running');
    if (!hasSR) tryBuy('silent_running');
  }

  // Spend remaining on sonar pings (up to 2 total)
  const pingCount = player.inventory.filter(p => p.perkId === 'sonar_ping').length + (bought.filter(p => p === 'sonar_ping').length);
  if (pingCount < 2 && credits >= 3) {
    tryBuy('sonar_ping');
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

  // 1. Build intel analysis
  const intel = buildIntelAnalysis(gc);

  // 2. Buy perks (intel-driven)
  const perksBought = buyPerks(gc, intel);

  // 3. Deploy defensive perks (free actions)
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

  // 4. Use sonar ping if available (ping slot)
  const hasPing = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'sonar_ping');
  if (hasPing && !gc.getTurnSlots().pingUsed) {
    const sonarTarget = pickSonarTarget(intel);
    if (sonarTarget) {
      const pingResult = gc.useSonarPing(sonarTarget);
      if (pingResult) perksUsed.push('sonar_ping');
    }
  }

  // 5. Choose attack action — torpedoes take priority when actionable intel exists
  let action: TurnLog['action'] = 'torpedo';
  let actionResult = '';

  // Refresh intel after sonar
  const freshIntel = buildIntelAnalysis(gc);
  const hasActionableIntel = freshIntel.positiveScans.length > 0 || freshIntel.hitClusters.some(c => c.nextTargets.length > 0 || c.allNeighbors.length > 0);
  const explorationPct = freshIntel.totalExplored / TOTAL_CELLS;

  // Decision tree:
  // - High-value DC (score>=6) when actionable intel exists
  // - Torpedo when actionable intel exists (prefer consecutive hit bonus)
  // - G-SONAR/Drone for recon when hunting blind (no actionable intel, low exploration)
  // - Lower-value DC (score>=4) as fallback
  // - Torpedo as final fallback

  // High-value depth charge
  if (hasActionableIntel) {
    const hasDC = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'depth_charge');
    if (hasDC) {
      const dcTarget = pickDepthChargeTarget(freshIntel);
      if (dcTarget && dcTarget.score >= 6) {
        const dcResult = gc.useDepthCharge(dcTarget.center);
        if (dcResult) {
          action = 'depth_charge';
          perksUsed.push('depth_charge');
          const hits = dcResult.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk').length;
          actionResult = `${hits} hits, ${dcResult.shipsSunk.length} sunk`;
        }
      }
    }
  }

  // G-SONAR when no actionable intel and low exploration
  if (!gc.getTurnSlots().attackUsed && !hasActionableIntel && explorationPct < 0.5) {
    const hasGSonar = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'g_sonar');
    if (hasGSonar) {
      const depth = pickGSonarDepth(freshIntel);
      const gResult = gc.useGSonar(depth);
      if (gResult) {
        action = 'g_sonar';
        perksUsed.push('g_sonar');
        const contacts = gResult.cells.filter(c => c.written && c.displayedResult).length;
        actionResult = `depth ${depth + 1}: ${contacts} contacts`;
      }
    }
  }

  // Recon drone when no actionable intel and low exploration
  if (!gc.getTurnSlots().attackUsed && !hasActionableIntel && explorationPct < 0.6) {
    const hasDrone = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'recon_drone');
    if (hasDrone) {
      const center = pickDroneTarget(freshIntel);
      const droneResult = gc.useReconDrone(center);
      if (droneResult) {
        action = 'recon_drone';
        perksUsed.push('recon_drone');
        const contacts = droneResult.cells.filter(c => c.written && c.displayedResult).length;
        actionResult = `${contacts} contacts`;
      }
    }
  }

  // Low-value depth charge as fallback
  if (!gc.getTurnSlots().attackUsed) {
    const hasDC = gc.getCurrentPlayer().inventory.some(p => p.perkId === 'depth_charge');
    if (hasDC) {
      const dcTarget = pickDepthChargeTarget(freshIntel);
      if (dcTarget && dcTarget.score >= 4) {
        const dcResult = gc.useDepthCharge(dcTarget.center);
        if (dcResult) {
          action = 'depth_charge';
          perksUsed.push('depth_charge');
          const hits = dcResult.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk').length;
          actionResult = `${hits} hits, ${dcResult.shipsSunk.length} sunk`;
        }
      }
    }
  }

  // Torpedo as primary/fallback attack
  if (!gc.getTurnSlots().attackUsed) {
    action = 'torpedo';
    let target = pickTarget(freshIntel);
    let fireResult = gc.fireTorpedo(target);

    let retries = 0;
    while (!fireResult && retries < 50) {
      target = freshIntel.unresolved.length > 0
        ? freshIntel.unresolved[randInt(freshIntel.unresolved.length)]!
        : randomCoord();
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

  // 6. End turn (if game not over)
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
  rankBonuses: number;
  rankCreditsAwarded: number;
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

function runGame(verbose: boolean, rank: Rank): GameResult {
  const gc = new GameController(undefined, rank);

  // Setup both players
  placeFleetRandomly(gc);
  gc.confirmSetup();
  placeFleetRandomly(gc);
  gc.confirmSetup();

  const turnLogs: TurnLog[] = [];
  let safety = 0;
  let rankBonuses = 0;
  let rankCreditsAwarded = 0;
  const rankConfig = RANK_CONFIGS[rank];

  while (gc.getState().phase === GamePhase.Combat && safety < 1000) {
    const log = executeTurn(gc, verbose);
    turnLogs.push(log);

    // Check if a rank bonus was awarded this turn
    const bonus = gc.getLastRankBonus();
    if (bonus) {
      rankBonuses++;
      rankCreditsAwarded += bonus.amount;
      if (verbose) {
        const p = bonus.player === 0 ? 'ALPHA' : 'BRAVO';
        console.log(`        ⤷ STALEMATE BONUS: ${p} +${bonus.amount} CR`);
      }
    }

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

  return { winner, turns: state.turnCount, turnLogs, stats, rankBonuses, rankCreditsAwarded };
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
  rank: Rank;
  alphaWins: number;
  bravoWins: number;
  turns: { min: number; max: number; avg: number; median: number };
  hitRate: { alpha: number; bravo: number };
  avgCreditsSpent: { alpha: number; bravo: number };
  perksBought: Record<PerkId, number>;
  perksUsed: Record<PerkId, number>;
  avgShipsSunk: { alpha: number; bravo: number };
  rankBonuses: { total: number; avg: number; avgCredits: number };
}

function aggregate(results: GameResult[], rank: Rank): AggregateMetrics {
  const n = results.length;
  const turns = results.map(r => r.turns).sort((a, b) => a - b);
  const alphaWins = results.filter(r => r.winner === 0).length;

  const totalBought = emptyPerkCounts();
  const totalUsed = emptyPerkCounts();
  let alphaHitRate = 0, bravoHitRate = 0;
  let alphaSpent = 0, bravoSpent = 0;
  let alphaSunk = 0, bravoSunk = 0;
  let totalRankBonuses = 0;
  let totalRankCredits = 0;

  for (const r of results) {
    alphaHitRate += r.stats[0].hitRate;
    bravoHitRate += r.stats[1].hitRate;
    alphaSpent += r.stats[0].creditsSpent;
    bravoSpent += r.stats[1].creditsSpent;
    alphaSunk += r.stats[0].shipsSunk;
    bravoSunk += r.stats[1].shipsSunk;
    totalRankBonuses += r.rankBonuses;
    totalRankCredits += r.rankCreditsAwarded;

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
    rank,
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
    rankBonuses: {
      total: totalRankBonuses,
      avg: totalRankBonuses / n,
      avgCredits: totalRankCredits / n,
    },
  };
}

function printResults(metrics: AggregateMetrics): void {
  const bar = '═'.repeat(56);
  console.log();
  console.log(`╔${bar}╗`);
  const rankLabel = RANK_CONFIGS[metrics.rank].label;
  const threshold = RANK_CONFIGS[metrics.rank].dryTurnThreshold;
  const bonus = RANK_CONFIGS[metrics.rank].creditBonus;
  const rankDesc = threshold !== null
    ? `${rankLabel} (${threshold} dry → +${bonus} CR)`
    : `${rankLabel} (no bonus)`;
  console.log(`║  CONTACT — SIMULATION RESULTS                        ║`);
  console.log(`╠${bar}╣`);

  console.log(`║  Games played:  ${String(metrics.gamesPlayed).padStart(6)}                             ║`);
  console.log(`║  Rank:          ${rankDesc.padEnd(37)}║`);
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

  // Rank bonuses
  if (metrics.rank !== 'officer') {
    console.log(`║  STALEMATE BONUSES                                   ║`);
    console.log(`║    Total triggers: ${String(metrics.rankBonuses.total).padStart(5)}                              ║`);
    console.log(`║    Avg per game:   ${metrics.rankBonuses.avg.toFixed(1).padStart(5)}                              ║`);
    console.log(`║    Avg CR awarded: ${metrics.rankBonuses.avgCredits.toFixed(1).padStart(5)}                              ║`);
    console.log(`╠${bar}╣`);
  }

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
const numGames = parseInt(args.find(a => !a.startsWith('-') && !['recruit', 'enlisted', 'officer'].includes(a)) ?? '100', 10);

// Parse --rank <value> or just rank name as positional
let rank: Rank = 'officer';
const rankIdx = args.indexOf('--rank');
if (rankIdx !== -1 && args[rankIdx + 1]) {
  const val = args[rankIdx + 1] as string;
  if (val === 'recruit' || val === 'enlisted' || val === 'officer') {
    rank = val;
  } else {
    console.error(`Invalid rank: ${val}. Use recruit, enlisted, or officer.`);
    process.exit(1);
  }
}

const rankLabel = RANK_CONFIGS[rank].label;
console.log(`\nRunning ${numGames} simulated games [${rankLabel}]${verbose ? ' (verbose)' : ''}...\n`);

const results: GameResult[] = [];
const startTime = performance.now();

for (let i = 0; i < numGames; i++) {
  if (verbose) {
    console.log(`\n── Game ${i + 1} ${'─'.repeat(44)}`);
  }
  const result = runGame(verbose, rank);
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

const metrics = aggregate(results, rank);
printResults(metrics);
console.log(`Completed in ${elapsed}s (${(parseFloat(elapsed) / numGames * 1000).toFixed(1)}ms per game)\n`);
