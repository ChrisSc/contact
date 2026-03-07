import { describe, it, expect, beforeEach } from 'vitest';
import { GamePhase } from '../../src/types/game';
import { CellState } from '../../src/types/grid';
import { FLEET_ROSTER } from '../../src/types/fleet';
import type { FleetRosterEntry } from '../../src/types/fleet';
import { GameController } from '../../src/engine/game';
import { getCell } from '../../src/engine/grid';
import { getLogger } from '../../src/observability/logger';

const typhoon = FLEET_ROSTER[0]!;
const akula = FLEET_ROSTER[1]!;
const seawolf = FLEET_ROSTER[2]!;
const virginia = FLEET_ROSTER[3]!;
const midget = FLEET_ROSTER[4]!;

function placeFullFleet(gc: GameController) {
  // Place all 5 ships along col axis, different rows
  gc.placeShipForCurrentPlayer(typhoon, { col: 0, row: 0, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(akula, { col: 0, row: 1, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(seawolf, { col: 0, row: 2, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(virginia, { col: 0, row: 3, depth: 0 }, 'col');
  gc.placeShipForCurrentPlayer(midget, { col: 0, row: 4, depth: 0 }, 'col');
}

function setupBothPlayers(gc: GameController) {
  placeFullFleet(gc);
  gc.confirmSetup();
  placeFullFleet(gc);
  gc.confirmSetup();
}

describe('GameController - Construction', () => {
  it('initializes with SetupP1 phase and player 0', () => {
    const gc = new GameController('test-session');
    const state = gc.getState();
    expect(state.phase).toBe(GamePhase.SetupP1);
    expect(state.currentPlayer).toBe(0);
    expect(state.turnCount).toBe(0);
  });

  it('emits game.start event on construction', () => {
    const gc = new GameController('test-session');
    const logger = getLogger();
    const events = logger.getBuffer();
    expect(events.some((e) => e.event === 'game.start')).toBe(true);
  });
});

describe('GameController - Setup', () => {
  it('places ships for current player', () => {
    const gc = new GameController('test-session');
    const result = gc.placeShipForCurrentPlayer(
      midget,
      { col: 0, row: 0, depth: 0 },
      'col',
    );
    expect(result).toBe(true);
    expect(gc.getCurrentPlayer().ships).toHaveLength(1);
  });

  it('rejects ship placement during combat', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);
    const result = gc.placeShipForCurrentPlayer(
      midget,
      { col: 0, row: 5, depth: 5 },
      'col',
    );
    expect(result).toBe(false);
  });

  it('removes a placed ship', () => {
    const gc = new GameController('test-session');
    gc.placeShipForCurrentPlayer(midget, { col: 0, row: 0, depth: 0 }, 'col');
    expect(gc.removeShipForCurrentPlayer('midget')).toBe(true);
    expect(gc.getCurrentPlayer().ships).toHaveLength(0);
  });

  it('places a decoy', () => {
    const gc = new GameController('test-session');
    const result = gc.placeDecoyForCurrentPlayer({ col: 7, row: 7, depth: 7 });
    expect(result).toBe(true);
    const cell = getCell(gc.getCurrentPlayer().ownGrid, { col: 7, row: 7, depth: 7 });
    expect(cell!.state).toBe(CellState.Decoy);
  });
});

describe('GameController - Phase Transitions', () => {
  it('transitions SetupP1 -> SetupP2', () => {
    const gc = new GameController('test-session');
    placeFullFleet(gc);
    expect(gc.confirmSetup()).toBe(true);
    expect(gc.getState().phase).toBe(GamePhase.SetupP2);
    expect(gc.getState().currentPlayer).toBe(1);
  });

  it('transitions SetupP2 -> Combat', () => {
    const gc = new GameController('test-session');
    placeFullFleet(gc);
    gc.confirmSetup();
    placeFullFleet(gc);
    expect(gc.confirmSetup()).toBe(true);
    expect(gc.getState().phase).toBe(GamePhase.Combat);
    expect(gc.getState().currentPlayer).toBe(0);
    expect(gc.getState().turnCount).toBe(1);
  });

  it('rejects confirmSetup with incomplete fleet', () => {
    const gc = new GameController('test-session');
    gc.placeShipForCurrentPlayer(midget, { col: 0, row: 0, depth: 0 }, 'col');
    expect(gc.confirmSetup()).toBe(false);
  });
});

describe('GameController - Combat', () => {
  it('fires torpedo and gets miss', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    const result = gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    expect(result).not.toBeNull();
    expect(result!.result).toBe('miss');
  });

  it('fires torpedo and gets hit', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    // Player 0 fires at player 1's ship (typhoon at col 0, row 0, depth 0)
    const result = gc.fireTorpedo({ col: 0, row: 0, depth: 0 });
    expect(result!.result).toBe('hit');
    expect(result!.shipId).toBe('typhoon');
  });

  it('fires torpedo and sinks ship', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    // Sink the midget sub (size 2 at row 4)
    const hit1 = gc.fireTorpedo({ col: 0, row: 4, depth: 0 });
    expect(hit1!.result).toBe('hit');

    gc.endTurn();
    // Player 1 fires a miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    // Player 0 fires second shot
    const hit2 = gc.fireTorpedo({ col: 1, row: 4, depth: 0 });
    expect(hit2!.result).toBe('sunk');
    expect(hit2!.shipId).toBe('midget');
  });

  it('prevents double action in same turn', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    const second = gc.fireTorpedo({ col: 6, row: 6, depth: 6 });
    expect(second).toBeNull();
  });

  it('prevents firing at already-targeted cell', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 6 });
    gc.endTurn();

    // Player 0 tries to fire at same cell again
    const result = gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    expect(result).toBeNull();
  });

  it('endTurn fails without action', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    expect(gc.endTurn()).toBe(false);
  });

  it('alternates players on endTurn', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    expect(gc.getState().currentPlayer).toBe(0);
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();
    expect(gc.getState().currentPlayer).toBe(1);
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();
    expect(gc.getState().currentPlayer).toBe(0);
  });

  it('handles decoy hit as apparent hit', () => {
    const gc = new GameController('test-session');

    // Place fleet + decoy for player 0
    placeFullFleet(gc);
    gc.placeDecoyForCurrentPlayer({ col: 7, row: 7, depth: 7 });
    gc.confirmSetup();

    // Player 1 places fleet + decoy
    placeFullFleet(gc);
    gc.placeDecoyForCurrentPlayer({ col: 6, row: 6, depth: 6 });
    gc.confirmSetup();

    // Player 0 fires at player 1's decoy
    const result = gc.fireTorpedo({ col: 6, row: 6, depth: 6 });
    expect(result!.result).toBe('hit');

    // Attacker's targeting grid shows Hit
    const attackerCell = getCell(gc.getCurrentPlayer().targetingGrid, { col: 6, row: 6, depth: 6 });
    expect(attackerCell!.state).toBe(CellState.Hit);

    // Defender's grid shows DecoyHit
    const defenderCell = getCell(gc.getOpponent().ownGrid, { col: 6, row: 6, depth: 6 });
    expect(defenderCell!.state).toBe(CellState.DecoyHit);
  });
});

