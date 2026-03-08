import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { PlayerState } from '../types/game';
import { getCell, isValidCoordinate } from './grid';

export interface DroneScanCellResult {
  coord: Coordinate;
  rawResult: boolean;
  displayedResult: boolean;
  /** Whether this cell was written to the targeting grid (false if skipped due to existing Hit/Miss/Sunk) */
  written: boolean;
}

export interface DroneScanResult {
  center: Coordinate;
  cells: DroneScanCellResult[];
  jammed: boolean;
  cloaked: boolean;
  jammerConsumed: boolean;
}

export function calculateScanArea(center: Coordinate): Coordinate[] {
  const coords: Coordinate[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dd = -1; dd <= 1; dd++) {
        const coord = { col: center.col + dc, row: center.row + dr, depth: center.depth + dd };
        if (isValidCoordinate(coord)) {
          coords.push(coord);
        }
      }
    }
  }
  return coords;
}

export function executeReconDrone(
  center: Coordinate,
  _attacker: PlayerState,
  defender: PlayerState,
): DroneScanResult {
  const scanCoords = calculateScanArea(center);

  const jammed = defender.abilities.radar_jammer.active;
  const cloaked = defender.abilities.acoustic_cloak.active;
  const jammerConsumed = jammed && !cloaked;

  const cells: DroneScanCellResult[] = scanCoords.map(coord => {
    const cell = getCell(defender.ownGrid, coord);
    const rawResult = cell != null && (cell.state === CellState.Ship || cell.state === CellState.Decoy);

    let displayedResult = rawResult;
    if (cloaked) {
      displayedResult = false;
    } else if (jammed) {
      // GDD 5.4: Jammer "returns false scan results for the drone's area"
      // (unlike sonar ping which inverts yes<->no, drone gets all-false)
      displayedResult = false;
    }

    return { coord, rawResult, displayedResult, written: false };
  });

  return { center, cells, jammed, cloaked, jammerConsumed };
}
