// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SliceGrid, CELL_STATE_CLASS } from '../../src/ui/components/slice-grid';
import { CellState, GRID_SIZE } from '../../src/types/grid';
import type { Coordinate, Grid } from '../../src/types/grid';
import { createGrid, setCell } from '../../src/engine/grid';
import { initLogger } from '../../src/observability/logger';

describe('SliceGrid', () => {
  let grid: Grid;

  beforeEach(() => {
    initLogger('test');
    grid = createGrid();
  });

  it('renders a 7x7 grid with headers and labels', () => {
    const sg = new SliceGrid({ grid, depth: 0, showShips: true });
    const el = sg.render();
    document.body.appendChild(el);

    // 1 corner + 7 col headers + 7*(1 label + 7 cells) = 1 + 7 + 56 = 64
    expect(el.children.length).toBe(64);

    // Column headers
    const headers = el.querySelectorAll('.slice-grid__col-header');
    expect(headers.length).toBe(7);
    expect(headers[0]!.textContent).toBe('A');
    expect(headers[6]!.textContent).toBe('G');

    // Row labels
    const labels = el.querySelectorAll('.slice-grid__row-label');
    expect(labels.length).toBe(7);
    expect(labels[0]!.textContent).toBe('1');

    sg.destroy();
  });

  it('maps empty cells to cell-empty class', () => {
    const sg = new SliceGrid({ grid, depth: 0, showShips: true });
    const el = sg.render();
    document.body.appendChild(el);

    const cells = el.querySelectorAll('.slice-grid__cell');
    expect(cells.length).toBe(49);
    for (const cell of cells) {
      expect(cell.classList.contains('cell-empty')).toBe(true);
    }

    sg.destroy();
  });

  it('maps ship cells to cell-ship class when showShips is true', () => {
    const coord: Coordinate = { col: 0, row: 0, depth: 0 };
    grid = setCell(grid, coord, { state: CellState.Ship, shipId: 'test' });

    const sg = new SliceGrid({ grid, depth: 0, showShips: true });
    const el = sg.render();
    document.body.appendChild(el);

    const cell = el.querySelector('[data-col="0"][data-row="0"]')!;
    expect(cell.classList.contains('cell-ship')).toBe(true);

    sg.destroy();
  });

  it('hides ship cells when showShips is false', () => {
    const coord: Coordinate = { col: 0, row: 0, depth: 0 };
    grid = setCell(grid, coord, { state: CellState.Ship, shipId: 'test' });

    const sg = new SliceGrid({ grid, depth: 0, showShips: false });
    const el = sg.render();
    document.body.appendChild(el);

    const cell = el.querySelector('[data-col="0"][data-row="0"]')!;
    expect(cell.classList.contains('cell-empty')).toBe(true);

    sg.destroy();
  });

  it('maps hit cells correctly', () => {
    grid = setCell(grid, { col: 2, row: 3, depth: 0 }, { state: CellState.Hit, shipId: 'x' });

    const sg = new SliceGrid({ grid, depth: 0, showShips: true });
    const el = sg.render();
    document.body.appendChild(el);

    const cell = el.querySelector('[data-col="2"][data-row="3"]')!;
    expect(cell.classList.contains('cell-hit')).toBe(true);

    sg.destroy();
  });

  it('shows ghost cells with valid styling', () => {
    const ghosts: Coordinate[] = [
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
    ];

    const sg = new SliceGrid({
      grid, depth: 0, showShips: true,
      ghostCells: ghosts, ghostValid: true,
    });
    const el = sg.render();
    document.body.appendChild(el);

    const cell0 = el.querySelector('[data-col="0"][data-row="0"]')!;
    const cell1 = el.querySelector('[data-col="1"][data-row="0"]')!;
    expect(cell0.classList.contains('cell-ghost')).toBe(true);
    expect(cell1.classList.contains('cell-ghost')).toBe(true);

    sg.destroy();
  });

  it('shows ghost cells with invalid styling', () => {
    const ghosts: Coordinate[] = [{ col: 0, row: 0, depth: 0 }];

    const sg = new SliceGrid({
      grid, depth: 0, showShips: true,
      ghostCells: ghosts, ghostValid: false,
    });
    const el = sg.render();
    document.body.appendChild(el);

    const cell = el.querySelector('[data-col="0"][data-row="0"]')!;
    expect(cell.classList.contains('cell-ghost-invalid')).toBe(true);

    sg.destroy();
  });

  it('only shows ghosts for matching depth', () => {
    const ghosts: Coordinate[] = [
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 3 },  // different depth
    ];

    const sg = new SliceGrid({
      grid, depth: 0, showShips: true,
      ghostCells: ghosts, ghostValid: true,
    });
    const el = sg.render();
    document.body.appendChild(el);

    const cell0 = el.querySelector('[data-col="0"][data-row="0"]')!;
    const cell1 = el.querySelector('[data-col="1"][data-row="0"]')!;
    expect(cell0.classList.contains('cell-ghost')).toBe(true);
    expect(cell1.classList.contains('cell-empty')).toBe(true);

    sg.destroy();
  });

  it('fires onCellClick with correct coordinate', () => {
    let clicked: Coordinate | null = null;
    const sg = new SliceGrid({
      grid, depth: 2, showShips: true,
      onCellClick: (c) => { clicked = c; },
    });
    const el = sg.render();
    document.body.appendChild(el);

    const cell = el.querySelector('[data-col="3"][data-row="5"]') as HTMLElement;
    cell.click();

    expect(clicked).toEqual({ col: 3, row: 5, depth: 2 });

    sg.destroy();
  });

  it('CELL_STATE_CLASS covers all relevant states', () => {
    expect(CELL_STATE_CLASS[CellState.Empty]).toBe('cell-empty');
    expect(CELL_STATE_CLASS[CellState.Ship]).toBe('cell-ship');
    expect(CELL_STATE_CLASS[CellState.Hit]).toBe('cell-hit');
    expect(CELL_STATE_CLASS[CellState.Miss]).toBe('cell-miss');
    expect(CELL_STATE_CLASS[CellState.Sunk]).toBe('cell-sunk');
    expect(CELL_STATE_CLASS[CellState.Decoy]).toBe('cell-decoy');
  });
});
