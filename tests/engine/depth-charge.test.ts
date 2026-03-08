import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import { CellState } from '../../src/types/grid';
import { createGrid, setCell } from '../../src/engine/grid';
import { calculateDepthChargeTargets } from '../../src/engine/depth-charge';
import { createEmptyPlayerState } from '../setup';

beforeEach(() => {
  initLogger('test-depth-charge');
});

describe('calculateDepthChargeTargets', () => {
  it('empty area returns all cells with CellState.Empty and no alreadyResolved', () => {
    const defender = createEmptyPlayerState(1);
    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);

    expect(result.center).toEqual({ col: 4, row: 4, depth: 4 });
    expect(result.cells).toHaveLength(27);
    for (const cell of result.cells) {
      expect(cell.cellState).toBe(CellState.Empty);
      expect(cell.shipId).toBeNull();
      expect(cell.alreadyResolved).toBe(false);
    }
  });

  it('ship in zone returns cellState=Ship with correct shipId', () => {
    const defender = createEmptyPlayerState(1);
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 4, depth: 4 }, {
      state: CellState.Ship, shipId: 'typhoon',
    });

    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);
    const shipCell = result.cells.find(
      c => c.coord.col === 4 && c.coord.row === 4 && c.coord.depth === 4,
    );
    expect(shipCell!.cellState).toBe(CellState.Ship);
    expect(shipCell!.shipId).toBe('typhoon');
    expect(shipCell!.alreadyResolved).toBe(false);
  });

  it('multiple ships in zone detected', () => {
    const defender = createEmptyPlayerState(1);
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 4, depth: 4 }, {
      state: CellState.Ship, shipId: 'typhoon',
    });
    defender.ownGrid = setCell(defender.ownGrid, { col: 5, row: 4, depth: 4 }, {
      state: CellState.Ship, shipId: 'akula',
    });

    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);
    const shipCells = result.cells.filter(c => c.cellState === CellState.Ship);
    expect(shipCells).toHaveLength(2);
  });

  it('already-hit cells marked as alreadyResolved', () => {
    const defender = createEmptyPlayerState(1);
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 4, depth: 4 }, {
      state: CellState.Hit, shipId: 'typhoon',
    });
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 4, depth: 4 }, {
      state: CellState.Miss, shipId: null,
    });
    defender.ownGrid = setCell(defender.ownGrid, { col: 5, row: 4, depth: 4 }, {
      state: CellState.Sunk, shipId: 'akula',
    });
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 3, depth: 4 }, {
      state: CellState.DecoyHit, shipId: null,
    });

    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);
    const resolved = result.cells.filter(c => c.alreadyResolved);
    expect(resolved).toHaveLength(4);
  });

  it('decoy in zone returns cellState=Decoy with null shipId', () => {
    const defender = createEmptyPlayerState(1);
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 4, depth: 4 }, {
      state: CellState.Decoy, shipId: null,
    });

    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);
    const decoyCell = result.cells.find(
      c => c.coord.col === 4 && c.coord.row === 4 && c.coord.depth === 4,
    );
    expect(decoyCell!.cellState).toBe(CellState.Decoy);
    expect(decoyCell!.shipId).toBeNull();
    expect(decoyCell!.alreadyResolved).toBe(false);
  });

  it('corner center returns fewer than 27 cells', () => {
    const defender = createEmptyPlayerState(1);
    const result = calculateDepthChargeTargets({ col: 0, row: 0, depth: 0 }, defender);
    expect(result.cells).toHaveLength(8); // 2x2x2
  });

  it('edge center returns 12 cells', () => {
    const defender = createEmptyPlayerState(1);
    const result = calculateDepthChargeTargets({ col: 0, row: 3, depth: 0 }, defender);
    expect(result.cells).toHaveLength(12);
  });

  it('sonar/drone scan states are not alreadyResolved', () => {
    const defender = createEmptyPlayerState(1);
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 4, depth: 4 }, {
      state: CellState.SonarPositive, shipId: null,
    });
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 4, depth: 4 }, {
      state: CellState.DroneNegative, shipId: null,
    });

    const result = calculateDepthChargeTargets({ col: 4, row: 4, depth: 4 }, defender);
    const sonarCell = result.cells.find(
      c => c.coord.col === 4 && c.coord.row === 4 && c.coord.depth === 4,
    );
    expect(sonarCell!.alreadyResolved).toBe(false);
  });
});
