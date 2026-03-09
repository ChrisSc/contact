// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountHandoffScreen } from '../../src/ui/screens/handoff-screen';
import { initLogger } from '../../src/observability/logger';
import { FLEET_ROSTER } from '../../src/types/fleet';
import { GamePhase } from '../../src/types/game';

vi.mock('../../src/audio/audio-manager', () => ({
  initAudioContext: vi.fn(),
}));

function placeStandardFleet(game: GameController): void {
  const placements: Array<{ id: string; col: number; row: number }> = [
    { id: 'typhoon',  col: 0, row: 0 },
    { id: 'akula',    col: 0, row: 1 },
    { id: 'seawolf',  col: 0, row: 2 },
    { id: 'virginia', col: 0, row: 3 },
    { id: 'midget',   col: 0, row: 4 },
    { id: 'narwhal',  col: 0, row: 5 },
    { id: 'piranha',  col: 0, row: 6 },
  ];
  for (const p of placements) {
    const entry = FLEET_ROSTER.find((r) => r.id === p.id)!;
    game.placeShipForCurrentPlayer(entry, { col: p.col, row: p.row, depth: 0 }, 'col');
  }
  game.placeDecoyForCurrentPlayer({ col: 6, row: 6, depth: 6 });
}

interface HandoffTestContext {
  game: GameController;
  router: ScreenRouter;
  container: HTMLElement;
}

function setupHandoffTest(): HandoffTestContext {
  initLogger('test');
  document.body.innerHTML = '';

  const appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);

  const game = new GameController('test');
  const router = new ScreenRouter(appContainer, game);
  router.register('handoff', mountHandoffScreen);
  router.register('setup', (_el) => ({ unmount: vi.fn() }));
  router.register('combat', (_el) => ({ unmount: vi.fn() }));

  const container = appContainer.querySelector('.screen-container') as HTMLElement;
  return { game, router, container };
}

describe('HandoffScreen', () => {
  let game: GameController;
  let router: ScreenRouter;
  let container: HTMLElement;

  beforeEach(() => {
    ({ game, router, container } = setupHandoffTest());
  });

  describe('setup phase', () => {
    it('displays correct player designation during setup (BRAVO after P1 confirms)', () => {
      // After ALPHA confirms setup, the handoff screen should be shown for BRAVO.
      // At this point the game state is SetupP2 with currentPlayer = 1 (BRAVO).
      placeStandardFleet(game);
      game.confirmSetup(); // transitions to SetupP2, currentPlayer becomes 1
      expect(game.getState().phase).toBe(GamePhase.SetupP2);

      router.navigate('handoff');
      const playerEl = container.querySelector('.handoff-screen__player');
      expect(playerEl?.textContent).toBe('BRAVO');
    });

    it('shows DEPLOY YOUR FLEET instruction during setup phase', () => {
      placeStandardFleet(game);
      game.confirmSetup(); // SetupP2

      router.navigate('handoff');
      const instruction = container.querySelector('.handoff-screen__instruction');
      expect(instruction?.textContent).toBe('DEPLOY YOUR FLEET');
    });

    it('READY button navigates to setup screen', () => {
      placeStandardFleet(game);
      game.confirmSetup(); // SetupP2

      router.navigate('handoff');
      const btn = container.querySelector('button.crt-button') as HTMLButtonElement;
      btn.click();
      expect(router.getCurrentScreen()).toBe('setup');
    });
  });

  describe('combat phase', () => {
    beforeEach(() => {
      // Advance game to Combat phase: both players place and confirm fleets.
      placeStandardFleet(game);
      game.confirmSetup();
      placeStandardFleet(game);
      game.confirmSetup();
      // Now in Combat phase, currentPlayer = 0 (ALPHA).
    });

    it('displays correct player designation during combat', () => {
      expect(game.getState().phase).toBe(GamePhase.Combat);
      router.navigate('handoff');
      const playerEl = container.querySelector('.handoff-screen__player');
      expect(playerEl?.textContent).toBe('ALPHA');
    });

    it('shows COMMENCE COMBAT instruction during combat phase', () => {
      router.navigate('handoff');
      const instruction = container.querySelector('.handoff-screen__instruction');
      expect(instruction?.textContent).toBe('COMMENCE COMBAT');
    });

    it('READY button navigates to combat screen', () => {
      router.navigate('handoff');
      const btn = container.querySelector('button.crt-button') as HTMLButtonElement;
      btn.click();
      expect(router.getCurrentScreen()).toBe('combat');
    });
  });

  describe('data leakage', () => {
    it('DOM contains no coordinate strings, ship names, or grid state', () => {
      placeStandardFleet(game);
      game.confirmSetup(); // SetupP2 — previous player's grid data must not leak

      router.navigate('handoff');
      const html = container.innerHTML;

      // No coordinate patterns
      expect(html).not.toMatch(/x:\d/i);
      expect(html).not.toMatch(/y:\d/i);
      expect(html).not.toMatch(/z:\d/i);
      expect(html).not.toMatch(/col:\d/i);
      expect(html).not.toMatch(/row:\d/i);
      expect(html).not.toMatch(/depth:\d/i);

      // No ship names from the fleet roster
      expect(html).not.toContain('Typhoon');
      expect(html).not.toContain('Akula');
      expect(html).not.toContain('Seawolf');
      expect(html).not.toContain('Virginia');
      expect(html).not.toContain('Midget');

      // Only the expected strings should be present
      expect(html).toContain('PASS DEVICE TO');
      expect(html).toContain('BRAVO');
      expect(html).toContain('DEPLOY YOUR FLEET');
      expect(html).toContain('READY');
    });
  });

  describe('cleanup', () => {
    it('removes all DOM elements on cleanup', () => {
      placeStandardFleet(game);
      game.confirmSetup();

      router.navigate('handoff');
      expect(container.querySelector('.handoff-screen')).not.toBeNull();

      // Navigating away triggers unmount / cleanup
      router.navigate('setup');
      expect(container.querySelector('.handoff-screen')).toBeNull();
    });
  });
});
