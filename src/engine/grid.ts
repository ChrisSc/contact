import { GRID_SIZE, COLUMN_LABELS, CellState } from '../types/grid';
import type { Coordinate, Cell, Grid } from '../types/grid';

export function isValidCoordinate(coord: Coordinate): boolean {
  return (
    Number.isInteger(coord.col) &&
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.depth) &&
    coord.col >= 0 &&
    coord.col < GRID_SIZE &&
    coord.row >= 0 &&
    coord.row < GRID_SIZE &&
    coord.depth >= 0 &&
    coord.depth < GRID_SIZE
  );
}

export function createGrid(): Grid {
  const grid: Grid = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    grid[col] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      grid[col]![row] = [];
      for (let depth = 0; depth < GRID_SIZE; depth++) {
        grid[col]![row]![depth] = { state: CellState.Empty, shipId: null };
      }
    }
  }
  return grid;
}

export function getCell(grid: Grid, coord: Coordinate): Cell | undefined {
  return grid[coord.col]?.[coord.row]?.[coord.depth];
}

export function setCell(grid: Grid, coord: Coordinate, cell: Cell): Grid {
  if (!isValidCoordinate(coord)) {
    throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
  }

  const newGrid = [...grid];
  const newCol = [...newGrid[coord.col]!];
  const newRow = [...newCol[coord.row]!];
  newRow[coord.depth] = cell;
  newCol[coord.row] = newRow;
  newGrid[coord.col] = newCol;
  return newGrid;
}

export function parseCoordinate(str: string): Coordinate | null {
  const match = str.match(/^([A-H])-([1-8])-D([1-8])$/i);
  if (!match) return null;

  const colLabel = match[1]!.toUpperCase();
  const col = COLUMN_LABELS.indexOf(colLabel as typeof COLUMN_LABELS[number]);
  if (col === -1) return null;

  const row = parseInt(match[2]!, 10) - 1;
  const depth = parseInt(match[3]!, 10) - 1;

  return { col, row, depth };
}

export function formatCoordinate(coord: Coordinate): string {
  return `${COLUMN_LABELS[coord.col]}-${coord.row + 1}-D${coord.depth + 1}`;
}
