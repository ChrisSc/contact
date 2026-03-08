import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import { CellState } from '../../src/types/grid';
import type { Coordinate } from '../../src/types/grid';
import type { PlayerState } from '../../src/types/game';
import { createGrid, getCell, setCell } from '../../src/engine/grid';
import { calculateScanArea, executeReconDrone } from '../../src/engine/drone';

beforeEach(() => {
  initLogger('test-drone');
});

// Helper to create a minimal player state for testing
function createTestPlayerState(overrides?: Partial<PlayerState>): PlayerState {
  return {
    index: 1,
    designation: 'BRAVO',
    ownGrid: createGrid(),
    targetingGrid: createGrid(),
    ships: [],
    abilities: {
      sonar_ping: { earned: false, used: false, active: false, turnsRemaining: null },
      radar_jammer: { earned: false, used: false, active: false, turnsRemaining: null },
      recon_drone: { earned: false, used: false, active: false, turnsRemaining: null },
      decoy: { earned: false, used: false, active: false, turnsRemaining: null },
      depth_charge: { earned: false, used: false, active: false, turnsRemaining: null },
      silent_running: { earned: false, used: false, active: false, turnsRemaining: null },
      g_sonar: { earned: false, used: false, active: false, turnsRemaining: null },
      acoustic_cloak: { earned: false, used: false, active: false, turnsRemaining: null },
    },
    shipsSunk: 0,
    shotsFired: 0,
    shotsHit: 0,
    credits: 5,
    inventory: [],
    lastTurnHit: false,
    ...overrides,
  };
}

describe('calculateScanArea', () => {
  it('center of grid (3,3,4) returns 27 coords', () => {
    const coords = calculateScanArea({ col: 3, row: 3, depth: 4 });
    expect(coords).toHaveLength(27);
    // Should span col 2-4, row 2-4, depth 3-5
    for (const c of coords) {
      expect(c.col).toBeGreaterThanOrEqual(2);
      expect(c.col).toBeLessThanOrEqual(4);
      expect(c.row).toBeGreaterThanOrEqual(2);
      expect(c.row).toBeLessThanOrEqual(4);
      expect(c.depth).toBeGreaterThanOrEqual(3);
      expect(c.depth).toBeLessThanOrEqual(5);
    }
  });

  it('corner (0,0,0) returns 8 coords', () => {
    const coords = calculateScanArea({ col: 0, row: 0, depth: 0 });
    expect(coords).toHaveLength(8);
  });

  it('edge (0,3,0) returns 12 coords', () => {
    const coords = calculateScanArea({ col: 0, row: 3, depth: 0 });
    expect(coords).toHaveLength(12);
  });

  it('face center (0,3,3) returns 18 coords', () => {
    const coords = calculateScanArea({ col: 0, row: 3, depth: 3 });
    expect(coords).toHaveLength(18);
  });

  it('far corner (7,7,7) returns 8 coords', () => {
    const coords = calculateScanArea({ col: 7, row: 7, depth: 7 });
    expect(coords).toHaveLength(8);
  });
});

