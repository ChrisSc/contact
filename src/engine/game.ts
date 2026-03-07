import type { GameState, PlayerState, PlayerIndex } from '../types/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../types/game';
import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { FleetRosterEntry, PlacementAxis } from '../types/fleet';
import { createGrid, getCell, setCell, formatCoordinate } from './grid';
import {
  placeShip,
  placeDecoy,
  removeShip,
  isFleetComplete,
  checkSunk,
} from './fleet';
import { initLogger } from '../observability/logger';
import type { Logger } from '../observability/logger';
import type { AbilityId, AbilityState } from '../types/abilities';

const ALL_ABILITY_IDS: AbilityId[] = [
  'sonar_ping', 'radar_jammer', 'recon_drone', 'decoy',
  'depth_charge', 'silent_running', 'g_sonar', 'acoustic_cloak',
];

function createDefaultAbilities(): Record<AbilityId, AbilityState> {
  const abilities = {} as Record<AbilityId, AbilityState>;
  for (const id of ALL_ABILITY_IDS) {
    abilities[id] = { earned: false, used: false, active: false, turnsRemaining: null };
  }
  return abilities;
}

function createPlayerState(index: PlayerIndex): PlayerState {
  return {
    index,
    designation: PLAYER_DESIGNATIONS[index],
    ownGrid: createGrid(),
    targetingGrid: createGrid(),
    ships: [],
    abilities: createDefaultAbilities(),
    shipsSunk: 0,
    shotsFired: 0,
    shotsHit: 0,
  };
}

export interface FireResult {
  result: 'hit' | 'miss' | 'sunk';
  shipId?: string;
}

export class GameController {
  private state: GameState;
  private logger: Logger;
  private actionTaken: boolean = false;

  constructor(sessionId?: string) {
    this.logger = initLogger(sessionId);
    this.state = {
      phase: GamePhase.SetupP1,
      currentPlayer: 0,
      turnCount: 0,
      players: [createPlayerState(0), createPlayerState(1)],
      winner: null,
      sessionId: this.logger.getSessionId(),
      log: [],
    };

    this.logger.emit('game.start', {
      sessionId: this.state.sessionId,
    });
  }

  getState(): GameState {
    return this.state;
  }

  getCurrentPlayer(): PlayerState {
    return this.state.players[this.state.currentPlayer];
  }

  getOpponent(): PlayerState {
    const opponentIndex: PlayerIndex = this.state.currentPlayer === 0 ? 1 : 0;
    return this.state.players[opponentIndex];
  }

  placeShipForCurrentPlayer(
    roster: FleetRosterEntry,
    origin: Coordinate,
    axis: PlacementAxis,
  ): boolean {
    if (this.state.phase !== GamePhase.SetupP1 && this.state.phase !== GamePhase.SetupP2) {
      return false;
    }

    const player = this.getCurrentPlayer();
    const result = placeShip(player.ownGrid, roster, origin, axis, player.index);
    if (!result) return false;

    player.ownGrid = result.grid;
    player.ships.push(result.ship);
    return true;
  }

  placeDecoyForCurrentPlayer(coord: Coordinate): boolean {
    if (this.state.phase !== GamePhase.SetupP1 && this.state.phase !== GamePhase.SetupP2) {
      return false;
    }

    const player = this.getCurrentPlayer();
    const result = placeDecoy(player.ownGrid, coord, player.index);
    if (!result) return false;

    player.ownGrid = result;
    return true;
  }

  removeShipForCurrentPlayer(shipId: string): boolean {
    const player = this.getCurrentPlayer();
    const shipIndex = player.ships.findIndex((s) => s.id === shipId);
    if (shipIndex === -1) return false;

    const ship = player.ships[shipIndex]!;
    player.ownGrid = removeShip(player.ownGrid, ship);
    player.ships.splice(shipIndex, 1);
    this.logger.emit('fleet.remove', { player: player.index, shipId });
    return true;
  }

  removeDecoyForCurrentPlayer(coord: Coordinate): boolean {
    if (this.state.phase !== GamePhase.SetupP1 && this.state.phase !== GamePhase.SetupP2) {
      return false;
    }

    const player = this.getCurrentPlayer();
    const cell = getCell(player.ownGrid, coord);
    if (!cell || cell.state !== CellState.Decoy) return false;

    player.ownGrid = setCell(player.ownGrid, coord, { state: CellState.Empty, shipId: null });
    this.logger.emit('fleet.remove', { player: player.index, type: 'decoy', coord: formatCoordinate(coord) });
    return true;
  }

