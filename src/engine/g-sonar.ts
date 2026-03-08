import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { PlayerState } from '../types/game';
import { getCell } from './grid';
import { isShipSilentRunning } from './silent-running';

export interface GSonarCellResult {
  coord: Coordinate;
  rawResult: boolean;
  displayedResult: boolean;
  /** Whether this cell was written to the targeting grid (false until GameController sets it) */
  written: boolean;
}

export interface GSonarResult {
  depth: number;
  cells: GSonarCellResult[];
  cloaked: boolean;
}

export function executeGSonar(
  depth: number,
  _attacker: PlayerState,
  defender: PlayerState,
): GSonarResult {
  const cloaked = defender.abilities.acoustic_cloak.active;

  const cells: GSonarCellResult[] = [];

  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      const coord: Coordinate = { col, row, depth };
      const cell = getCell(defender.ownGrid, coord);
      const rawResult = cell != null && (cell.state === CellState.Ship || cell.state === CellState.Decoy);

      // Check if ship is silent running (only affects actual ships, not decoys)
      const silentRunning = rawResult && cell?.shipId != null
        && isShipSilentRunning(defender.silentRunningShips, cell.shipId);

      // Modifier priority: SR > Cloak > raw (no jammer interaction)
      let displayedResult = rawResult;
      if (silentRunning) {
        displayedResult = false;
      } else if (cloaked) {
        displayedResult = false;
      }

      cells.push({ coord, rawResult, displayedResult, written: false });
    }
  }

  return { depth, cells, cloaked };
}
