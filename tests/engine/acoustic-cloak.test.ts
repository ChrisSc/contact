import { describe, it, expect, beforeEach } from 'vitest';
import { GamePhase } from '../../src/types/game';
import { CellState } from '../../src/types/grid';
import { FLEET_ROSTER } from '../../src/types/fleet';
import { GameController } from '../../src/engine/game';
import { getCell } from '../../src/engine/grid';
import { getLogger } from '../../src/observability/logger';

const typhoon = FLEET_ROSTER[0]!;
const akula = FLEET_ROSTER[1]!;
const seawolf = FLEET_ROSTER[2]!;
const virginia = FLEET_ROSTER[3]!;
const midget = FLEET_ROSTER[4]!;

function placeFullFleet(gc: GameController) {
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

function earnCredits(gc: GameController, target: number) {
  let col = 0;
  let missDepth = 1;
  const startCredits = gc.getCurrentPlayer().credits;
  while (gc.getCurrentPlayer().credits - startCredits < target) {
    gc.fireTorpedo({ col, row: 0, depth: 0 }); // hit
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: missDepth++ }); // opponent misses
    gc.endTurn();
    col++;
    if (col >= 5) break;
  }
}

describe('GameController - Acoustic Cloak', () => {
  it('deploy sets active=true and turnsRemaining=2', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 needs credits for acoustic_cloak (cost 6)
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // hit +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak'); // cost 6, have 6
    const deployed = gc.useAcousticCloak();
    expect(deployed).toBe(true);
    expect(gc.getTurnSlots().defendUsed).toBe(true);

    const player = gc.getCurrentPlayer();
    expect(player.abilities.acoustic_cloak.active).toBe(true);
    expect(player.abilities.acoustic_cloak.turnsRemaining).toBe(2);
  });

  it('rejects if already active', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // Earn enough for two purchases
    earnCredits(gc, 12);

    gc.purchasePerk('acoustic_cloak');
    gc.purchasePerk('acoustic_cloak');

    gc.useAcousticCloak();
    const second = gc.useAcousticCloak();
    expect(second).toBe(false);
  });

  it('rejects if no inventory', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    const result = gc.useAcousticCloak();
    expect(result).toBe(false);
  });

  it('countdown: expires after 2 opponent turns', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 earns credits and deploys cloak
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    // P0's cloak turnsRemaining = 2
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.active).toBe(true);
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.turnsRemaining).toBe(2);

    // P0 fires and ends turn -> P1's turn starts
    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();

    // P0's cloak NOT decremented yet (P0's opponent hasn't completed a turn)
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.active).toBe(true);
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.turnsRemaining).toBe(2);

    // P1 fires and ends turn (1st opponent turn for P0)
    gc.fireTorpedo({ col: 7, row: 7, depth: 4 });
    gc.endTurn();

    // P0's turn starts -> cloak decrements to 1
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.active).toBe(true);
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.turnsRemaining).toBe(1);

    // P0 fires and ends turn
    gc.fireTorpedo({ col: 7, row: 6, depth: 5 });
    gc.endTurn();

    // P1 fires and ends turn (2nd opponent turn for P0)
    gc.fireTorpedo({ col: 7, row: 6, depth: 4 });
    gc.endTurn();

    // P0's turn starts -> cloak decrements to 0 (expired)
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.active).toBe(false);
    expect(gc.getState().players[0]!.abilities.acoustic_cloak.turnsRemaining).toBeNull();
  });

  it('expire emits perk.expire event', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 deploys cloak
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    // Two opponent turns to expire
    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 4 });
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 5 });
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 4 });
    gc.endTurn();

    const logger = getLogger();
    const events = logger.getBuffer();
    const expireEvent = events.find(e => e.event === 'perk.expire' && e.data.perkId === 'acoustic_cloak');
    expect(expireEvent).toBeDefined();
  });

  it('acoustic cloak active masks sonar ping results', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 deploys cloak
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();

    // P1 pings P0's ship (should be masked by cloak)
    gc.purchasePerk('sonar_ping'); // P1 has 5, cost 3
    const pingResult = gc.useSonarPing({ col: 2, row: 0, depth: 0 });
    expect(pingResult).not.toBeNull();
    expect(pingResult!.cloaked).toBe(true);
    const targetCell = pingResult!.cells.find(c => c.coord.col === 2 && c.coord.row === 0 && c.coord.depth === 0);
    expect(targetCell!.rawResult).toBe(true);
    expect(targetCell!.displayedResult).toBe(false);
  });

  it('acoustic cloak active masks drone results', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P1 needs credits for drone (cost 10). Earn first, then P0 deploys cloak.
    // Turn 1 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();
    // Turn 2 (P1): hit P0 +1 = 6
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 });
    gc.endTurn();
    // Turn 3 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 6 });
    gc.endTurn();
    // Turn 4 (P1): consecutive +6 = 12
    gc.fireTorpedo({ col: 1, row: 0, depth: 0 });
    gc.endTurn();

    // Turn 5 (P0): deploy cloak then fire
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // hit +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 7 });
    gc.endTurn();
    // P0 now has 6 credits
    gc.purchasePerk('acoustic_cloak'); // cost 6
    gc.useAcousticCloak();

    gc.fireTorpedo({ col: 7, row: 6, depth: 5 });
    gc.endTurn();

    // P1's turn: cloak still active (0 opponent turns elapsed for P0)
    gc.purchasePerk('recon_drone'); // cost 10, P1 has 12
    const droneResult = gc.useReconDrone({ col: 2, row: 0, depth: 0 });
    expect(droneResult).not.toBeNull();
    expect(droneResult!.cloaked).toBe(true);
    expect(droneResult!.cells.every(c => !c.displayedResult)).toBe(true);
  });

  it('acoustic cloak active masks G-SONAR results', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P1 earns credits for G-SONAR (cost 18) first, then P0 deploys cloak.
    // Turn 1 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();
    // Turn 2 (P1): hit +1 = 6
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 });
    gc.endTurn();
    // Turn 3 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 6 });
    gc.endTurn();
    // Turn 4 (P1): consecutive +6 = 12
    gc.fireTorpedo({ col: 1, row: 0, depth: 0 });
    gc.endTurn();
    // Turn 5 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();
    // Turn 6 (P1): consecutive +6 = 18
    gc.fireTorpedo({ col: 2, row: 0, depth: 0 });
    gc.endTurn();
    // Turn 7 (P0): miss
    gc.fireTorpedo({ col: 7, row: 7, depth: 4 });
    gc.endTurn();
    // Turn 8 (P1): consecutive +6 = 24
    gc.fireTorpedo({ col: 3, row: 0, depth: 0 });
    gc.endTurn();

    // Turn 9 (P0): P0 earns credits for cloak and deploys it
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // hit +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 7 }); // P1 misses
    gc.endTurn();
    // P0 has 6 credits now
    gc.purchasePerk('acoustic_cloak'); // cost 6
    gc.useAcousticCloak();

    gc.fireTorpedo({ col: 7, row: 6, depth: 5 });
    gc.endTurn();

    // P1's turn: cloak still active (0 opponent turns elapsed for P0)
    gc.purchasePerk('g_sonar'); // cost 18, P1 has 24
    const gsonarResult = gc.useGSonar(0);
    expect(gsonarResult).not.toBeNull();
    expect(gsonarResult!.cloaked).toBe(true);
    expect(gsonarResult!.cells.every(c => !c.displayedResult)).toBe(true);
  });

  it('does NOT block torpedoes', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 deploys cloak
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();

    // P1 fires torpedo at P0's ship — should still hit
    const result = gc.fireTorpedo({ col: 2, row: 0, depth: 0 });
    expect(result).not.toBeNull();
    expect(result!.result).toBe('hit');
    expect(result!.shipId).toBe('typhoon');
  });

  it('does NOT block depth charges', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    // P0 deploys cloak
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    gc.fireTorpedo({ col: 7, row: 7, depth: 5 });
    gc.endTurn();

    // P1 needs 25 credits for depth charge
    // P1 has 5. Earn more by hitting P0 ships.
    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 5 });
    gc.endTurn();
    gc.fireTorpedo({ col: 1, row: 0, depth: 0 }); // +6 = 12
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 6, depth: 4 });
    gc.endTurn();
    gc.fireTorpedo({ col: 2, row: 0, depth: 0 }); // +6 = 18
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 5, depth: 4 });
    gc.endTurn();
    gc.fireTorpedo({ col: 3, row: 0, depth: 0 }); // +6 = 24
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 5, depth: 3 });
    gc.endTurn();
    gc.fireTorpedo({ col: 4, row: 0, depth: 0 }); // sunk typhoon +11 = 35 (but actually sink bonus)
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 4, depth: 3 });
    gc.endTurn();

    gc.purchasePerk('depth_charge'); // cost 25
    // Target P0's midget sub at row 4, cols 0-1, depth 0
    const dcResult = gc.useDepthCharge({ col: 0, row: 4, depth: 0 });
    expect(dcResult).not.toBeNull();

    const hits = dcResult!.cellResults.filter(c => c.result === 'hit' || c.result === 'sunk');
    expect(hits.length).toBeGreaterThanOrEqual(2); // midget sub is size 2
  });

  it('emits perk.use event on deploy', () => {
    const gc = new GameController('test-ac');
    setupBothPlayers(gc);

    gc.fireTorpedo({ col: 0, row: 0, depth: 0 }); // +1 = 6
    gc.endTurn();
    gc.fireTorpedo({ col: 7, row: 7, depth: 7 });
    gc.endTurn();

    gc.purchasePerk('acoustic_cloak');
    gc.useAcousticCloak();

    const logger = getLogger();
    const events = logger.getBuffer();
    const perkUse = events.find(e => e.event === 'perk.use' && e.data.perkId === 'acoustic_cloak');
    expect(perkUse).toBeDefined();
    expect(perkUse!.data.result).toBe('deployed');
  });
});