  confirmSetup(): boolean {
    const player = this.getCurrentPlayer();
    if (!isFleetComplete(player.ships)) return false;

    if (this.state.phase === GamePhase.SetupP1) {
      this.logger.emit('fleet.confirm', { player: player.index });
      const oldPhase = this.state.phase;
      this.state.phase = GamePhase.SetupP2;
      this.state.currentPlayer = 1;
      this.logger.emit('game.phase_change', { from: oldPhase, to: this.state.phase });
      return true;
    }

    if (this.state.phase === GamePhase.SetupP2) {
      this.logger.emit('fleet.confirm', { player: player.index });
      const oldPhase = this.state.phase;
      this.state.phase = GamePhase.Combat;
      this.state.currentPlayer = 0;
      this.state.turnCount = 1;
      this.logger.emit('game.phase_change', { from: oldPhase, to: this.state.phase });
      this.logger.emit('game.turn_start', {
        player: 0,
        turn: this.state.turnCount,
      });
      return true;
    }

    return false;
  }

  fireTorpedo(coord: Coordinate): FireResult | null {
    if (this.state.phase !== GamePhase.Combat) return null;
    if (this.actionTaken) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    const targetCell = getCell(defender.ownGrid, coord);
    if (!targetCell) return null;

    // Already targeted this cell
    const attackerTargetCell = getCell(attacker.targetingGrid, coord);
    if (
      attackerTargetCell &&
      attackerTargetCell.state !== CellState.Empty
    ) {
      return null;
    }

    this.actionTaken = true;
    attacker.shotsFired++;

    const coordStr = formatCoordinate(coord);

    if (targetCell.state === CellState.Ship) {
      // Hit a ship
      const shipId = targetCell.shipId!;
      defender.ownGrid = setCell(defender.ownGrid, coord, {
        state: CellState.Hit,
        shipId,
      });
      attacker.targetingGrid = setCell(attacker.targetingGrid, coord, {
        state: CellState.Hit,
        shipId: null,
      });
      attacker.shotsHit++;

      this.logger.emit('combat.fire', { player: attacker.index, target: coordStr, result: 'hit' });
      this.logger.emit('combat.hit', { player: attacker.index, target: coordStr, ship: shipId });

      // Check if ship is sunk
      const ship = defender.ships.find((s) => s.id === shipId)!;
      ship.hits++;
      const sunkResult = checkSunk(ship, defender.ownGrid);
      if (sunkResult.sunk) {
        defender.ownGrid = sunkResult.grid;
        const idx = defender.ships.findIndex((s) => s.id === shipId);
        defender.ships[idx] = sunkResult.ship;
        attacker.shipsSunk++;

        this.logger.emit('combat.sunk', {
          player: attacker.index,
          ship: shipId,
        });

        this.checkVictory();

        return { result: 'sunk', shipId };
      }

      return { result: 'hit', shipId };
    }

    if (targetCell.state === CellState.Decoy) {
      // Decoy hit — appears as hit to attacker
      defender.ownGrid = setCell(defender.ownGrid, coord, {
        state: CellState.DecoyHit,
        shipId: null,
      });
      attacker.targetingGrid = setCell(attacker.targetingGrid, coord, {
        state: CellState.Hit,
        shipId: null,
      });
      attacker.shotsHit++;

      this.logger.emit('combat.fire', { player: attacker.index, target: coordStr, result: 'hit' });

      return { result: 'hit' };
    }

    // Miss
    defender.ownGrid = setCell(defender.ownGrid, coord, {
      state: CellState.Miss,
      shipId: null,
    });
    attacker.targetingGrid = setCell(attacker.targetingGrid, coord, {
      state: CellState.Miss,
      shipId: null,
    });

    this.logger.emit('combat.fire', { player: attacker.index, target: coordStr, result: 'miss' });
    this.logger.emit('combat.miss', { player: attacker.index, target: coordStr });

    return { result: 'miss' };
  }

  endTurn(): boolean {
    if (this.state.phase !== GamePhase.Combat) return false;
    if (!this.actionTaken) return false;

    this.logger.emit('game.turn_end', {
      player: this.state.currentPlayer,
      turn: this.state.turnCount,
    });

    this.state.currentPlayer = this.state.currentPlayer === 0 ? 1 : 0;
    this.state.turnCount++;
    this.actionTaken = false;

    this.logger.emit('game.turn_start', {
      player: this.state.currentPlayer,
      turn: this.state.turnCount,
    });

    return true;
  }

  checkVictory(): boolean {
    const opponent = this.getOpponent();
    const allSunk = opponent.ships.length > 0 && opponent.ships.every((s) => s.sunk);
    if (!allSunk) return false;

    this.state.phase = GamePhase.Victory;
    this.state.winner = this.state.currentPlayer;

    this.logger.emit('game.victory', {
      winner: this.state.currentPlayer,
      designation: PLAYER_DESIGNATIONS[this.state.currentPlayer],
      turnCount: this.state.turnCount,
    });

    return true;
  }
}
