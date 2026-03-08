import type { GameState, PlayerState, PlayerIndex, TurnSlots } from '../types/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../types/game';
import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { FleetRosterEntry, PlacementAxis } from '../types/fleet';
import { createGrid, getCell, setCell, formatCoordinate, isValidCoordinate } from './grid';
import {
  placeShip,
  placeDecoy,
  removeShip,
  isFleetComplete,
  checkSunk,
  getShipHealth,
} from './fleet';
import { initLogger } from '../observability/logger';
import type { Logger } from '../observability/logger';
import type { AbilityId, AbilityState, PerkId, PerkInstance } from '../types/abilities';
import { STARTING_CREDITS } from '../types/abilities';
import { calculateFireCredits } from './credits';
import { purchasePerk as purchasePerkFn, removeFromInventory } from './perks';
import { executeSonarPing } from './sonar';
import type { SonarPingResult } from './sonar';
import { executeReconDrone } from './drone';
import type { DroneScanResult } from './drone';
import { calculateDepthChargeTargets } from './depth-charge';
import type { DepthChargeTargets as _DepthChargeTargets } from './depth-charge';
import { isShipSilentRunning, decrementSilentRunning } from './silent-running';

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
    credits: STARTING_CREDITS,
    inventory: [],
    lastTurnHit: false,
    silentRunningShips: [],
  };
}

export interface FireResult {
  result: 'hit' | 'miss' | 'sunk';
  shipId?: string;
}

export interface DepthChargeResult {
  center: Coordinate;
  cellResults: Array<{
    coord: Coordinate;
    result: 'hit' | 'miss' | 'sunk' | 'already_resolved';
    shipId?: string;
  }>;
  shipsSunk: string[];
  totalCreditsAwarded: number;
}

export class GameController {
  private state: GameState;
  private logger: Logger;
  private turnSlots: TurnSlots = { pingUsed: false, attackUsed: false, defendUsed: false };
  private currentTurnHit: boolean = false;

  constructor(sessionId?: string) {
    this.logger = initLogger(sessionId);
    this.state = {
      phase: GamePhase.SetupP1,
      currentPlayer: 0,
      turnCount: 0,
      players: [createPlayerState(0), createPlayerState(1)],
      winner: null,
      sessionId: this.logger.getSessionId(),
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
    if (this.turnSlots.attackUsed) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    const targetCell = getCell(defender.ownGrid, coord);
    if (!targetCell) return null;

    // Already targeted this cell (but allow firing on sonar-scanned cells)
    const attackerTargetCell = getCell(attacker.targetingGrid, coord);
    if (
      attackerTargetCell &&
      attackerTargetCell.state !== CellState.Empty &&
      attackerTargetCell.state !== CellState.SonarPositive &&
      attackerTargetCell.state !== CellState.SonarNegative &&
      attackerTargetCell.state !== CellState.DronePositive &&
      attackerTargetCell.state !== CellState.DroneNegative
    ) {
      return null;
    }

    this.turnSlots.attackUsed = true;
    attacker.shotsFired++;

    const coordStr = formatCoordinate(coord);

    let fireResult: 'hit' | 'miss' | 'sunk' = 'miss';
    let resultShipId: string | undefined;

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

      // Check if ship is sunk
      const ship = defender.ships.find((s) => s.id === shipId)!;
      ship.hits++;

      this.logger.emit('combat.fire', { player: attacker.index, target: coordStr, result: 'hit', ship: shipId, remaining: getShipHealth(ship) });
      this.logger.emit('combat.hit', { player: attacker.index, target: coordStr, ship: shipId });

      const sunkResult = checkSunk(ship, defender.ownGrid);
      if (sunkResult.sunk) {
        defender.ownGrid = sunkResult.grid;
        const idx = defender.ships.findIndex((s) => s.id === shipId);
        defender.ships[idx] = sunkResult.ship;
        attacker.shipsSunk++;

        this.logger.emit('combat.sunk', {
          player: attacker.index,
          ship: shipId,
          remaining: 0,
        });

        fireResult = 'sunk';
        resultShipId = shipId;
      } else {
        fireResult = 'hit';
        resultShipId = shipId;
      }
    } else if (targetCell.state === CellState.Decoy) {
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

      fireResult = 'hit';
    } else {
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

      fireResult = 'miss';
    }

    // Credit awards
    const creditResult = calculateFireCredits(fireResult, attacker.lastTurnHit);
    for (const award of creditResult.awards) {
      attacker.credits += award.amount;
      this.logger.emit('economy.credit', {
        player: attacker.index,
        type: award.type,
        amount: award.amount,
        balance: attacker.credits,
      });
    }

    // Track hit for consecutive bonus
    this.currentTurnHit = fireResult === 'hit' || fireResult === 'sunk';

    if (fireResult === 'sunk') {
      this.checkVictory();
      return { result: 'sunk', shipId: resultShipId };
    }

    return { result: fireResult, shipId: resultShipId };
  }

