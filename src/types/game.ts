import type { Grid } from './grid';
import type { Ship } from './fleet';
import type { AbilityId, AbilityState, PerkInstance } from './abilities';

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

export interface SilentRunningEntry {
  shipId: string;
  turnsRemaining: number;
}

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
  credits: number;
  inventory: PerkInstance[];
  perksUsed: number;
  lastTurnHit: boolean;
  silentRunningShips: SilentRunningEntry[];
}

export interface TurnSlots {
  pingUsed: boolean;
  attackUsed: boolean;
  defendUsed: boolean;
}

export interface GameState {
  phase: GamePhase;
  currentPlayer: PlayerIndex;
  turnCount: number;
  players: [PlayerState, PlayerState];
  winner: PlayerIndex | null;
  sessionId: string;
}
