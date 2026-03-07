import type { Grid, Coordinate } from './grid';
import type { Ship } from './fleet';
import type { AbilityId, AbilityState } from './abilities';

export enum GamePhase {
  SetupP1 = 'setup_p1',
  SetupP2 = 'setup_p2',
  Combat = 'combat',
  Victory = 'victory',
}

export type PlayerIndex = 0 | 1;

export type PlayerDesignation = 'ALPHA' | 'BRAVO';

export const PLAYER_DESIGNATIONS: Record<PlayerIndex, PlayerDesignation> = {
  0: 'ALPHA',
  1: 'BRAVO',
};

export interface PlayerState {
  index: PlayerIndex;
  designation: PlayerDesignation;
  ownGrid: Grid;
  targetingGrid: Grid;
  ships: Ship[];
  abilities: Record<AbilityId, AbilityState>;
  shipsSunk: number;
  shotsFired: number;
  shotsHit: number;
}

export interface GameEvent {
  turn: number;
  player: PlayerIndex;
  action: string;
  result: string;
  coordinate?: Coordinate;
}

export interface GameState {
  phase: GamePhase;
  currentPlayer: PlayerIndex;
  turnCount: number;
  players: [PlayerState, PlayerState];
  winner: PlayerIndex | null;
  sessionId: string;
  log: GameEvent[];
}
