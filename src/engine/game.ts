import type { GameState, PlayerState, PlayerIndex, TurnSlots, RankConfig } from '../types/game';
import type { Rank } from '../types/game';
import { GamePhase, PLAYER_DESIGNATIONS, RANK_CONFIGS } from '../types/game';
import type { Coordinate } from '../types/grid';
import { CellState, GRID_SIZE } from '../types/grid';
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
import { isShipSilentRunning, decrementSilentRunning } from './silent-running';
import { executeGSonar } from './g-sonar';
import type { GSonarResult } from './g-sonar';

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
    perksUsed: 0,
    credits: STARTING_CREDITS,
    inventory: [],
    lastTurnHit: false,
    silentRunningShips: [],
    pendingRankBonus: false,
  };
}

export interface FireResult {
  result: 'hit' | 'miss' | 'sunk';
  shipId?: string;
  creditsAwarded?: number;
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
  private lastSRExpired: string[] = [];
  private dryTurnCounter: number = 0;
  private currentTurnContact: boolean = false;
  private lastRankBonus: { player: PlayerIndex; amount: number } | null = null;

  constructor(sessionId?: string, rank?: Rank) {
    this.logger = initLogger(sessionId);
    this.state = {
      phase: GamePhase.SetupP1,
      currentPlayer: 0,
      turnCount: 0,
      players: [createPlayerState(0), createPlayerState(1)],
      winner: null,
      sessionId: this.logger.getSessionId(),
      rank: rank ?? 'officer',
    };

    this.logger.emit('game.start', {
      sessionId: this.state.sessionId,
      rank: this.state.rank,
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
          enemy: defender.index,
          method: 'torpedo',
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
    let creditsAwarded = 0;
    for (const award of creditResult.awards) {
      attacker.credits += award.amount;
      creditsAwarded += award.amount;
      this.logger.emit('economy.credit', {
        player: attacker.index,
        type: award.type,
        amount: award.amount,
        balance: attacker.credits,
      });
    }

    // Track hit for consecutive bonus
    this.currentTurnHit = fireResult === 'hit' || fireResult === 'sunk';
    if (this.currentTurnHit) this.currentTurnContact = true;

    if (fireResult === 'sunk') {
      this.checkVictory();
      return { result: 'sunk', shipId: resultShipId, creditsAwarded };
    }

    return { result: fireResult, shipId: resultShipId, creditsAwarded };
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

    if (!isValidCoordinate(coord)) return null;

    const result = executeSonarPing(coord, attacker, defender);

    // Remove instance from inventory
    const updated = removeFromInventory(attacker, pingInstance.id);
    const idx = attacker.index;
    this.state.players[idx] = updated;

    // Write per-cell results to targeting grid, skip already-resolved cells
    let positiveCount = 0;
    for (const cellResult of result.cells) {
      const existing = getCell(this.state.players[idx]!.targetingGrid, cellResult.coord);
      if (existing && existing.state !== CellState.Empty) {
        continue; // Don't overwrite any existing state
      }
      const sonarState = cellResult.displayedResult ? CellState.SonarPositive : CellState.SonarNegative;
      this.state.players[idx]!.targetingGrid = setCell(
        this.state.players[idx]!.targetingGrid,
        cellResult.coord,
        { state: sonarState, shipId: null },
      );
      if (cellResult.displayedResult) positiveCount++;
    }
    if (positiveCount > 0) this.currentTurnContact = true;

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

    this.state.players[idx]!.perksUsed++;
    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'sonar_ping',
      instanceId: pingInstance.id,
      target: formatCoordinate(coord),
      result: `${positiveCount} contacts in 2x2x2`,
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
    const droneContacts = result.cells.filter(c => c.written && c.displayedResult).length;
    if (droneContacts > 0) this.currentTurnContact = true;

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

    this.state.players[idx]!.perksUsed++;
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

    this.state.players[player.index]!.perksUsed++;
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

    currentAttacker.shotsFired++;

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

          this.logger.emit('combat.sunk', { player: idx, ship: shipId, enemy: defIdx, method: 'depth_charge' });
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
    if (hitCount > 0) this.currentTurnContact = true;

    // Check victory after all sinks
    if (shipsSunk.length > 0) {
      this.checkVictory();
    }

    this.state.players[idx]!.perksUsed++;
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

    this.state.players[idx]!.perksUsed++;
    this.logger.emit('perk.effect', {
      player: idx,
      perkId: 'silent_running',
      shipId,
      turnsRemaining: 2,
    });

    return true;
  }

  useGSonar(depth: number): GSonarResult | null {
    if (this.state.phase !== GamePhase.Combat) return null;
    if (this.turnSlots.attackUsed) return null;

    const attacker = this.getCurrentPlayer();
    const defender = this.getOpponent();

    // Must have g_sonar in inventory
    const gsonarInstance = attacker.inventory.find((p) => p.perkId === 'g_sonar');
    if (!gsonarInstance) return null;

    // Validate depth
    if (depth < 0 || depth >= GRID_SIZE) return null;

    const result = executeGSonar(depth, attacker, defender);

    // Remove g_sonar instance from inventory
    const updated = removeFromInventory(attacker, gsonarInstance.id);
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
    const gsonarContacts = result.cells.filter(c => c.written && c.displayedResult).length;
    if (gsonarContacts > 0) this.currentTurnContact = true;

    this.turnSlots.attackUsed = true;

    this.state.players[idx]!.perksUsed++;
    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'g_sonar',
      instanceId: gsonarInstance.id,
      target: `depth_${depth}`,
      result: `${result.cells.filter(c => c.written && c.displayedResult).length} contacts`,
    });

    return result;
  }