describe('GameController - Victory', () => {
  it('declares victory when all opponent ships sunk', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    // Sink all of player 1's ships by firing at each cell
    const shipCells = [
      // typhoon (5): row 0, cols 0-4
      ...Array.from({ length: 5 }, (_, i) => ({ col: i, row: 0, depth: 0 })),
      // akula (4): row 1, cols 0-3
      ...Array.from({ length: 4 }, (_, i) => ({ col: i, row: 1, depth: 0 })),
      // seawolf (3): row 2, cols 0-2
      ...Array.from({ length: 3 }, (_, i) => ({ col: i, row: 2, depth: 0 })),
      // virginia (3): row 3, cols 0-2
      ...Array.from({ length: 3 }, (_, i) => ({ col: i, row: 3, depth: 0 })),
      // midget (2): row 4, cols 0-1
      ...Array.from({ length: 2 }, (_, i) => ({ col: i, row: 4, depth: 0 })),
    ];

    let missCol = 7;
    let missDepth = 0;

    for (const cell of shipCells) {
      gc.fireTorpedo(cell);

      if (gc.getState().phase === GamePhase.Victory) break;

      gc.endTurn();
      // Player 1 fires misses
      gc.fireTorpedo({ col: missCol, row: 7, depth: missDepth });
      gc.endTurn();
      missDepth++;
      if (missDepth >= 8) {
        missDepth = 0;
        missCol--;
      }
    }

    expect(gc.getState().phase).toBe(GamePhase.Victory);
    expect(gc.getState().winner).toBe(0);
  });

  it('emits game.victory event', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);

    // Quick sink: just the midget
    // Actually we need to sink ALL ships. Let's verify victory event is emitted
    // by doing a simpler approach — sink all ships

    const shipCells = [
      ...Array.from({ length: 5 }, (_, i) => ({ col: i, row: 0, depth: 0 })),
      ...Array.from({ length: 4 }, (_, i) => ({ col: i, row: 1, depth: 0 })),
      ...Array.from({ length: 3 }, (_, i) => ({ col: i, row: 2, depth: 0 })),
      ...Array.from({ length: 3 }, (_, i) => ({ col: i, row: 3, depth: 0 })),
      ...Array.from({ length: 2 }, (_, i) => ({ col: i, row: 4, depth: 0 })),
    ];

    let missCol = 7;
    let missDepth = 0;

    for (const cell of shipCells) {
      gc.fireTorpedo(cell);
      if (gc.getState().phase === GamePhase.Victory) break;
      gc.endTurn();
      gc.fireTorpedo({ col: missCol, row: 7, depth: missDepth });
      gc.endTurn();
      missDepth++;
      if (missDepth >= 8) {
        missDepth = 0;
        missCol--;
      }
    }

    const logger = getLogger();
    const events = logger.getBuffer();
    expect(events.some((e) => e.event === 'game.victory')).toBe(true);
    const victoryEvent = events.find((e) => e.event === 'game.victory')!;
    expect(victoryEvent.data.winner).toBe(0);
    expect(victoryEvent.data.designation).toBe('ALPHA');
  });
});

