// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountVictoryScreen } from '../../src/ui/screens/victory-screen';
import { mountSetupScreen } from '../../src/ui/screens/setup-screen';
import { initLogger } from '../../src/observability/logger';
import * as exportModule from '../../src/observability/export';
import { GamePhase } from '../../src/types/game';
import { FLEET_ROSTER } from '../../src/types/fleet';

// Ship positions — all along 'col' axis at depth 0, each ship on its own row
const SHIP_PLACEMENTS = [
  { id: 'typhoon',  row: 0 },
  { id: 'akula',   row: 1 },
  { id: 'seawolf', row: 2 },
  { id: 'virginia', row: 3 },
  { id: 'midget',  row: 4 },
] as const;

const DECOY_COORD = { col: 7, row: 7, depth: 7 };

// All cells occupied by P2's ships — 5+4+3+3+2 = 17 cells
const P2_SHIP_CELLS = [
  // typhoon (size 5) row 0
  { col: 0, row: 0, depth: 0 }, { col: 1, row: 0, depth: 0 }, { col: 2, row: 0, depth: 0 },
  { col: 3, row: 0, depth: 0 }, { col: 4, row: 0, depth: 0 },
  // akula (size 4) row 1
  { col: 0, row: 1, depth: 0 }, { col: 1, row: 1, depth: 0 }, { col: 2, row: 1, depth: 0 },
  { col: 3, row: 1, depth: 0 },
  // seawolf (size 3) row 2
  { col: 0, row: 2, depth: 0 }, { col: 1, row: 2, depth: 0 }, { col: 2, row: 2, depth: 0 },
  // virginia (size 3) row 3
  { col: 0, row: 3, depth: 0 }, { col: 1, row: 3, depth: 0 }, { col: 2, row: 3, depth: 0 },
  // midget (size 2) row 4
  { col: 0, row: 4, depth: 0 }, { col: 1, row: 4, depth: 0 },
];

function placeFleetForCurrentPlayer(game: GameController): void {
  for (const placement of SHIP_PLACEMENTS) {
    const roster = FLEET_ROSTER.find((r) => r.id === placement.id)!;
    game.placeShipForCurrentPlayer(roster, { col: 0, row: placement.row, depth: 0 }, 'col');
  }
  game.placeDecoyForCurrentPlayer(DECOY_COORD);
}

function setupVictoryGame(): { game: GameController; router: ScreenRouter; container: HTMLElement } {
  initLogger('test');
  document.body.innerHTML = '';

  const appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);

  const game = new GameController('test');
  const router = new ScreenRouter(appContainer, game);
  router.register('victory', mountVictoryScreen);
  router.register('setup', mountSetupScreen);

  const container = appContainer.querySelector('.screen-container')!;

  // P1 (ALPHA) places fleet and confirms
  placeFleetForCurrentPlayer(game);
  game.confirmSetup();

  // P2 (BRAVO) places fleet and confirms — transitions to Combat
  placeFleetForCurrentPlayer(game);
  game.confirmSetup();

  // Verify we entered combat phase
  if (game.getState().phase !== GamePhase.Combat) {
    throw new Error('Expected Combat phase after both players confirmed setup');
  }

  // ALPHA fires at all 17 of P2's ship cells; BRAVO returns fire at empty cells each round.
  // BRAVO needs up to 16 unique empty target cells (one per ALPHA shot except the last).
  // Use rows 5 and 6 (never occupied) × 8 cols = 16 unique cells — exactly enough.
  let bravoShot = 0;
  for (const target of P2_SHIP_CELLS) {
    game.fireTorpedo(target);
    if (game.getState().phase === GamePhase.Victory) break;
    game.endTurn();
    const bravoTarget = { col: bravoShot % 8, row: 5 + Math.floor(bravoShot / 8), depth: 0 };
    game.fireTorpedo(bravoTarget);
    game.endTurn();
    bravoShot++;
  }

  if (game.getState().phase !== GamePhase.Victory) {
    throw new Error('Expected Victory phase after sinking all P2 ships');
  }

  if (game.getState().winner !== 0) {
    throw new Error('Expected ALPHA (0) to be the winner');
  }

  router.navigate('victory');
  return { game, router, container };
}

describe('Victory Screen', () => {
  let game: GameController;
  let router: ScreenRouter;
  let container: HTMLElement;

  beforeEach(() => {
    ({ game, router, container } = setupVictoryGame());
  });

  it('renders winner designation', () => {
    const winnerEl = container.querySelector('.victory-screen__winner');
    expect(winnerEl?.textContent).toBe('ALPHA WINS');
  });

  it('renders turn count and shot stats', () => {
    const stats = container.querySelectorAll('.victory-screen__stat');
    expect(stats.length).toBe(4);
    expect(stats[0]?.textContent).toContain('TURNS:');
    expect(stats[1]?.textContent).toContain('SHOTS FIRED: 17');
    expect(stats[2]?.textContent).toContain('HIT RATE: 100%');
    expect(stats[3]?.textContent).toContain('ABILITIES USED: 0');
  });

  it('export button triggers exportSession', () => {
    const spy = vi.spyOn(exportModule, 'exportSession').mockImplementation(() => {});

    const buttons = container.querySelectorAll('button');
    const exportBtn = Array.from(buttons).find((b) => b.textContent === 'EXPORT SESSION LOG');
    expect(exportBtn).toBeDefined();
    exportBtn!.click();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('new engagement resets game and navigates to setup', () => {
    const buttons = container.querySelectorAll('button');
    const newGameBtn = Array.from(buttons).find((b) => b.textContent === 'NEW ENGAGEMENT');
    expect(newGameBtn).toBeDefined();
    newGameBtn!.click();

    expect(router.getCurrentScreen()).toBe('setup');
  });
});
