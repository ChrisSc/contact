import { describe, it, expect } from 'vitest';
import { createEmptyGrid } from '../setup';
import { CellState, GRID_SIZE } from '../../src/types/grid';

describe('Grid', () => {
  it('should create an 8x8x8 grid with 512 cells', () => {
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

    expect(cellCount).toBe(512);
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
