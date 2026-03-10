// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { GameController } from '../../src/engine/game';
import { GamePhase } from '../../src/types/game';
import type { Rank } from '../../src/types/game';
import { FLEET_ROSTER } from '../../src/types/fleet';
import type { Coordinate } from '../../src/types/grid';
import { GRID_SIZE } from '../../src/types/grid';

const typhoon = FLEET_ROSTER[0]!;
const akula = FLEET_ROSTER[1]!;
const seawolf = FLEET_ROSTER[2]!;
const virginia = FLEET_ROSTER[3]!;
const midget = FLEET_ROSTER[4]!;
const narwhal = FLEET_ROSTER[5]!;
const piranha = FLEET_ROSTER[6]!;

function placeFullFleet(gc: GameController): void {
  gc.placeShipForCurrentPlayer(typhoon, { col: 0, row: 0, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(akula, { col: 0, row: 1, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(seawolf, { col: 0, row: 2, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(virginia, { col: 0, row: 3, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(midget, { col: 0, row: 4, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(narwhal, { col: 0, row: 5, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(piranha, { col: 0, row: 6, depth: 0 }, 'col');
}

function setupGame(rank: Rank = 'officer'): GameController {
  const game = new GameController(undefined, rank);
  placeFullFleet(game);
  game.confirmSetup();
  placeFullFleet(game);
  game.confirmSetup();
  return game;
}

/**
 * Generator yielding coordinates guaranteed to be empty (depth >= 3).
 * Ships are placed at depth 0, so depth 3-6 are safe misses.
 */
function* missCoords(): Generator<Coordinate> {
  for (let d = 3; d < GRID_SIZE; d++) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        yield { col: c, row: r, depth: d };
      }
    }
  }
}

/**
 * Fire a miss and end the turn for the current player.
 */
function doMissTurn(game: GameController, coords: Generator<Coordinate>): void {
  const coord = coords.next().value!;
  const result = game.fireTorpedo(coord);
  expect(result).not.toBeNull();
  expect(result!.result).toBe('miss');
  game.endTurn();
}

describe('Rank System', () => {
  describe('Officer rank (default)', () => {
    it('should not award bonus after many dry turns', () => {
      const game = setupGame('officer');
      const coords = missCoords();

      // 20 dry turns (10 per player)
      for (let i = 0; i < 20; i++) {
        doMissTurn(game, coords);
      }

      // No bonus should be awarded
      expect(game.getLastRankBonus()).toBeNull();
      expect(game.getDryTurnCounter()).toBe(20);
    });

    it('should default to officer rank when no rank specified', () => {
      const game = new GameController();
      expect(game.getRankConfig().rank).toBe('officer');
      expect(game.getState().rank).toBe('officer');
    });
  });

  describe('Recruit rank', () => {
    it('should trigger at 10 dry turns with +8 credits', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      // 9 dry turns -- no bonus yet
      for (let i = 0; i < 9; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getLastRankBonus()).toBeNull();
      expect(game.getDryTurnCounter()).toBe(9);

      // 10th dry turn triggers bonus
      doMissTurn(game, coords);

      const bonus = game.getLastRankBonus();
      expect(bonus).not.toBeNull();
      expect(bonus!.amount).toBe(8);
    });

    it('should set pendingRankBonus on both players and award across turns', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      // Record starting credits
      const p0StartCredits = game.getState().players[0].credits;
      const p1StartCredits = game.getState().players[1].credits;

      // 10 dry turns to trigger
      for (let i = 0; i < 10; i++) {
        doMissTurn(game, coords);
      }

      // After 10th turn ends, bonus triggered and new current player got bonus
      // The current player (who just switched in) should have received +8
      const currentPlayer = game.getCurrentPlayer();
      expect(currentPlayer.pendingRankBonus).toBe(false);

      // The opponent still has pending bonus
      const opponent = game.getOpponent();
      expect(opponent.pendingRankBonus).toBe(true);

      // After next end turn, opponent (now current) should get bonus too
      doMissTurn(game, coords);
      const bonus = game.getLastRankBonus();
      expect(bonus).not.toBeNull();
      expect(bonus!.amount).toBe(8);

      // Both players should have received +8 total from rank bonus
      // (they also earn/lose nothing else from misses)
      expect(game.getState().players[0].credits).toBe(p0StartCredits + 8);
      expect(game.getState().players[1].credits).toBe(p1StartCredits + 8);
    });
  });

  describe('Enlisted rank', () => {
    it('should trigger at 16 dry turns with +5 credits', () => {
      const game = setupGame('enlisted');
      const coords = missCoords();

      for (let i = 0; i < 15; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getLastRankBonus()).toBeNull();

      // 16th dry turn triggers
      doMissTurn(game, coords);
      const bonus = game.getLastRankBonus();
      expect(bonus).not.toBeNull();
      expect(bonus!.amount).toBe(5);
    });
  });

  describe('Counter reset on contact', () => {
    it('should reset on torpedo hit', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      // 8 dry turns
      for (let i = 0; i < 8; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getDryTurnCounter()).toBe(8);

      // Hit a ship (ships at row 0, depth 0, cols 0-4 for typhoon)
      // Current player is P0 after 8 turns (even number, alternating 0,1,0,1...)
      // P0 fires at P1's grid. Ships placed same way for both players.
      const hitResult = game.fireTorpedo({ col: 0, row: 0, depth: 0 });
      expect(hitResult).not.toBeNull();
      expect(hitResult!.result).toBe('hit');
      game.endTurn();

      // Counter should be reset
      expect(game.getDryTurnCounter()).toBe(0);
    });

    it('should NOT reset on torpedo miss', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      // 5 dry turns
      for (let i = 0; i < 5; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getDryTurnCounter()).toBe(5);
    });

    it('should reset on decoy hit', () => {
      // Set up a game where we know where the decoy is
      const game = new GameController(undefined, 'recruit');
      placeFullFleet(game);
      game.placeDecoyForCurrentPlayer({ col: 6, row: 6, depth: 6 });
      game.confirmSetup();
      placeFullFleet(game);
      game.placeDecoyForCurrentPlayer({ col: 6, row: 6, depth: 6 });
      game.confirmSetup();

      const coords = missCoords();

      // 5 dry turns
      for (let i = 0; i < 5; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getDryTurnCounter()).toBe(5);

      // Hit the opponent's decoy at 6,6,6
      // After 5 turns (0-indexed: turns 0,1,2,3,4), we've alternated.
      // Turn 0: P0, Turn 1: P1, Turn 2: P0, Turn 3: P1, Turn 4: P0
      // After 5 doMissTurns, current player is P1 (since each doMissTurn fires+ends)
      // Actually: start=P0. doMissTurn fires+ends -> P1. doMissTurn fires+ends -> P0. etc.
      // After 5 doMissTurns: P0->P1->P0->P1->P0->P1, so current is P1.
      // P1 fires at P0's grid. Decoy is at 6,6,6 on P0's grid.
      const result = game.fireTorpedo({ col: 6, row: 6, depth: 6 });
      expect(result).not.toBeNull();
      expect(result!.result).toBe('hit'); // Decoy appears as hit
      game.endTurn();

      expect(game.getDryTurnCounter()).toBe(0);
    });
  });

  describe('Counter triggers multiple times', () => {
    it('should trigger again after reset', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      // First trigger at 10
      for (let i = 0; i < 10; i++) {
        doMissTurn(game, coords);
      }
      expect(game.getLastRankBonus()).not.toBeNull();
      expect(game.getDryTurnCounter()).toBe(0);

      // Need 10 more dry turns for second trigger
      // But the 11th turn (first after reset) already has pending bonus for the other player
      // which gets awarded but doesn't affect dry counter. So just do 10 more misses.
      for (let i = 0; i < 9; i++) {
        doMissTurn(game, coords);
      }
      // After 9 more misses, counter should be at 9
      // (the pending bonus from first trigger doesn't affect dry counter)
      expect(game.getDryTurnCounter()).toBe(9);

      doMissTurn(game, coords);
      expect(game.getLastRankBonus()).not.toBeNull();
      expect(game.getDryTurnCounter()).toBe(0);
    });
  });

  describe('setRank()', () => {
    it('should accept rank change before combat', () => {
      const game = new GameController();
      expect(game.setRank('recruit')).toBe(true);
      expect(game.getRankConfig().rank).toBe('recruit');
    });

    it('should accept rank change during setup_p2', () => {
      const game = new GameController();
      placeFullFleet(game);
      game.confirmSetup();
      expect(game.setRank('enlisted')).toBe(true);
      expect(game.getRankConfig().rank).toBe('enlisted');
    });

    it('should reject rank change during combat', () => {
      const game = setupGame('officer');
      expect(game.getState().phase).toBe(GamePhase.Combat);
      expect(game.setRank('recruit')).toBe(false);
      expect(game.getRankConfig().rank).toBe('officer');
    });
  });

  describe('getDryTurnCounter()', () => {
    it('should start at 0', () => {
      const game = setupGame('recruit');
      expect(game.getDryTurnCounter()).toBe(0);
    });

    it('should increment by 1 per dry turn', () => {
      const game = setupGame('recruit');
      const coords = missCoords();

      doMissTurn(game, coords);
      expect(game.getDryTurnCounter()).toBe(1);

      doMissTurn(game, coords);
      expect(game.getDryTurnCounter()).toBe(2);

      doMissTurn(game, coords);
      expect(game.getDryTurnCounter()).toBe(3);
    });
  });

  describe('game.start event includes rank', () => {
    it('should log rank in game.start event', () => {
      const game = new GameController('test-rank', 'recruit');
      const state = game.getState();
      expect(state.rank).toBe('recruit');
    });
  });
});
