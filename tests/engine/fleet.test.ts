import { describe, it, expect, beforeEach } from 'vitest';
import { CellState } from '../../src/types/grid';
import { FLEET_ROSTER } from '../../src/types/fleet';
import type { FleetRosterEntry } from '../../src/types/fleet';
import { createGrid, getCell, setCell } from '../../src/engine/grid';
import {
  calculateShipCells,
  validatePlacement,
  placeShip,
  removeShip,
  placeDecoy,
  isFleetComplete,
  checkSunk,
  getShipHealth,
} from '../../src/engine/fleet';
import { initLogger, getLogger } from '../../src/observability/logger';

beforeEach(() => {
  initLogger('test-session');
});

const typhoon = FLEET_ROSTER[0]!;
const akula = FLEET_ROSTER[1]!;
const seawolf = FLEET_ROSTER[2]!;
const virginia = FLEET_ROSTER[3]!;
const midget = FLEET_ROSTER[4]!;

describe('calculateShipCells', () => {
  it('extends along col axis', () => {
    const cells = calculateShipCells({ col: 0, row: 0, depth: 0 }, 'col', 3);
    expect(cells).toEqual([
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
      { col: 2, row: 0, depth: 0 },
    ]);
  });

  it('extends along row axis', () => {
    const cells = calculateShipCells({ col: 2, row: 1, depth: 3 }, 'row', 2);
    expect(cells).toEqual([
      { col: 2, row: 1, depth: 3 },
      { col: 2, row: 2, depth: 3 },
    ]);
  });

  it('extends along diag+ axis (col and row increase)', () => {
    const cells = calculateShipCells({ col: 0, row: 0, depth: 2 }, 'diag+', 3);
    expect(cells).toEqual([
      { col: 0, row: 0, depth: 2 },
      { col: 1, row: 1, depth: 2 },
      { col: 2, row: 2, depth: 2 },
    ]);
  });

  it('extends along diag- axis (col increases, row decreases)', () => {
    const cells = calculateShipCells({ col: 0, row: 4, depth: 1 }, 'diag-', 3);
    expect(cells).toEqual([
      { col: 0, row: 4, depth: 1 },
      { col: 1, row: 3, depth: 1 },
      { col: 2, row: 2, depth: 1 },
    ]);
  });

  it('stays at consistent depth for within-slice axes', () => {
    for (const axis of ['col', 'row', 'diag+', 'diag-'] as const) {
      const cells = calculateShipCells({ col: 3, row: 3, depth: 5 }, axis, 2);
      for (const cell of cells) {
        expect(cell.depth).toBe(5);
      }
    }
  });

  it('extends along col-depth axis (col and depth increase)', () => {
    const cells = calculateShipCells({ col: 0, row: 2, depth: 0 }, 'col-depth', 3);
    expect(cells).toEqual([
      { col: 0, row: 2, depth: 0 },
      { col: 1, row: 2, depth: 1 },
      { col: 2, row: 2, depth: 2 },
    ]);
  });

  it('extends along row-depth axis (row and depth increase)', () => {
    const cells = calculateShipCells({ col: 3, row: 0, depth: 1 }, 'row-depth', 4);
    expect(cells).toEqual([
      { col: 3, row: 0, depth: 1 },
      { col: 3, row: 1, depth: 2 },
      { col: 3, row: 2, depth: 3 },
      { col: 3, row: 3, depth: 4 },
    ]);
  });

  it('extends along col-depth- axis (col increases, depth decreases)', () => {
    const cells = calculateShipCells({ col: 0, row: 2, depth: 4 }, 'col-depth-', 3);
    expect(cells).toEqual([
      { col: 0, row: 2, depth: 4 },
      { col: 1, row: 2, depth: 3 },
      { col: 2, row: 2, depth: 2 },
    ]);
  });

  it('extends along row-depth- axis (row increases, depth decreases)', () => {
    const cells = calculateShipCells({ col: 3, row: 0, depth: 5 }, 'row-depth-', 4);
    expect(cells).toEqual([
      { col: 3, row: 0, depth: 5 },
      { col: 3, row: 1, depth: 4 },
      { col: 3, row: 2, depth: 3 },
      { col: 3, row: 3, depth: 2 },
    ]);
  });
});

