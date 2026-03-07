import type { Coordinate, Grid } from '../../types/grid';
import { CellState, COLUMN_LABELS, GRID_SIZE } from '../../types/grid';
import { getCell } from '../../engine/grid';

export interface SliceGridOptions {
  grid: Grid;
  depth: number;
  showShips: boolean;
  onCellClick?: (coord: Coordinate) => void;
  onCellHover?: (coord: Coordinate | null) => void;
  ghostCells?: Coordinate[];
  ghostValid?: boolean;
}

const CELL_STATE_CLASS: Record<string, string> = {
  [CellState.Empty]: 'cell-empty',
  [CellState.Ship]: 'cell-ship',
  [CellState.Hit]: 'cell-hit',
  [CellState.Miss]: 'cell-miss',
  [CellState.Sunk]: 'cell-sunk',
  [CellState.Decoy]: 'cell-decoy',
  [CellState.DecoyHit]: 'cell-hit',
  [CellState.DronePositive]: 'cell-hit',
  [CellState.DroneNegative]: 'cell-miss',
  [CellState.SonarPositive]: 'cell-hit',
  [CellState.SonarNegative]: 'cell-miss',
};

export class SliceGrid {
  private el: HTMLElement;
  private options: SliceGridOptions;
  private cellEls: HTMLElement[][] = [];
  private ghostSet: Set<string> = new Set();
  private hoveredCell: HTMLElement | null = null;

  constructor(options: SliceGridOptions) {
    this.options = { ...options };
    this.el = document.createElement('div');
    this.el.className = 'slice-grid';
    this.applyGhost();
    this.buildGrid();
    this.attachListeners();
  }

  private buildGrid(): void {
    // Corner spacer
    const corner = document.createElement('div');
    corner.className = 'slice-grid__corner';
    this.el.appendChild(corner);

    // Column headers
    for (let col = 0; col < GRID_SIZE; col++) {
      const header = document.createElement('div');
      header.className = 'slice-grid__col-header';
      header.textContent = COLUMN_LABELS[col]!;
      this.el.appendChild(header);
    }

    // Rows
    for (let row = 0; row < GRID_SIZE; row++) {
      // Row label
      const label = document.createElement('div');
      label.className = 'slice-grid__row-label';
      label.textContent = String(row + 1);
      this.el.appendChild(label);

      this.cellEls[row] = [];
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = 'slice-grid__cell';
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        this.cellEls[row]![col] = cell;
        this.updateCellClass(cell, col, row);
        this.el.appendChild(cell);
      }
    }
  }

  private updateCellClass(cellEl: HTMLElement, col: number, row: number): void {
    const coord: Coordinate = { col, row, depth: this.options.depth };
    const cell = getCell(this.options.grid, coord);
    const state = cell?.state ?? CellState.Empty;

    // If ships hidden (targeting grid), show ship cells as empty
    let cssClass: string;
    if (!this.options.showShips && (state === CellState.Ship || state === CellState.Decoy)) {
      cssClass = 'cell-empty';
    } else {
      cssClass = CELL_STATE_CLASS[state] ?? 'cell-empty';
    }

    // Remove old state classes
    cellEl.className = 'slice-grid__cell';
    cellEl.classList.add(cssClass);

    // Ghost overlay
    const key = `${col},${row}`;
    if (this.ghostSet.has(key)) {
      cellEl.classList.remove(cssClass);
      cellEl.classList.add(
        this.options.ghostValid !== false ? 'cell-ghost' : 'cell-ghost-invalid',
      );
    }
  }

  private attachListeners(): void {
    this.el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.slice-grid__cell') as HTMLElement | null;
      if (!target || !this.options.onCellClick) return;
      const col = Number(target.dataset.col);
      const row = Number(target.dataset.row);
      this.options.onCellClick({ col, row, depth: this.options.depth });
    });

    this.el.addEventListener('mousemove', (e) => {
      const target = (e.target as HTMLElement).closest('.slice-grid__cell') as HTMLElement | null;
      if (target === this.hoveredCell) return;

      if (this.hoveredCell) {
        this.hoveredCell.classList.remove('cell-hover');
      }

      this.hoveredCell = target;
      if (target) {
        target.classList.add('cell-hover');
        const col = Number(target.dataset.col);
        const row = Number(target.dataset.row);
        this.options.onCellHover?.({ col, row, depth: this.options.depth });
      }
    });

    this.el.addEventListener('mouseleave', () => {
      if (this.hoveredCell) {
        this.hoveredCell.classList.remove('cell-hover');
        this.hoveredCell = null;
      }
      this.options.onCellHover?.(null);
    });
  }

  update(options: Partial<SliceGridOptions>): void {
    Object.assign(this.options, options);
    this.applyGhost();
    this.refreshAllCells();
  }

  setGhostCells(cells: Coordinate[], valid: boolean): void {
    this.options.ghostCells = cells;
    this.options.ghostValid = valid;
    this.applyGhost();
    this.refreshAllCells();
  }

  clearGhostCells(): void {
    this.options.ghostCells = undefined;
    this.options.ghostValid = undefined;
    this.ghostSet.clear();
    this.refreshAllCells();
  }

  private applyGhost(): void {
    this.ghostSet.clear();
    if (this.options.ghostCells) {
      for (const c of this.options.ghostCells) {
        if (c.depth === this.options.depth) {
          this.ghostSet.add(`${c.col},${c.row}`);
        }
      }
    }
  }

  private refreshAllCells(): void {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        this.updateCellClass(this.cellEls[row]![col]!, col, row);
      }
    }
  }

  render(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    this.el.remove();
  }
}

export { CELL_STATE_CLASS };
