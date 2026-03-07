// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountSetupScreen } from '../../src/ui/screens/setup-screen';
import { mountHandoffScreen } from '../../src/ui/screens/handoff-screen';
import { initLogger } from '../../src/observability/logger';
import { FLEET_ROSTER } from '../../src/types/fleet';
import { CellState, GRID_SIZE } from '../../src/types/grid';
import { getCell } from '../../src/engine/grid';

describe('Setup Screen', () => {
  let container: HTMLElement;
  let game: GameController;
  let router: ScreenRouter;
  let appContainer: HTMLElement;

  beforeEach(() => {
    initLogger('test');
    document.body.innerHTML = '';
    appContainer = document.createElement('div');
    appContainer.id = 'app';
    document.body.appendChild(appContainer);
    game = new GameController('test');
    router = new ScreenRouter(appContainer, game);
    router.register('setup', mountSetupScreen);
    router.register('handoff', mountHandoffScreen);
    container = appContainer.querySelector('.screen-container')!;
  });

  function mountScreen() {
    router.navigate('setup');
  }

  it('renders with fleet roster showing all 5 ships', () => {
    mountScreen();
    const entries = container.querySelectorAll('.ship-roster__entry');
    expect(entries.length).toBe(5);
  });

  it('renders header with ALPHA designation for P1', () => {
    mountScreen();
    const header = container.querySelector('.setup-screen__header-player');
    expect(header?.textContent).toBe('ALPHA');
  });

  it('renders slice grid with 64 cells', () => {
    mountScreen();
    const cells = container.querySelectorAll('.slice-grid__cell');
    expect(cells.length).toBe(64);
  });

  it('renders depth selector with 8 buttons', () => {
    mountScreen();
    const buttons = container.querySelectorAll('.depth-selector__btn');
    expect(buttons.length).toBe(8);
  });

  it('renders axis selector with 3 buttons', () => {
    mountScreen();
    const buttons = container.querySelectorAll('.axis-selector__btn');
    expect(buttons.length).toBe(3);
  });

  it('shows status prompting to select a vessel', () => {
    mountScreen();
    const status = container.querySelector('.setup-screen__status');
    expect(status?.textContent).toContain('SELECT A VESSEL');
  });

  it('can select a ship from roster', () => {
    mountScreen();
    const firstEntry = container.querySelector('.ship-roster__entry') as HTMLElement;
    firstEntry.click();
    expect(firstEntry.classList.contains('ship-roster__entry--selected')).toBe(true);
  });

  it('places a ship on cell click after selecting from roster', () => {
    mountScreen();

    // Select Midget Sub (size 2, easy to place)
    const entries = container.querySelectorAll('.ship-roster__entry');
    const midgetEntry = Array.from(entries).find(
      (e) => e.querySelector('.ship-roster__name')?.textContent === 'Midget Sub',
    ) as HTMLElement;
    midgetEntry.click();

    // Click a cell
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    // Ship should be placed
    const player = game.getCurrentPlayer();
    expect(player.ships.length).toBe(1);
    expect(player.ships[0]!.id).toBe('midget');
  });

  it('full placement flow: place all ships + decoy + confirm', () => {
    mountScreen();

    // Place all 5 ships along column axis at depth 0, different rows to avoid overlap
    const placements = [
      { id: 'typhoon', col: 0, row: 0 },   // size 5, cols 0-4
      { id: 'akula', col: 0, row: 1 },      // size 4, cols 0-3
      { id: 'seawolf', col: 0, row: 2 },    // size 3, cols 0-2
      { id: 'virginia', col: 0, row: 3 },   // size 3, cols 0-2
      { id: 'midget', col: 0, row: 4 },     // size 2, cols 0-1
    ];

    for (const p of placements) {
      // Find and click roster entry
      const entries = container.querySelectorAll('.ship-roster__entry');
      const entry = Array.from(entries).find(
        (e) => e.getAttribute('data-ship-id') === p.id,
      ) as HTMLElement;
      entry.click();

      // Click grid cell to place
      const cell = container.querySelector(`[data-col="${p.col}"][data-row="${p.row}"]`) as HTMLElement;
      cell.click();
    }

    expect(game.getCurrentPlayer().ships.length).toBe(5);

    // Status should prompt for decoy
    const status = container.querySelector('.setup-screen__status');
    expect(status?.textContent).toContain('DECOY');

    // Place decoy at an empty cell
    const decoyCell = container.querySelector('[data-col="7"][data-row="7"]') as HTMLElement;
    decoyCell.click();

    // Confirm button should be enabled
    const confirmBtn = container.querySelector('.crt-button:not(.crt-button--danger)') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    expect(status?.textContent).toContain('CONFIRM');

    // Click confirm
    confirmBtn.click();

    // Should navigate to handoff
    expect(router.getCurrentScreen()).toBe('handoff');
  });

  it('reset button clears all placements', () => {
    mountScreen();

    // Place one ship
    const entries = container.querySelectorAll('.ship-roster__entry');
    const first = entries[4] as HTMLElement; // Midget Sub
    first.click();
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    expect(game.getCurrentPlayer().ships.length).toBe(1);

    // Click reset
    const resetBtn = container.querySelector('.crt-button--danger') as HTMLElement;
    resetBtn.click();

    expect(game.getCurrentPlayer().ships.length).toBe(0);
  });
});
