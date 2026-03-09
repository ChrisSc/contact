import { describe, it, expect } from 'vitest';
import { GamePhase } from '../../src/types/game';
import { FLEET_ROSTER } from '../../src/types/fleet';
import { GameController } from '../../src/engine/game';
import { getLogger } from '../../src/observability/logger';
import type { LogEvent } from '../../src/types/events';

const typhoon = FLEET_ROSTER[0]!;
const akula = FLEET_ROSTER[1]!;
const seawolf = FLEET_ROSTER[2]!;
const virginia = FLEET_ROSTER[3]!;
const midget = FLEET_ROSTER[4]!;
const narwhal = FLEET_ROSTER[5]!;
const piranha = FLEET_ROSTER[6]!;

function placeFullFleet(gc: GameController) {
  gc.placeShipForCurrentPlayer(typhoon, { col: 0, row: 0, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(akula, { col: 0, row: 1, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(seawolf, { col: 0, row: 2, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(virginia, { col: 0, row: 3, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(midget, { col: 0, row: 4, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(narwhal, { col: 0, row: 5, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(piranha, { col: 0, row: 6, depth: 0 }, 'col');
}

function setupBothPlayers(gc: GameController) {
  placeFullFleet(gc);
  gc.confirmSetup();
  placeFullFleet(gc);
  gc.confirmSetup();
}

describe('event completeness', () => {
  it('full game emits complete event trail', () => {
    const gc = new GameController('event-completeness-test');
    setupBothPlayers(gc);

    // Player 0 (ALPHA) fires at Player 1 (BRAVO) ship cells.
    // BRAVO's fleet is placed at the same positions as ALPHA's:
    //   typhoon:  (0,0,0)-(4,0,0)  size 5
    //   akula:    (0,1,0)-(3,1,0)  size 4
    //   seawolf:  (0,2,0)-(2,2,0)  size 3
    //   virginia: (0,3,0)-(2,3,0)  size 3
    //   midget:   (0,4,0)-(1,4,0)  size 2
    //   narwhal:  (0,5,0)-(2,5,0)  size 3
    //   piranha:  (0,6,0)-(1,6,0)  size 2
    // Total: 22 cells

    // Build list of all target cells for each player's ships
    const bravoShipCells = [
      // typhoon
      { col: 0, row: 0, depth: 0 }, { col: 1, row: 0, depth: 0 },
      { col: 2, row: 0, depth: 0 }, { col: 3, row: 0, depth: 0 },
      { col: 4, row: 0, depth: 0 },
      // akula
      { col: 0, row: 1, depth: 0 }, { col: 1, row: 1, depth: 0 },
      { col: 2, row: 1, depth: 0 }, { col: 3, row: 1, depth: 0 },
      // seawolf
      { col: 0, row: 2, depth: 0 }, { col: 1, row: 2, depth: 0 },
      { col: 2, row: 2, depth: 0 },
      // virginia
      { col: 0, row: 3, depth: 0 }, { col: 1, row: 3, depth: 0 },
      { col: 2, row: 3, depth: 0 },
      // midget
      { col: 0, row: 4, depth: 0 }, { col: 1, row: 4, depth: 0 },
      // narwhal
      { col: 0, row: 5, depth: 0 }, { col: 1, row: 5, depth: 0 },
      { col: 2, row: 5, depth: 0 },
      // piranha
      { col: 0, row: 6, depth: 0 }, { col: 1, row: 6, depth: 0 },
    ];

    // BRAVO fires misses (into empty space) so turns alternate
    let bravoMissCol = 6;
    let bravoMissRow = 6;
    let bravoMissDepth = 0;

    for (let i = 0; i < bravoShipCells.length; i++) {
      // ALPHA fires at BRAVO's ship
      const target = bravoShipCells[i]!;
      const fireResult = gc.fireTorpedo(target);
      expect(fireResult).not.toBeNull();

      // Check if victory was reached
      if (gc.getState().phase === GamePhase.Victory) {
        break;
      }

      gc.endTurn();

      // BRAVO fires a miss into empty space
      gc.fireTorpedo({ col: bravoMissCol, row: bravoMissRow, depth: bravoMissDepth });
      bravoMissDepth++;
      if (bravoMissDepth >= 7) {
        bravoMissDepth = 0;
        bravoMissRow--;
      }
      gc.endTurn();
    }

    // Verify the game ended in victory
    const state = gc.getState();
    expect(state.phase).toBe(GamePhase.Victory);
    expect(state.winner).toBe(0);

    // Get the full event buffer
    const logger = getLogger();
    const buffer = logger.getBuffer() as readonly LogEvent[];
    expect(buffer.length).toBeGreaterThan(0);

    // Helper to filter events by type
    const eventsOfType = (type: string) => buffer.filter(e => e.event === type);

    // --- Assertion 1: game.start is the first event ---
    expect(buffer[0]!.event).toBe('game.start');

    // --- Assertion 2: fleet.place events (7 ships per player = 14 total) ---
    const fleetPlaceEvents = eventsOfType('fleet.place');
    expect(fleetPlaceEvents).toHaveLength(14);
    // Verify 7 per player
    const p0Places = fleetPlaceEvents.filter(e => e.data.player === 0);
    const p1Places = fleetPlaceEvents.filter(e => e.data.player === 1);
    expect(p0Places).toHaveLength(7);
    expect(p1Places).toHaveLength(7);

    // --- Assertion 3: game.phase_change events for each transition ---
    const phaseChanges = eventsOfType('game.phase_change');
    // Two phase_change events: SetupP1->SetupP2 and SetupP2->Combat.
    // The Combat->Victory transition is signaled by game.victory, not phase_change.
    expect(phaseChanges).toHaveLength(2);
    // SetupP1 -> SetupP2
    expect(phaseChanges[0]!.data.from).toBe(GamePhase.SetupP1);
    expect(phaseChanges[0]!.data.to).toBe(GamePhase.SetupP2);
    // SetupP2 -> Combat
    expect(phaseChanges[1]!.data.from).toBe(GamePhase.SetupP2);
    expect(phaseChanges[1]!.data.to).toBe(GamePhase.Combat);

    // --- Assertion 4: Every combat.fire has a matching combat.hit or combat.miss ---
    const fireEvents = eventsOfType('combat.fire');
    expect(fireEvents.length).toBeGreaterThan(0);

    for (const fire of fireEvents) {
      const target = fire.data.target as string;
      const player = fire.data.player as number;
      const result = fire.data.result as string;

      if (result === 'hit') {
        // Should have a matching combat.hit
        const matchingHit = eventsOfType('combat.hit').find(
          e => e.data.target === target && e.data.player === player
        );
        expect(matchingHit, `combat.fire hit at ${target} by player ${player} should have matching combat.hit`).toBeDefined();
      } else if (result === 'miss') {
        // Should have a matching combat.miss
        const matchingMiss = eventsOfType('combat.miss').find(
          e => e.data.target === target && e.data.player === player
        );
        expect(matchingMiss, `combat.fire miss at ${target} by player ${player} should have matching combat.miss`).toBeDefined();
      }
    }

    // --- Assertion 5: Every ship sunk has a combat.sunk event ---
    const sunkEvents = eventsOfType('combat.sunk');
    expect(sunkEvents).toHaveLength(7); // All 7 of BRAVO's ships sunk

    // Verify each sunk event has player, enemy, ship, and method
    for (const sunk of sunkEvents) {
      expect(sunk.data.player).toBeDefined();
      expect(sunk.data.enemy).toBeDefined();
      expect(sunk.data.ship).toBeDefined();
      expect(sunk.data.method).toBe('torpedo');
      expect(sunk.data.player).not.toBe(sunk.data.enemy);
    }

    // --- Assertion 6: game.turn_end / game.turn_start pairs exist ---
    const turnEndEvents = eventsOfType('game.turn_end');
    const turnStartEvents = eventsOfType('game.turn_start');

    // There should be one more turn_start than turn_end (the initial turn_start at combat begin)
    // Actually: combat starts with turn_start, then each endTurn produces turn_end + turn_start.
    // The final turn (victory) has no endTurn call, so turn_end count = turn_start count - 1.
    expect(turnStartEvents.length).toBe(turnEndEvents.length + 1);

    // Verify turn_end and turn_start alternate correctly in the buffer
    // Each turn_end should be followed by a turn_start (possibly with other events in between)
    for (let i = 0; i < turnEndEvents.length; i++) {
      const endSeq = turnEndEvents[i]!.seq;
      const nextStart = turnStartEvents.find(e => e.seq > endSeq);
      expect(nextStart, `game.turn_end at seq ${endSeq} should have a subsequent game.turn_start`).toBeDefined();
    }

    // --- Assertion 7: game.victory is the last game-category event ---
    const gameEvents = buffer.filter(e => e.event.startsWith('game.'));
    const lastGameEvent = gameEvents[gameEvents.length - 1]!;
    expect(lastGameEvent.event).toBe('game.victory');
    expect(lastGameEvent.data.winner).toBe(0);

    // --- Assertion 8: All sequence numbers are strictly monotonically increasing with no gaps ---
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]!.seq).toBe(i + 1);
    }

    // --- Assertion 9: fleet.confirm events (one per player) ---
    const confirmEvents = eventsOfType('fleet.confirm');
    expect(confirmEvents).toHaveLength(2);
    expect(confirmEvents[0]!.data.player).toBe(0);
    expect(confirmEvents[1]!.data.player).toBe(1);

    // --- Assertion 10: combat.hit count matches total ship cells hit ---
    const hitEvents = eventsOfType('combat.hit');
    expect(hitEvents).toHaveLength(22); // All 22 ship cells of BRAVO hit

    // --- Assertion 11: combat.miss events exist for BRAVO's misses ---
    const missEvents = eventsOfType('combat.miss');
    expect(missEvents.length).toBeGreaterThan(0);

    // --- Assertion 12: economy.credit events exist for hits ---
    const creditEvents = eventsOfType('economy.credit');
    expect(creditEvents.length).toBeGreaterThan(0);
    // Every credit event should have valid fields
    for (const credit of creditEvents) {
      expect(credit.data).toHaveProperty('player');
      expect(credit.data).toHaveProperty('type');
      expect(credit.data).toHaveProperty('amount');
      expect(credit.data).toHaveProperty('balance');
    }
  });
});