  getTurnSlots(): TurnSlots {
    return { ...this.turnSlots };
  }

  purchasePerk(perkId: PerkId): PerkInstance | null {
    if (this.state.phase !== GamePhase.Combat) return null;

    const attacker = this.getCurrentPlayer();
    const result = purchasePerkFn(attacker, perkId, this.state.turnCount);
    if (!result) return null;

    // Apply the updated player state
    const idx = attacker.index;
    this.state.players[idx] = result.player;

    const cost = attacker.credits - result.player.credits;
    this.logger.emit('economy.purchase', {
      player: idx,
      perkId,
      cost,
      balance: result.player.credits,
    });

    return result.instance;
  }

  useSonarPing(coord: Coordinate): SonarPingResult | null {
    if (this.state.phase !== GamePhase.Combat) return null;
    if (this.turnSlots.pingUsed) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    // Must have sonar_ping in inventory
    const pingInstance = attacker.inventory.find((p) => p.perkId === 'sonar_ping');
    if (!pingInstance) return null;

    // Block re-ping on cell that already has sonar result
    const existingCell = getCell(attacker.targetingGrid, coord);
    if (existingCell && (existingCell.state === CellState.SonarPositive || existingCell.state === CellState.SonarNegative)) {
      return null;
    }

    const result = executeSonarPing(coord, attacker, defender);

    // Remove instance from inventory
    const updated = removeFromInventory(attacker, pingInstance.id);
    const idx = attacker.index;
    this.state.players[idx] = updated;

    // Write result to targeting grid
    const sonarState = result.displayedResult ? CellState.SonarPositive : CellState.SonarNegative;
    this.state.players[idx]!.targetingGrid = setCell(
      this.state.players[idx]!.targetingGrid,
      coord,
      { state: sonarState, shipId: null },
    );

    this.turnSlots.pingUsed = true;

    // Jammer consumption
    if (result.jammed && !result.cloaked) {
      defender.abilities.radar_jammer.active = false;
      defender.abilities.radar_jammer.used = true;
      const jammerInst = defender.inventory.find(p => p.perkId === 'radar_jammer');
      if (jammerInst) {
        const defIdx: PlayerIndex = this.state.currentPlayer === 0 ? 1 : 0;
        this.state.players[defIdx] = removeFromInventory(this.state.players[defIdx]!, jammerInst.id);
      }
    }

    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'sonar_ping',
      instanceId: pingInstance.id,
      target: formatCoordinate(coord),
      result: result.displayedResult ? 'positive' : 'negative',
    });

    return result;
  }

  useReconDrone(center: Coordinate): DroneScanResult | null {
    if (this.state.phase !== GamePhase.Combat) return null;
    if (this.turnSlots.attackUsed) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    // Must have recon_drone in inventory
    const droneInstance = attacker.inventory.find((p) => p.perkId === 'recon_drone');
    if (!droneInstance) return null;

    // Validate center coordinate
    if (!isValidCoordinate(center)) return null;

    const result = executeReconDrone(center, attacker, defender);

    // Remove drone instance from inventory
    const updated = removeFromInventory(attacker, droneInstance.id);
    const idx = attacker.index;
    this.state.players[idx] = updated;

    // Write results to targeting grid — skip cells already resolved
    for (const cellResult of result.cells) {
      const existing = getCell(this.state.players[idx]!.targetingGrid, cellResult.coord);
      if (existing && existing.state !== CellState.Empty &&
          existing.state !== CellState.SonarPositive &&
          existing.state !== CellState.SonarNegative) {
        continue; // Don't overwrite Hit/Miss/Sunk/DecoyHit/DronePositive/DroneNegative
      }
      cellResult.written = true;
      const droneState = cellResult.displayedResult ? CellState.DronePositive : CellState.DroneNegative;
      this.state.players[idx]!.targetingGrid = setCell(
        this.state.players[idx]!.targetingGrid,
        cellResult.coord,
        { state: droneState, shipId: null },
      );
    }

    // Jammer consumption
    if (result.jammerConsumed) {
      defender.abilities.radar_jammer.active = false;
      defender.abilities.radar_jammer.used = true;
      const jammerInst = defender.inventory.find(p => p.perkId === 'radar_jammer');
      if (jammerInst) {
        const defIdx: PlayerIndex = this.state.currentPlayer === 0 ? 1 : 0;
        this.state.players[defIdx] = removeFromInventory(this.state.players[defIdx]!, jammerInst.id);
      }
    }

    this.turnSlots.attackUsed = true;

    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'recon_drone',
      instanceId: droneInstance.id,
      target: formatCoordinate(center),
      result: `${result.cells.filter(c => c.written && c.displayedResult).length} contacts`,
    });

    return result;
  }

  useRadarJammer(): boolean {
    if (this.state.phase !== GamePhase.Combat) return false;
    if (this.turnSlots.defendUsed) return false;

    const player = this.getCurrentPlayer();

    // Must have radar_jammer in inventory
    const jammerInstance = player.inventory.find((p) => p.perkId === 'radar_jammer');
    if (!jammerInstance) return false;

    // No stacking
    if (player.abilities.radar_jammer.active) return false;

    // Activate — keep in inventory, consumed on trigger
    player.abilities.radar_jammer.active = true;
    this.turnSlots.defendUsed = true;

    this.logger.emit('perk.use', {
      player: player.index,
      perkId: 'radar_jammer',
      instanceId: jammerInstance.id,
      result: 'deployed',
    });

    return true;
  }

  useDepthCharge(center: Coordinate): DepthChargeResult | null {
    if (this.state.phase !== GamePhase.Combat) return null;
    if (this.turnSlots.attackUsed) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    // Must have depth_charge in inventory
    const dcInstance = attacker.inventory.find((p) => p.perkId === 'depth_charge');
    if (!dcInstance) return null;

    // Validate center coordinate
    if (!isValidCoordinate(center)) return null;

    const targets = calculateDepthChargeTargets(center, defender);

    // Remove depth_charge instance from inventory
    const updated = removeFromInventory(attacker, dcInstance.id);
    const idx = attacker.index;
    this.state.players[idx] = updated;

    // Re-reference attacker/defender after immutable update
    const currentAttacker = this.state.players[idx]!;
    const defIdx: PlayerIndex = idx === 0 ? 1 : 0;
    const currentDefender = this.state.players[defIdx]!;

    const cellResults: DepthChargeResult['cellResults'] = [];
    const shipsSunk: string[] = [];
    let totalCreditsAwarded = 0;
    let hitCount = 0;

    for (const targetCell of targets.cells) {
      if (targetCell.alreadyResolved) {
        cellResults.push({ coord: targetCell.coord, result: 'already_resolved' });
        continue;
      }

      const coordStr = formatCoordinate(targetCell.coord);

      if (targetCell.cellState === CellState.Ship) {
        const shipId = targetCell.shipId!;

        // Update defender's ownGrid
        currentDefender.ownGrid = setCell(currentDefender.ownGrid, targetCell.coord, {
          state: CellState.Hit,
          shipId,
        });
        // Update attacker's targetingGrid
        currentAttacker.targetingGrid = setCell(currentAttacker.targetingGrid, targetCell.coord, {
          state: CellState.Hit,
          shipId: null,
        });
        currentAttacker.shotsHit++;

        // Increment ship hits
        const ship = currentDefender.ships.find((s) => s.id === shipId)!;
        ship.hits++;

        this.logger.emit('combat.hit', { player: idx, target: coordStr, ship: shipId });

        // Check if ship sunk
        const sunkResult = checkSunk(ship, currentDefender.ownGrid);
        if (sunkResult.sunk) {
          currentDefender.ownGrid = sunkResult.grid;
          const shipIdx = currentDefender.ships.findIndex((s) => s.id === shipId);
          currentDefender.ships[shipIdx] = sunkResult.ship;
          currentAttacker.shipsSunk++;
          shipsSunk.push(shipId);

          this.logger.emit('combat.sunk', { player: idx, ship: shipId, remaining: 0 });
          cellResults.push({ coord: targetCell.coord, result: 'sunk', shipId });
        } else {
          cellResults.push({ coord: targetCell.coord, result: 'hit', shipId });
        }

        // Award credits per hit
        const wasConsecutive = hitCount > 0 || currentAttacker.lastTurnHit;
        const fireResult: 'hit' | 'sunk' = sunkResult.sunk ? 'sunk' : 'hit';
        const creditResult = calculateFireCredits(fireResult, wasConsecutive);
        for (const award of creditResult.awards) {
          currentAttacker.credits += award.amount;
          totalCreditsAwarded += award.amount;
          this.logger.emit('economy.credit', {
            player: idx,
            type: award.type,
            amount: award.amount,
            balance: currentAttacker.credits,
          });
        }
        hitCount++;
      } else if (targetCell.cellState === CellState.Decoy) {
        // Decoy hit
        currentDefender.ownGrid = setCell(currentDefender.ownGrid, targetCell.coord, {
          state: CellState.DecoyHit,
          shipId: null,
        });
        currentAttacker.targetingGrid = setCell(currentAttacker.targetingGrid, targetCell.coord, {
          state: CellState.Hit,
          shipId: null,
        });
        currentAttacker.shotsHit++;

        // Award credits for decoy hit
        const wasConsecutive = hitCount > 0 || currentAttacker.lastTurnHit;
        const creditResult = calculateFireCredits('hit', wasConsecutive);
        for (const award of creditResult.awards) {
          currentAttacker.credits += award.amount;
          totalCreditsAwarded += award.amount;
          this.logger.emit('economy.credit', {
            player: idx,
            type: award.type,
            amount: award.amount,
            balance: currentAttacker.credits,
          });
        }
        hitCount++;

        cellResults.push({ coord: targetCell.coord, result: 'hit' });
      } else {
        // Miss (Empty, SonarPositive, SonarNegative, DronePositive, DroneNegative)
        currentDefender.ownGrid = setCell(currentDefender.ownGrid, targetCell.coord, {
          state: CellState.Miss,
          shipId: null,
        });
        currentAttacker.targetingGrid = setCell(currentAttacker.targetingGrid, targetCell.coord, {
          state: CellState.Miss,
          shipId: null,
        });

        cellResults.push({ coord: targetCell.coord, result: 'miss' });
      }
    }

    this.turnSlots.attackUsed = true;
    this.currentTurnHit = hitCount > 0;

    // Check victory after all sinks
    if (shipsSunk.length > 0) {
      this.checkVictory();
    }

    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'depth_charge',
      instanceId: dcInstance.id,
      target: formatCoordinate(center),
      result: `${hitCount} hits, ${shipsSunk.length} sunk`,
    });

    return { center, cellResults, shipsSunk, totalCreditsAwarded };
  }

  useSilentRunning(shipId: string): boolean {
    if (this.state.phase !== GamePhase.Combat) return false;
    if (this.turnSlots.defendUsed) return false;

    const player = this.getCurrentPlayer();

    // Must have silent_running in inventory
    const srInstance = player.inventory.find((p) => p.perkId === 'silent_running');
    if (!srInstance) return false;

    // Validate ship exists, not sunk, not already SR'd
    const ship = player.ships.find((s) => s.id === shipId);
    if (!ship) return false;
    if (ship.sunk) return false;
    if (isShipSilentRunning(player.silentRunningShips, shipId)) return false;

    // Add SR entry
    player.silentRunningShips.push({ shipId, turnsRemaining: 2 });

    // Remove instance from inventory
    const updated = removeFromInventory(player, srInstance.id);
    const idx = player.index;
    this.state.players[idx] = updated;
    // Restore silentRunningShips on the new state (removeFromInventory spreads player)
    this.state.players[idx]!.silentRunningShips = player.silentRunningShips;

    this.turnSlots.defendUsed = true;

    this.logger.emit('perk.effect', {
      player: idx,
      perkId: 'silent_running',
      shipId,
      turnsRemaining: 2,
    });

    return true;
  }

  endTurn(): boolean {
    if (this.state.phase !== GamePhase.Combat) return false;
    if (!this.turnSlots.attackUsed) return false;

    // Set lastTurnHit for consecutive tracking
    const currentPlayer = this.getCurrentPlayer();
    currentPlayer.lastTurnHit = this.currentTurnHit;

    this.logger.emit('game.turn_end', {
      player: this.state.currentPlayer,
      turn: this.state.turnCount,
    });

    this.state.currentPlayer = this.state.currentPlayer === 0 ? 1 : 0;
    this.state.turnCount++;
    this.turnSlots = { pingUsed: false, attackUsed: false, defendUsed: false };
    this.currentTurnHit = false;

    // Decrement Silent Running for the new current player
    // (their opponent just finished a turn, so one opponent turn has passed)
    const srPlayer = this.state.players[this.state.currentPlayer];
    const srResult = decrementSilentRunning(srPlayer.silentRunningShips);
    srPlayer.silentRunningShips = srResult.remaining;
    for (const expiredShipId of srResult.expired) {
      this.logger.emit('perk.expire', {
        player: this.state.currentPlayer,
        perkId: 'silent_running',
        shipId: expiredShipId,
      });
    }

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
