import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import { CellState } from '../../src/types/grid';
import type { PlayerState } from '../../src/types/game';
import { createGrid, setCell } from '../../src/engine/grid';
import { executeGSonar } from '../../src/engine/g-sonar';

beforeEach(() => {
  initLogger('test-gsonar');
});

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
    silentRunningShips: [],
    ...overrides,
  };
}

describe('executeGSonar', () => {
  it('empty layer returns all false displayedResult', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    const result = executeGSonar(3, attacker, defender);
    expect(result.cells).toHaveLength(64);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);
    expect(result.cells.every(c => !c.rawResult)).toBe(true);
    expect(result.cloaked).toBe(false);
  });

  it('layer with ships returns true displayedResult for ship cells', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    // Place ships at depth 2
    defender.ownGrid = setCell(defender.ownGrid, { col: 0, row: 0, depth: 2 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 1, row: 0, depth: 2 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 3, row: 5, depth: 2 }, { state: CellState.Ship, shipId: 'akula' });

    const result = executeGSonar(2, attacker, defender);
    expect(result.cells).toHaveLength(64);

    const positives = result.cells.filter(c => c.displayedResult);
    expect(positives).toHaveLength(3);

    // Verify specific cells
    const typhoonCell = result.cells.find(c => c.coord.col === 0 && c.coord.row === 0);
    expect(typhoonCell!.rawResult).toBe(true);
    expect(typhoonCell!.displayedResult).toBe(true);
  });

  it('decoy returns true displayedResult (false positive)', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    defender.ownGrid = setCell(defender.ownGrid, { col: 4, row: 4, depth: 5 }, { state: CellState.Decoy, shipId: null });

    const result = executeGSonar(5, attacker, defender);
    const decoyCell = result.cells.find(c => c.coord.col === 4 && c.coord.row === 4);
    expect(decoyCell!.rawResult).toBe(true);
    expect(decoyCell!.displayedResult).toBe(true);
  });

  it('SR ship returns false displayedResult', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    defender.ownGrid = setCell(defender.ownGrid, { col: 2, row: 2, depth: 0 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 5, row: 5, depth: 0 }, { state: CellState.Ship, shipId: 'akula' });
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }];

    const result = executeGSonar(0, attacker, defender);

    // Typhoon is SR'd -> masked
    const typhoonCell = result.cells.find(c => c.coord.col === 2 && c.coord.row === 2);
    expect(typhoonCell!.rawResult).toBe(true);
    expect(typhoonCell!.displayedResult).toBe(false);

    // Akula is not SR'd -> visible
    const akulaCell = result.cells.find(c => c.coord.col === 5 && c.coord.row === 5);
    expect(akulaCell!.rawResult).toBe(true);
    expect(akulaCell!.displayedResult).toBe(true);
  });

  it('acoustic cloak active returns all false displayedResult, cloaked=true', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();
    defender.abilities.acoustic_cloak.active = true;

    defender.ownGrid = setCell(defender.ownGrid, { col: 1, row: 1, depth: 3 }, { state: CellState.Ship, shipId: 'typhoon' });
    defender.ownGrid = setCell(defender.ownGrid, { col: 6, row: 6, depth: 3 }, { state: CellState.Decoy, shipId: null });

    const result = executeGSonar(3, attacker, defender);
    expect(result.cloaked).toBe(true);
    expect(result.cells.every(c => !c.displayedResult)).toBe(true);

    // Raw results still reflect actual state
    const shipCell = result.cells.find(c => c.coord.col === 1 && c.coord.row === 1);
    expect(shipCell!.rawResult).toBe(true);
  });

  it('cells not marked as written (GameController sets this)', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    const result = executeGSonar(0, attacker, defender);
    expect(result.cells.every(c => !c.written)).toBe(true);
  });

  it('all cells have correct depth coordinate', () => {
    const attacker = createTestPlayerState({ index: 0, designation: 'ALPHA' });
    const defender = createTestPlayerState();

    const result = executeGSonar(5, attacker, defender);
    expect(result.depth).toBe(5);
    expect(result.cells.every(c => c.coord.depth === 5)).toBe(true);
  });
});
