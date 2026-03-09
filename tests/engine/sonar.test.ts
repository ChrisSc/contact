import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import { executeSonarPing, calculateSonarArea } from '../../src/engine/sonar';
import { CellState } from '../../src/types/grid';
import { createEmptyPlayerState } from '../setup';

beforeEach(() => {
  initLogger('test-sonar');
});

describe('calculateSonarArea', () => {
  it('returns 8 cells for interior coordinate', () => {
    const coords = calculateSonarArea({ col: 3, row: 3, depth: 3 });
    expect(coords).toHaveLength(8);
  });

  it('clips to grid boundary at max edge', () => {
    // Origin at col=6 means col+1=7 is out of bounds, so only 4 cells
    const coords = calculateSonarArea({ col: 6, row: 3, depth: 3 });
    expect(coords).toHaveLength(4);
  });

  it('returns 1 cell at max corner', () => {
    const coords = calculateSonarArea({ col: 6, row: 6, depth: 6 });
    expect(coords).toHaveLength(1);
  });
});

describe('executeSonarPing', () => {
  it('ping empty 2x2x2 area returns all cells with displayedResult false', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.cells).toHaveLength(8);
    expect(result.cells.every(c => c.rawResult === false)).toBe(true);
    expect(result.cells.every(c => c.displayedResult === false)).toBe(true);
    expect(result.jammed).toBe(false);
    expect(result.cloaked).toBe(false);
  });

  it('ping area containing a ship cell returns that cell as positive', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const shipCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(shipCell!.rawResult).toBe(true);
    expect(shipCell!.displayedResult).toBe(true);

    // Other cells should be negative
    const otherCells = result.cells.filter(c => !(c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3));
    expect(otherCells.every(c => c.displayedResult === false)).toBe(true);
  });

  it('ping decoy cell returns rawResult true, displayedResult true (false positive)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[4]![4]![4] = { state: CellState.Decoy, shipId: null };

    const result = executeSonarPing({ col: 4, row: 4, depth: 4 }, attacker, defender);
    const decoyCell = result.cells.find(c => c.coord.col === 4 && c.coord.row === 4 && c.coord.depth === 4);
    expect(decoyCell!.rawResult).toBe(true);
    expect(decoyCell!.displayedResult).toBe(true);
  });

  it('with radar_jammer active: jammed true, results inverted per cell', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[2]![2]![2] = { state: CellState.Ship, shipId: 'akula' };
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 2, row: 2, depth: 2 }, attacker, defender);
    expect(result.jammed).toBe(true);

    // Ship cell: raw=true, jammer inverts to false
    const shipCell = result.cells.find(c => c.coord.col === 2 && c.coord.row === 2 && c.coord.depth === 2);
    expect(shipCell!.rawResult).toBe(true);
    expect(shipCell!.displayedResult).toBe(false);

    // Empty cells: raw=false, jammer inverts to true
    const emptyCells = result.cells.filter(c => !(c.coord.col === 2 && c.coord.row === 2 && c.coord.depth === 2));
    expect(emptyCells.every(c => c.displayedResult === true)).toBe(true);
  });

  it('with acoustic_cloak active: cloaked true, all displayedResult false', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[1]![1]![1] = { state: CellState.Ship, shipId: 'seawolf' };
    defender.abilities.acoustic_cloak = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 1, row: 1, depth: 1 }, attacker, defender);
    expect(result.cloaked).toBe(true);
    expect(result.cells.every(c => c.displayedResult === false)).toBe(true);
  });

  it('silent running ship is masked (displayedResult false, silentRunning true)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }];

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const shipCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(shipCell!.rawResult).toBe(true);
    expect(shipCell!.silentRunning).toBe(true);
    expect(shipCell!.displayedResult).toBe(false);
  });

  it('silent running does not mask decoy (decoy has null shipId)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Decoy, shipId: null };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }];

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const decoyCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(decoyCell!.rawResult).toBe(true);
    expect(decoyCell!.silentRunning).toBe(false);
    expect(decoyCell!.displayedResult).toBe(true);
  });

  it('silent running takes priority over jammer for SR ship', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 1 }];
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const shipCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(shipCell!.rawResult).toBe(true);
    expect(shipCell!.silentRunning).toBe(true);
    expect(result.jammed).toBe(true);
    // SR takes priority: displayedResult is false (masked), NOT jammer-inverted
    expect(shipCell!.displayedResult).toBe(false);
  });

  it('non-SR ship still affected by jammer normally', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'akula' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }]; // different ship
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const shipCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(shipCell!.rawResult).toBe(true);
    expect(shipCell!.silentRunning).toBe(false);
    expect(result.jammed).toBe(true);
    expect(shipCell!.displayedResult).toBe(false); // jammer inverts true -> false
  });

  it('multiple ships in 2x2x2 area are all detected', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };
    defender.ownGrid[4]![4]![4] = { state: CellState.Ship, shipId: 'akula' };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const positives = result.cells.filter(c => c.displayedResult);
    expect(positives).toHaveLength(2);
  });
});