  useAcousticCloak(): boolean {
    if (this.state.phase !== GamePhase.Combat) return false;
    if (this.turnSlots.defendUsed) return false;

    const player = this.getCurrentPlayer();

    // Must have acoustic_cloak in inventory
    const cloakInstance = player.inventory.find((p) => p.perkId === 'acoustic_cloak');
    if (!cloakInstance) return false;

    // No stacking
    if (player.abilities.acoustic_cloak.active) return false;

    // Activate and consume from inventory
    player.abilities.acoustic_cloak.active = true;
    player.abilities.acoustic_cloak.turnsRemaining = 2;

    const updated = removeFromInventory(player, cloakInstance.id);
    const idx = player.index;
    this.state.players[idx] = updated;
    // Restore abilities on the new state (removeFromInventory spreads player)
    this.state.players[idx]!.abilities.acoustic_cloak.active = true;
    this.state.players[idx]!.abilities.acoustic_cloak.turnsRemaining = 2;

    this.turnSlots.defendUsed = true;

    this.state.players[idx]!.perksUsed++;
    this.logger.emit('perk.use', {
      player: idx,
      perkId: 'acoustic_cloak',
      instanceId: cloakInstance.id,
      result: 'deployed',
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

    // --- Rank dry-turn tracking ---
    if (this.currentTurnContact) {
      this.dryTurnCounter = 0;
    } else {
      this.dryTurnCounter++;
    }
    this.currentTurnContact = false;

    const rankConfig = RANK_CONFIGS[this.state.rank];
    if (rankConfig.dryTurnThreshold !== null && this.dryTurnCounter >= rankConfig.dryTurnThreshold) {
      // Set pending bonus on BOTH players
      this.state.players[0].pendingRankBonus = true;
      this.state.players[1].pendingRankBonus = true;
      this.logger.emit('economy.rank_bonus', {
        dryTurns: this.dryTurnCounter,
        threshold: rankConfig.dryTurnThreshold,
        creditBonus: rankConfig.creditBonus,
        rank: this.state.rank,
      });
      this.dryTurnCounter = 0;
    }

    this.state.currentPlayer = this.state.currentPlayer === 0 ? 1 : 0;
    this.state.turnCount++;
    this.turnSlots = { pingUsed: false, attackUsed: false, defendUsed: false };
    this.currentTurnHit = false;

    // Award pending rank bonus to the new current player
    const newPlayer = this.state.players[this.state.currentPlayer];
    if (newPlayer.pendingRankBonus) {
      newPlayer.credits += rankConfig.creditBonus;
      newPlayer.pendingRankBonus = false;
      this.lastRankBonus = { player: this.state.currentPlayer, amount: rankConfig.creditBonus };
      this.logger.emit('economy.credit', {
        player: this.state.currentPlayer,
        type: 'rank_bonus',
        amount: rankConfig.creditBonus,
        balance: newPlayer.credits,
      });
    } else {
      this.lastRankBonus = null;
    }

    // Decrement Silent Running for the new current player
    // (their opponent just finished a turn, so one opponent turn has passed)
    this.lastSRExpired = [];
    const srPlayer = this.state.players[this.state.currentPlayer];
    const srResult = decrementSilentRunning(srPlayer.silentRunningShips);
    srPlayer.silentRunningShips = srResult.remaining;
    this.lastSRExpired = srResult.expired;
    for (const expiredShipId of srResult.expired) {
      this.logger.emit('perk.expire', {
        player: this.state.currentPlayer,
        perkId: 'silent_running',
        shipId: expiredShipId,
      });
    }

    // Decrement Acoustic Cloak for the new current player
    const cloakPlayer = this.state.players[this.state.currentPlayer];
    if (cloakPlayer.abilities.acoustic_cloak.active) {
      cloakPlayer.abilities.acoustic_cloak.turnsRemaining =
        (cloakPlayer.abilities.acoustic_cloak.turnsRemaining ?? 0) - 1;
      if (cloakPlayer.abilities.acoustic_cloak.turnsRemaining <= 0) {
        cloakPlayer.abilities.acoustic_cloak.active = false;
        cloakPlayer.abilities.acoustic_cloak.turnsRemaining = null;
        this.logger.emit('perk.expire', { player: this.state.currentPlayer, perkId: 'acoustic_cloak' });
      }
    }

    this.logger.emit('game.turn_start', {
      player: this.state.currentPlayer,
      turn: this.state.turnCount,
    });

    return true;
  }

  getLastSRExpired(): string[] {
    return this.lastSRExpired;
  }

  setRank(rank: Rank): boolean {
    if (this.state.phase === GamePhase.Combat || this.state.phase === GamePhase.Victory) {
      return false;
    }
    this.state.rank = rank;
    this.logger.emit('game.start', {
      sessionId: this.state.sessionId,
      rank: this.state.rank,
    });
    return true;
  }

  getRankConfig(): RankConfig {
    return RANK_CONFIGS[this.state.rank];
  }

  getDryTurnCounter(): number {
    return this.dryTurnCounter;
  }

  getLastRankBonus(): { player: PlayerIndex; amount: number } | null {
    return this.lastRankBonus;
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