describe('GameController - Logger Events', () => {
  it('emits fleet.place events during setup', () => {
    const gc = new GameController('test-session');
    gc.placeShipForCurrentPlayer(midget, { col: 0, row: 0, depth: 0 }, 'col');

    const events = getLogger().getBuffer();
    const placeEvents = events.filter((e) => e.event === 'fleet.place');
    expect(placeEvents.length).toBeGreaterThanOrEqual(1);
    expect(placeEvents[0]!.data.ship).toBe('midget');
  });

  it('emits phase change events', () => {
    const gc = new GameController('test-session');
    placeFullFleet(gc);
    gc.confirmSetup();

    const events = getLogger().getBuffer();
    const phaseEvents = events.filter((e) => e.event === 'game.phase_change');
    expect(phaseEvents.length).toBeGreaterThanOrEqual(1);
    expect(phaseEvents[0]!.data.from).toBe('setup_p1');
    expect(phaseEvents[0]!.data.to).toBe('setup_p2');
  });

  it('emits combat events on fire', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });

    const events = getLogger().getBuffer();
    expect(events.some((e) => e.event === 'combat.fire')).toBe(true);
    expect(events.some((e) => e.event === 'combat.miss')).toBe(true);
  });

  it('emits turn events', () => {
    const gc = new GameController('test-session');
    setupBothPlayers(gc);
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    const events = getLogger().getBuffer();
    expect(events.some((e) => e.event === 'game.turn_end')).toBe(true);
    expect(events.filter((e) => e.event === 'game.turn_start').length).toBeGreaterThanOrEqual(2);
  });
});
