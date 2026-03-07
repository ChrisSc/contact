import type { Coordinate, Grid, Cell } from '../types/grid';
import { CellState } from '../types/grid';
import type { Ship, FleetRosterEntry, PlacementAxis } from '../types/fleet';
import { FLEET_ROSTER } from '../types/fleet';
import type { PlayerIndex } from '../types/game';
import { isValidCoordinate, getCell, setCell, formatCoordinate } from './grid';
import { getLogger } from '../observability/logger';

export function calculateShipCells(
  origin: Coordinate,
  axis: PlacementAxis,
  size: number,
): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let i = 0; i < size; i++) {
    cells.push({
      col: origin.col + (axis === 'col' ? i : 0),
      row: origin.row + (axis === 'row' ? i : 0),
      depth: origin.depth + (axis === 'depth' ? i : 0),
    });
  }
  return cells;
}

export function validatePlacement(
  grid: Grid,
  ship: FleetRosterEntry,
  origin: Coordinate,
  axis: PlacementAxis,
): { valid: boolean; error?: string } {
  const cells = calculateShipCells(origin, axis, ship.size);

  for (const cell of cells) {
    if (!isValidCoordinate(cell)) {
      return { valid: false, error: 'Ship extends outside grid boundaries' };
    }
  }

  for (const coord of cells) {
    const existing = getCell(grid, coord)!;
    if (existing.state !== CellState.Empty) {
      return { valid: false, error: 'Ship overlaps with existing placement' };
    }
  }

  return { valid: true };
}

export function placeShip(
  grid: Grid,
  roster: FleetRosterEntry,
  origin: Coordinate,
  axis: PlacementAxis,
  playerIndex: PlayerIndex,
): { grid: Grid; ship: Ship } | null {
  const validation = validatePlacement(grid, roster, origin, axis);
  if (!validation.valid) return null;

  const cells = calculateShipCells(origin, axis, roster.size);
  let newGrid = grid;

  for (const coord of cells) {
    const cell: Cell = { state: CellState.Ship, shipId: roster.id };
    newGrid = setCell(newGrid, coord, cell);
  }

  const ship: Ship = {
    id: roster.id,
    name: roster.name,
    size: roster.size,
    cells,
    placement: { origin, axis },
    hits: 0,
    sunk: false,
  };

  getLogger().emit('fleet.place', {
    player: playerIndex,
    ship: roster.id,
    origin: formatCoordinate(origin),
    axis,
  });

  return { grid: newGrid, ship };
}

export function removeShip(grid: Grid, ship: Ship): Grid {
  let newGrid = grid;
  for (const coord of ship.cells) {
    newGrid = setCell(newGrid, coord, { state: CellState.Empty, shipId: null });
  }
  return newGrid;
}

export function placeDecoy(
  grid: Grid,
  coord: Coordinate,
  playerIndex: PlayerIndex,
): Grid | null {
  if (!isValidCoordinate(coord)) return null;
  const existing = getCell(grid, coord)!;
  if (existing.state !== CellState.Empty) return null;

  const newGrid = setCell(grid, coord, { state: CellState.Decoy, shipId: null });

  getLogger().emit('fleet.decoy_place', {
    player: playerIndex,
    origin: formatCoordinate(coord),
  });

  return newGrid;
}

export function isFleetComplete(ships: Ship[]): boolean {
  const requiredIds = FLEET_ROSTER.map((r) => r.id);
  return requiredIds.every((id) => ships.some((s) => s.id === id));
}

export function checkSunk(
  ship: Ship,
  grid: Grid,
): { sunk: boolean; ship: Ship; grid: Grid } {
  const allHit = ship.cells.every((coord) => {
    const cell = getCell(grid, coord);
    return cell?.state === CellState.Hit;
  });

  if (!allHit) return { sunk: false, ship, grid };

  let newGrid = grid;
  for (const coord of ship.cells) {
    newGrid = setCell(newGrid, coord, { state: CellState.Sunk, shipId: ship.id });
  }

  return {
    sunk: true,
    ship: { ...ship, sunk: true },
    grid: newGrid,
  };
}

export function getShipHealth(ship: Ship): number {
  return ship.size - ship.hits;
}