describe('validatePlacement', () => {
  it('accepts valid placement', () => {
    const grid = createGrid();
    const result = validatePlacement(grid, typhoon, { col: 0, row: 0, depth: 0 }, 'col');
    expect(result.valid).toBe(true);
  });

  it('rejects placement that extends outside grid', () => {
    const grid = createGrid();
    // Typhoon (size 5) at col 4 along col axis would reach col 8 (out of bounds)
    const result = validatePlacement(grid, typhoon, { col: 4, row: 0, depth: 0 }, 'col');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('boundaries');
  });

  it('rejects diag- placement that goes below row 0', () => {
    const grid = createGrid();
    // diag- from row 1, size 3: rows 1, 0, -1 — OOB
    const result = validatePlacement(grid, seawolf, { col: 0, row: 1, depth: 0 }, 'diag-');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('boundaries');
  });

  it('rejects col-depth- placement that goes below depth 0', () => {
    const grid = createGrid();
    // col-depth- from depth 1, size 3: depths 1, 0, -1 — OOB
    const result = validatePlacement(grid, seawolf, { col: 0, row: 0, depth: 1 }, 'col-depth-');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('boundaries');
  });

  it('rejects row-depth- placement that goes below depth 0', () => {
    const grid = createGrid();
    const result = validatePlacement(grid, seawolf, { col: 0, row: 0, depth: 1 }, 'row-depth-');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('boundaries');
  });

  it('accepts valid col-depth- placement', () => {
    const grid = createGrid();
    const result = validatePlacement(grid, seawolf, { col: 0, row: 0, depth: 4 }, 'col-depth-');
    expect(result.valid).toBe(true);
  });

  it('accepts valid row-depth- placement', () => {
    const grid = createGrid();
    const result = validatePlacement(grid, seawolf, { col: 0, row: 0, depth: 4 }, 'row-depth-');
    expect(result.valid).toBe(true);
  });

  it('accepts valid diagonal placement', () => {
    const grid = createGrid();
    const result = validatePlacement(grid, seawolf, { col: 0, row: 0, depth: 0 }, 'diag+');
    expect(result.valid).toBe(true);
  });

  it('rejects overlapping placement', () => {
    let grid = createGrid();
    grid = setCell(grid, { col: 2, row: 0, depth: 0 }, { state: CellState.Ship, shipId: 'akula' });

    const result = validatePlacement(grid, typhoon, { col: 0, row: 0, depth: 0 }, 'col');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('overlap');
  });
});

describe('placeShip', () => {
  it('places ship and marks grid cells', () => {
    const grid = createGrid();
    const result = placeShip(grid, midget, { col: 0, row: 0, depth: 0 }, 'col', 0);

    expect(result).not.toBeNull();
    expect(getCell(result!.grid, { col: 0, row: 0, depth: 0 })!.state).toBe(CellState.Ship);
    expect(getCell(result!.grid, { col: 1, row: 0, depth: 0 })!.state).toBe(CellState.Ship);
    expect(getCell(result!.grid, { col: 1, row: 0, depth: 0 })!.shipId).toBe('midget');
  });

  it('returns correct Ship object', () => {
    const grid = createGrid();
    const result = placeShip(grid, seawolf, { col: 0, row: 0, depth: 0 }, 'row', 1);

    expect(result!.ship.id).toBe('seawolf');
    expect(result!.ship.size).toBe(3);
    expect(result!.ship.cells).toHaveLength(3);
    expect(result!.ship.hits).toBe(0);
    expect(result!.ship.sunk).toBe(false);
  });

  it('returns null on invalid placement', () => {
    const grid = createGrid();
    const result = placeShip(grid, typhoon, { col: 5, row: 0, depth: 0 }, 'col', 0);
    expect(result).toBeNull();
  });
});

