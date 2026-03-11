/**
 * ai-placement.ts — Random fleet placement for AI setup.
 *
 * Shared between the browser AI opponent and the CLI agent-play script.
 * Pure game logic — no DOM, no SDK dependencies.
 */

import type { GameController } from '../game';
import type { Coordinate } from '../../types/grid';
import { GRID_SIZE } from '../../types/grid';
import { FLEET_ROSTER, PLACEMENT_AXES } from '../../types/fleet';

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function randomCoord(): Coordinate {
  return { col: randInt(GRID_SIZE), row: randInt(GRID_SIZE), depth: randInt(GRID_SIZE) };
}

/**
 * Place all 7 ships + 1 decoy randomly for the current player.
 * Throws if placement fails after exhausting attempts.
 */
export function placeFleetRandomly(gc: GameController): void {
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
