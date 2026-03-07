import type { PlayerIndex } from './game';
import type { AbilityId } from './abilities';
import type { PlacementAxis } from './fleet';

export type LogEventType =
  // Game lifecycle
  | 'game.start'
  | 'game.phase_change'
  | 'game.turn_start'
  | 'game.turn_end'
  | 'game.victory'
  // Fleet management
  | 'fleet.place'
  | 'fleet.remove'
  | 'fleet.confirm'
  | 'fleet.reset'
  // Combat
  | 'combat.fire'
  | 'combat.hit'
  | 'combat.miss'
  | 'combat.sunk'
  // Abilities
  | 'ability.unlock'
  | 'ability.use'
  | 'ability.resolve'
  | 'ability.expire'
  // View/UI
  | 'view.change'
  | 'view.slice'
  | 'view.rotate'
  | 'view.board_toggle'
  // Audio
  | 'audio.init'
  | 'audio.play'
  | 'audio.mute'
  // System
  | 'system.init'
  | 'system.error'
  | 'system.export';

export interface LogEvent {
  ts: string;
  seq: number;
  event: LogEventType;
  session: string;
  data: Record<string, unknown>;
}

export interface CombatFirePayload {
  player: PlayerIndex;
  target: string;
  result: 'hit' | 'miss';
  ship?: string;
  remaining?: number;
}

export interface FleetPlacePayload {
  player: PlayerIndex;
  ship: string;
  origin: string;
  axis: PlacementAxis;
}

export interface AbilityUsePayload {
  player: PlayerIndex;
  ability: AbilityId;
  target?: string;
  result?: string;
}

export interface GamePhaseChangePayload {
  from: string;
  to: string;
}

export interface SystemErrorPayload {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export interface GameVictoryPayload {
  winner: PlayerIndex;
  designation: string;
  turnCount: number;
}
