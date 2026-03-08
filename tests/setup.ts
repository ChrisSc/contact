import { CellState, GRID_SIZE } from '../src/types/grid';
import type { Grid, Cell, Coordinate } from '../src/types/grid';
import type { PlayerState, GameState } from '../src/types/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../src/types/game';
import type { AbilityId, AbilityState } from '../src/types/abilities';

const ALL_ABILITY_IDS: AbilityId[] = [
  'sonar_ping',
  'radar_jammer',
  'recon_drone',
  'decoy',
  'depth_charge',
  'silent_running',
  'g_sonar',
  'acoustic_cloak',
];

function createDefaultAbilityState(): AbilityState {
  return { earned: false, used: false, active: false, turnsRemaining: null };
}

function createDefaultAbilities(): Record<AbilityId, AbilityState> {
  const abilities = {} as Record<AbilityId, AbilityState>;
  for (const id of ALL_ABILITY_IDS) {
    abilities[id] = createDefaultAbilityState();
  }
  return abilities;
}

export function createEmptyGrid(): Grid {
  const grid: Grid = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    grid[col] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      grid[col]![row] = [];
      for (let depth = 0; depth < GRID_SIZE; depth++) {
        const cell: Cell = { state: CellState.Empty, shipId: null };
        grid[col]![row]![depth] = cell;
      }
    }
  }
  return grid;
}

export function createEmptyPlayerState(index: 0 | 1): PlayerState {
  return {
    index,
    designation: PLAYER_DESIGNATIONS[index],
    ownGrid: createEmptyGrid(),
    targetingGrid: createEmptyGrid(),
    ships: [],
    abilities: createDefaultAbilities(),
    shipsSunk: 0,
    shotsFired: 0,
    shotsHit: 0,
    credits: 5,
    inventory: [],
    lastTurnHit: false,
  };
}

export function createDefaultGameState(): GameState {
  return {
    phase: GamePhase.SetupP1,
    currentPlayer: 0,
    turnCount: 0,
    players: [createEmptyPlayerState(0), createEmptyPlayerState(1)],
    winner: null,
    sessionId: 'test-session',
    log: [],
  };
}

export function createCoordinate(col: number, row: number, depth: number): Coordinate {
  return { col, row, depth };
}
