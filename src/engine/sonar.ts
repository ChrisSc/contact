import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { PlayerState } from '../types/game';
import { getCell, isValidCoordinate } from './grid';
import { isShipSilentRunning } from './silent-running';

export interface SonarPingCellResult {
  coord: Coordinate;
  rawResult: boolean;
  silentRunning: boolean;
  displayedResult: boolean;
}

export interface SonarPingResult {
  origin: Coordinate;
  cells: SonarPingCellResult[];
  jammed: boolean;
  cloaked: boolean;
}

/**
 * Calculate the 2x2x2 sonar scan volume anchored at the given origin.
 * The origin is the min-corner; scans origin to origin+1 on each axis.
 * Clips to grid boundaries.
 */
export function calculateSonarArea(origin: Coordinate): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let dc = 0; dc <= 1; dc++) {
    for (let dr = 0; dr <= 1; dr++) {
      for (let dd = 0; dd <= 1; dd++) {
        const coord = { col: origin.col + dc, row: origin.row + dr, depth: origin.depth + dd };
        if (isValidCoordinate(coord)) {
          coords.push(coord);
        }
      }
    }
  }
  return coords;
}

export function executeSonarPing(
  origin: Coordinate,
  _attacker: PlayerState,
  defender: PlayerState,
): SonarPingResult {
  const scanCoords = calculateSonarArea(origin);

  const jammed = defender.abilities.radar_jammer.active;
  const cloaked = defender.abilities.acoustic_cloak.active;

  const cells: SonarPingCellResult[] = scanCoords.map(coord => {
    const cell = getCell(defender.ownGrid, coord);
    const rawResult = cell != null && (cell.state === CellState.Ship || cell.state === CellState.Decoy);

    // Check if ship is silent running (only affects actual ships, not decoys)
    const silentRunning = rawResult && cell?.shipId != null
      && isShipSilentRunning(defender.silentRunningShips, cell.shipId);

    let displayedResult = rawResult;
    if (silentRunning) {
      displayedResult = false;
    } else if (cloaked) {
      displayedResult = false;
    } else if (jammed) {
      displayedResult = !rawResult; // Jammer inverts per-cell (yes↔no)
    }

    return { coord, rawResult, silentRunning, displayedResult };
  });

  return { origin, cells, jammed, cloaked };
}