describe('removeShip', () => {
  it('reverts cells to Empty', () => {
    const grid = createGrid();
    const placed = placeShip(grid, midget, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    const cleared = removeShip(placed.grid, placed.ship);

    expect(getCell(cleared, { col: 0, row: 0, depth: 0 })!.state).toBe(CellState.Empty);
    expect(getCell(cleared, { col: 1, row: 0, depth: 0 })!.state).toBe(CellState.Empty);
  });
});

describe('placeDecoy', () => {
  it('marks cell as Decoy', () => {
    const grid = createGrid();
    const result = placeDecoy(grid, { col: 3, row: 3, depth: 3 }, 0);
    expect(result).not.toBeNull();
    expect(getCell(result!, { col: 3, row: 3, depth: 3 })!.state).toBe(CellState.Decoy);
  });

  it('rejects occupied cell', () => {
    let grid = createGrid();
    grid = setCell(grid, { col: 0, row: 0, depth: 0 }, { state: CellState.Ship, shipId: 'x' });
    const result = placeDecoy(grid, { col: 0, row: 0, depth: 0 }, 0);
    expect(result).toBeNull();
  });
});

describe('isFleetComplete', () => {
  it('returns true when all 5 ships placed', () => {
    const grid = createGrid();
    const ships = FLEET_ROSTER.map((r, i) => {
      const result = placeShip(createGrid(), r, { col: 0, row: i, depth: 0 }, 'col', 0);
      return result!.ship;
    });
    expect(isFleetComplete(ships)).toBe(true);
  });

  it('returns false with fewer than 5 ships', () => {
    expect(isFleetComplete([])).toBe(false);
    const result = placeShip(createGrid(), midget, { col: 0, row: 0, depth: 0 }, 'col', 0);
    expect(isFleetComplete([result!.ship])).toBe(false);
  });
});

describe('checkSunk', () => {
  it('returns sunk=false when not all cells hit', () => {
    let grid = createGrid();
    const placed = placeShip(grid, midget, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    // Hit only first cell
    grid = setCell(placed.grid, { col: 0, row: 0, depth: 0 }, { state: CellState.Hit, shipId: 'midget' });

    const result = checkSunk(placed.ship, grid);
    expect(result.sunk).toBe(false);
  });

  it('returns sunk=true and marks cells Sunk when all hit', () => {
    let grid = createGrid();
    const placed = placeShip(grid, midget, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    grid = setCell(placed.grid, { col: 0, row: 0, depth: 0 }, { state: CellState.Hit, shipId: 'midget' });
    grid = setCell(grid, { col: 1, row: 0, depth: 0 }, { state: CellState.Hit, shipId: 'midget' });

    const result = checkSunk(placed.ship, grid);
    expect(result.sunk).toBe(true);
    expect(result.ship.sunk).toBe(true);
    expect(getCell(result.grid, { col: 0, row: 0, depth: 0 })!.state).toBe(CellState.Sunk);
    expect(getCell(result.grid, { col: 1, row: 0, depth: 0 })!.state).toBe(CellState.Sunk);
  });
});

describe('getShipHealth', () => {
  it('returns full health for undamaged ship', () => {
    const grid = createGrid();
    const result = placeShip(grid, seawolf, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    expect(getShipHealth(result.ship)).toBe(3);
  });

  it('returns reduced health after hits', () => {
    const grid = createGrid();
    const result = placeShip(grid, seawolf, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    result.ship.hits = 2;
    expect(getShipHealth(result.ship)).toBe(1);
  });

  it('returns zero health when fully damaged', () => {
    const grid = createGrid();
    const result = placeShip(grid, midget, { col: 0, row: 0, depth: 0 }, 'col', 0)!;
    result.ship.hits = 2;
    expect(getShipHealth(result.ship)).toBe(0);
  });
});

describe('placeDecoy event', () => {
  it('emits fleet.decoy_place event', () => {
    const grid = createGrid();
    placeDecoy(grid, { col: 3, row: 3, depth: 3 }, 0);
    const events = getLogger().getBuffer();
    const decoyEvents = events.filter((e) => e.event === 'fleet.decoy_place');
    expect(decoyEvents.length).toBe(1);
    expect(decoyEvents[0]!.data.origin).toBe('D-4-D4');
  });
});