describe('executeReconDrone', () => {
  it('empty area returns all displayedResult false', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);
    expect(result.jammed).toBe(false);
    expect(result.cloaked).toBe(false);
    expect(result.jammerConsumed).toBe(false);
  });

  it('ship in scan area returns that cell positive', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const centerCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(centerCell!.rawResult).toBe(true);
    expect(centerCell!.displayedResult).toBe(true);
  });

  it('decoy in scan area returns false positive', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 3, depth: 3 }, { state: CellState.Decoy, shipId: null });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const decoyCell = result.cells.find(c => c.coord.col === 4 && c.coord.row === 3 && c.coord.depth === 3);
    expect(decoyCell!.rawResult).toBe(true);
    expect(decoyCell!.displayedResult).toBe(true);
  });

  it('radar jammer active forces all false (GDD 5.4: false scan results), jammerConsumed true', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.abilities.radar_jammer.active = true;
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.jammed).toBe(true);
    expect(result.jammerConsumed).toBe(true);

    // All cells should be false — jammer returns false scan results for drone
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);

    // rawResult should still reflect actual state
    const shipCell = result.cells.find(c => c.coord.col === 3 && c.coord.row === 3 && c.coord.depth === 3);
    expect(shipCell!.rawResult).toBe(true);

    const emptyCell = result.cells.find(c => c.coord.col === 2 && c.coord.row === 2 && c.coord.depth === 2);
    expect(emptyCell!.rawResult).toBe(false);
  });

  it('acoustic cloak active forces all false, jammerConsumed false', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.abilities.acoustic_cloak.active = true;
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.cloaked).toBe(true);
    expect(result.jammerConsumed).toBe(false);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);
  });

  it('both jammer+cloak: cloak wins, jammerConsumed false', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.abilities.radar_jammer.active = true;
    defender.abilities.acoustic_cloak.active = true;
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.jammed).toBe(true);
    expect(result.cloaked).toBe(true);
    expect(result.jammerConsumed).toBe(false);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);
  });

  it('multiple ships returns multiple positives', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.ownGrid = setCell(defender.ownGrid, { col: 2, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'akula' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const positives = result.cells.filter(c => c.displayedResult);
    expect(positives).toHaveLength(2);
  });

  it('every cell result matches actual defender grid state', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    // Place 3 ship cells and 1 decoy within scan range of (4,4,4)
    const shipCoords: Coordinate[] = [
      { col: 3, row: 4, depth: 4 },
      { col: 4, row: 4, depth: 4 },
      { col: 5, row: 4, depth: 4 },
    ];
    for (const c of shipCoords) {
      defender.ownGrid = setCell(defender.ownGrid, c, { state: CellState.Ship, shipId: 'typhoon' });
    }
    const decoyCoord: Coordinate = { col: 4, row: 3, depth: 4 };
    defender.ownGrid = setCell(defender.ownGrid, decoyCoord, { state: CellState.Decoy, shipId: null });

    const result = executeReconDrone({ col: 4, row: 4, depth: 4 }, attacker, defender);

    // Scan area: (3-5, 3-5, 3-5) = 27 cells
    expect(result.cells).toHaveLength(27);

    // Exactly 4 positives (3 ship + 1 decoy)
    const positives = result.cells.filter(c => c.displayedResult);
    expect(positives).toHaveLength(4);

    // Verify every cell individually
    for (const cellResult of result.cells) {
      const defenderCell = getCell(defender.ownGrid, cellResult.coord);
      const expectedPositive = defenderCell!.state === CellState.Ship || defenderCell!.state === CellState.Decoy;
      expect(cellResult.rawResult).toBe(expectedPositive);
      expect(cellResult.displayedResult).toBe(expectedPositive);
    }
  });

  it('ship outside scan range is not detected', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    // Ship at (0,0,0), scan at (4,4,4) — no overlap
    defender.ownGrid = setCell(defender.ownGrid, { col: 0, row: 0, depth: 0 }, { state: CellState.Ship, shipId: 'midget' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 1, row: 0, depth: 0 }, { state: CellState.Ship, shipId: 'midget' });

    const result = executeReconDrone({ col: 4, row: 4, depth: 4 }, attacker, defender);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);
  });

  it('hit cells on defender grid are NOT detected as ships', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    // One ship cell, one already-hit cell in scan area
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 3, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 3, depth: 3 }, { state: CellState.Hit, shipId: 'typhoon' });

    const result = executeReconDrone({ col: 3, row: 3, depth: 3 }, attacker, defender);
    const positives = result.cells.filter(c => c.displayedResult);
    expect(positives).toHaveLength(1);
    expect(positives[0]!.coord).toEqual({ col: 3, row: 3, depth: 3 });
  });
});
