import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { PlayerState } from '../types/game';
import { getCell } from './grid';
import { calculateScanArea } from './drone';

export interface DepthChargeCellResult {
  coord: Coordinate;
  cellState: CellState;
  shipId: string | null;
  alreadyResolved: boolean;
}

export interface DepthChargeTargets {
  center: Coordinate;
  cells: DepthChargeCellResult[];
}

const RESOLVED_STATES = new Set([
  CellState.Hit,
  CellState.Miss,
  CellState.Sunk,
  CellState.DecoyHit,
]);

export function calculateDepthChargeTargets(
  center: Coordinate,
  defender: PlayerState,
): DepthChargeTargets {
  const scanCoords = calculateScanArea(center);

  const cells: DepthChargeCellResult[] = scanCoords.map((coord) => {
    const cell = getCell(defender.ownGrid, coord);
    const cellState = cell ? cell.state : CellState.Empty;
    const shipId = cell ? cell.shipId : null;
    const alreadyResolved = RESOLVED_STATES.has(cellState);

    return { coord, cellState, shipId, alreadyResolved };
  });

  return { center, cells };
}
