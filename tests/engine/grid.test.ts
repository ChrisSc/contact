import { describe, it, expect } from 'vitest';
import { createEmptyGrid, createCoordinate } from '../setup';
import { CellState, GRID_SIZE } from '../../src/types/grid';
import {
  isValidCoordinate,
  createGrid,
  getCell,
  setCell,
  parseCoordinate,
  formatCoordinate,
} from '../../src/engine/grid';

describe('Grid', () => {
  it('should create a 7x7x7 grid with 343 cells', () => {
    const grid = createEmptyGrid();

    expect(grid).toHaveLength(GRID_SIZE);

    let cellCount = 0;
    for (let col = 0; col < GRID_SIZE; col++) {
      expect(grid[col]).toHaveLength(GRID_SIZE);
      for (let row = 0; row < GRID_SIZE; row++) {
        expect(grid[col]![row]).toHaveLength(GRID_SIZE);
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          cellCount++;
        }
      }
    }

    expect(cellCount).toBe(343);
  });

  it('should initialize all cells as Empty with null shipId', () => {
    const grid = createEmptyGrid();

    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          const cell = grid[col]![row]![depth]!;
          expect(cell.state).toBe(CellState.Empty);
          expect(cell.shipId).toBeNull();
        }
      }
    }
  });

  it('should support coordinate-based access grid[col][row][depth]', () => {
    const grid = createEmptyGrid();
    const cell = grid[2]![3]![4]!;

    expect(cell.state).toBe(CellState.Empty);

    cell.state = CellState.Ship;
    cell.shipId = 'typhoon';

    expect(grid[2]![3]![4]!.state).toBe(CellState.Ship);
    expect(grid[2]![3]![4]!.shipId).toBe('typhoon');
  });
});

describe('isValidCoordinate', () => {
  it('accepts valid coordinates', () => {
    expect(isValidCoordinate({ col: 0, row: 0, depth: 0 })).toBe(true);
    expect(isValidCoordinate({ col: 6, row: 6, depth: 6 })).toBe(true);
    expect(isValidCoordinate({ col: 3, row: 5, depth: 2 })).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    expect(isValidCoordinate({ col: 7, row: 0, depth: 0 })).toBe(false);
    expect(isValidCoordinate({ col: 0, row: 7, depth: 0 })).toBe(false);
    expect(isValidCoordinate({ col: 0, row: 0, depth: 7 })).toBe(false);
  });

  it('rejects negative coordinates', () => {
    expect(isValidCoordinate({ col: -1, row: 0, depth: 0 })).toBe(false);
    expect(isValidCoordinate({ col: 0, row: -1, depth: 0 })).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    expect(isValidCoordinate({ col: 1.5, row: 0, depth: 0 })).toBe(false);
    expect(isValidCoordinate({ col: 0, row: 2.7, depth: 0 })).toBe(false);
  });
});

describe('createGrid', () => {
  it('creates a 7x7x7 grid of empty cells', () => {
    const grid = createGrid();
    expect(grid).toHaveLength(7);
    expect(getCell(grid, { col: 0, row: 0, depth: 0 })!.state).toBe(CellState.Empty);
    expect(getCell(grid, { col: 6, row: 6, depth: 6 })!.state).toBe(CellState.Empty);
  });
});

describe('getCell', () => {
  it('returns cell for valid coordinates', () => {
    const grid = createGrid();
    const cell = getCell(grid, { col: 3, row: 4, depth: 5 });
    expect(cell).toBeDefined();
    expect(cell!.state).toBe(CellState.Empty);
  });

  it('returns undefined for out-of-bounds', () => {
    const grid = createGrid();
    expect(getCell(grid, { col: 7, row: 0, depth: 0 })).toBeUndefined();
    expect(getCell(grid, { col: 0, row: -1, depth: 0 })).toBeUndefined();
  });
});

describe('setCell', () => {
  it('returns new grid with updated cell', () => {
    const grid = createGrid();
    const coord = { col: 2, row: 3, depth: 4 };
    const newCell = { state: CellState.Ship, shipId: 'typhoon' };

    const newGrid = setCell(grid, coord, newCell);

    expect(getCell(newGrid, coord)!.state).toBe(CellState.Ship);
    expect(getCell(newGrid, coord)!.shipId).toBe('typhoon');
  });

  it('preserves original grid (immutability)', () => {
    const grid = createGrid();
    const coord = { col: 2, row: 3, depth: 4 };
    const newCell = { state: CellState.Ship, shipId: 'typhoon' };

    setCell(grid, coord, newCell);

    expect(getCell(grid, coord)!.state).toBe(CellState.Empty);
  });

  it('throws on invalid coordinate', () => {
    const grid = createGrid();
    expect(() =>
      setCell(grid, { col: 7, row: 0, depth: 0 }, { state: CellState.Empty, shipId: null }),
    ).toThrow();
  });
});

describe('parseCoordinate', () => {
  it('parses valid coordinate strings', () => {
    expect(parseCoordinate('A-1-D1')).toEqual({ col: 0, row: 0, depth: 0 });
    expect(parseCoordinate('C-4-D3')).toEqual({ col: 2, row: 3, depth: 2 });
    expect(parseCoordinate('G-7-D7')).toEqual({ col: 6, row: 6, depth: 6 });
  });

  it('handles case insensitivity', () => {
    expect(parseCoordinate('a-1-d1')).toEqual({ col: 0, row: 0, depth: 0 });
  });

  it('returns null for invalid inputs', () => {
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('Z-1-D1')).toBeNull();
    expect(parseCoordinate('A-0-D1')).toBeNull();
    expect(parseCoordinate('A-8-D1')).toBeNull();
    expect(parseCoordinate('A-1-D0')).toBeNull();
    expect(parseCoordinate('A-1-D8')).toBeNull();
    expect(parseCoordinate('invalid')).toBeNull();
  });
});

describe('formatCoordinate', () => {
  it('formats coordinates correctly', () => {
    expect(formatCoordinate({ col: 0, row: 0, depth: 0 })).toBe('A-1-D1');
    expect(formatCoordinate({ col: 2, row: 3, depth: 2 })).toBe('C-4-D3');
    expect(formatCoordinate({ col: 6, row: 6, depth: 6 })).toBe('G-7-D7');
  });

  it('round-trips with parseCoordinate', () => {
    const coord = { col: 4, row: 5, depth: 6 };
    const str = formatCoordinate(coord);
    const parsed = parseCoordinate(str);
    expect(parsed).toEqual(coord);
  });
});
