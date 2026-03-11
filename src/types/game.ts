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

export type Rank = 'recruit' | 'enlisted' | 'officer';

export interface RankConfig {
  rank: Rank;
  label: string;
  dryTurnThreshold: number | null; // null = no mechanic
  creditBonus: number;
}

export const RANK_CONFIGS: Record<Rank, RankConfig> = {
  recruit:  { rank: 'recruit',  label: 'RECRUIT',  dryTurnThreshold: 8, creditBonus: 8 },
  enlisted: { rank: 'enlisted', label: 'ENLISTED', dryTurnThreshold: 10, creditBonus: 5 },
  officer:  { rank: 'officer',  label: 'OFFICER',  dryTurnThreshold: null, creditBonus: 0 },
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
  pendingRankBonus: boolean;
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
  rank: Rank;
}
