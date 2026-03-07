// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountCombatScreen } from '../../src/ui/screens/combat-screen';
import { mountHandoffScreen } from '../../src/ui/screens/handoff-screen';
import { mountVictoryScreen } from '../../src/ui/screens/victory-screen';
import { initLogger } from '../../src/observability/logger';
import { FLEET_ROSTER } from '../../src/types/fleet';

// Ship placements used for both players.
// All ships along the 'col' axis at depth 0, different rows to avoid overlap:
//   typhoon  (size 5): cols 0-4, row 0
//   akula    (size 4): cols 0-3, row 1
//   seawolf  (size 3): cols 0-2, row 2
//   virginia (size 3): cols 0-2, row 3
//   midget   (size 2): cols 0-1, row 4
// Decoy at col 7, row 7, depth 7.

function placeStandardFleet(game: GameController): void {
  const placements: Array<{ id: string; col: number; row: number }> = [
    { id: 'typhoon', col: 0, row: 0 },
    { id: 'akula',   col: 0, row: 1 },
    { id: 'seawolf', col: 0, row: 2 },
    { id: 'virginia',col: 0, row: 3 },
    { id: 'midget',  col: 0, row: 4 },
  ];

  for (const p of placements) {
    const entry = FLEET_ROSTER.find((r) => r.id === p.id)!;
    game.placeShipForCurrentPlayer(entry, { col: p.col, row: p.row, depth: 0 }, 'col');
  }

  game.placeDecoyForCurrentPlayer({ col: 7, row: 7, depth: 7 });
}

interface CombatTestContext {
  game: GameController;
  router: ScreenRouter;
  container: HTMLElement;
}

function setupCombatGame(): CombatTestContext {
  initLogger('test');
  document.body.innerHTML = '';

  const appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);

  const game = new GameController('test');
  const router = new ScreenRouter(appContainer, game);
  router.register('combat', mountCombatScreen);
  router.register('handoff', mountHandoffScreen);
  router.register('victory', mountVictoryScreen);

  // Place P1 (ALPHA) fleet and confirm
  placeStandardFleet(game);
  game.confirmSetup();

  // Place P2 (BRAVO) fleet and confirm → enters Combat phase
  placeStandardFleet(game);
  game.confirmSetup();

  router.navigate('combat');

  const container = appContainer.querySelector('.screen-container')!;
  return { game, router, container };
}

describe('Combat Screen', () => {
  let game: GameController;
  let router: ScreenRouter;
  let container: HTMLElement;

  beforeEach(() => {
    ({ game, router, container } = setupCombatGame());
  });

  it('renders header with player designation, COMBAT, and turn counter', () => {
    const playerEl = container.querySelector('.combat-screen__header-player');
    const titleEl = container.querySelector('.combat-screen__header-title');
    const turnEl = container.querySelector('.combat-screen__header-turn');

    expect(playerEl?.textContent).toBe('ALPHA');
    expect(titleEl?.textContent).toBe('COMBAT');
    expect(turnEl?.textContent).toBe('TURN 1');
  });

  it('renders SliceGrid with 64 cells', () => {
    const cells = container.querySelectorAll('.slice-grid__cell');
    expect(cells.length).toBe(64);
  });

  it('renders depth selector with 9 buttons', () => {
    const buttons = container.querySelectorAll('.depth-selector__btn');
    expect(buttons.length).toBe(9);
  });

  it('renders board toggle with TARGETING active', () => {
    const toggleBtns = container.querySelectorAll('.combat-screen__toggle-btn');
    expect(toggleBtns.length).toBe(2);

    const firstBtn = toggleBtns[0] as HTMLElement;
    expect(firstBtn.classList.contains('combat-screen__toggle-btn--active')).toBe(true);
    expect(firstBtn.textContent).toBe('TARGETING');
  });

  it('renders HUD with initial stats including DEPTH, VIEW, CELLS', () => {
    const statLabels = container.querySelectorAll('.combat-screen__stat-label');
    const statValues = container.querySelectorAll('.combat-screen__stat-value');
    expect(statValues.length).toBeGreaterThanOrEqual(7);

    const labels = Array.from(statLabels).map((el) => el.textContent);
    const values = Array.from(statValues).map((el) => el.textContent);

    expect(labels).toContain('DEPTH');
    expect(labels).toContain('VIEW');
    expect(labels).toContain('CELLS');

    // DEPTH should show D1 (initial depth 0)
    const depthIdx = labels.indexOf('DEPTH');
    expect(values[depthIdx]).toBe('D1');
    // VIEW should show SLICE
    const viewIdx = labels.indexOf('VIEW');
    expect(values[viewIdx]).toBe('SLICE');
    // CELLS should show 64
    const cellsIdx = labels.indexOf('CELLS');
    expect(values[cellsIdx]).toBe('64');
  });

  it('renders 5 enemy fleet entries', () => {
    const entries = container.querySelectorAll('.combat-screen__fleet-entry');
    expect(entries.length).toBe(5);
  });

  it('End Turn button is disabled initially', () => {
    const buttons = Array.from(container.querySelectorAll('.crt-button')) as HTMLButtonElement[];
    const endTurnBtn = buttons.find((b) => b.textContent === 'END TURN');
    expect(endTurnBtn).toBeDefined();
    expect(endTurnBtn!.disabled).toBe(true);
  });

  it('cell click on targeting grid fires torpedo and status shows HIT', () => {
    // ALPHA fires at (col:0, row:0, depth:0) — BRAVO's Typhoon is there
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    const statusEl = container.querySelector('.combat-screen__status');
    expect(statusEl?.textContent).toContain('HIT');
    expect(statusEl?.classList.contains('combat-screen__status--hit')).toBe(true);
  });

  it('cannot fire twice: second click is blocked, End Turn stays enabled', () => {
    // First shot — hits Typhoon at (0,0,0)
    const firstCell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    firstCell.click();

    const buttons = Array.from(container.querySelectorAll('.crt-button')) as HTMLButtonElement[];
    const endTurnBtn = buttons.find((b) => b.textContent === 'END TURN')!;
    expect(endTurnBtn.disabled).toBe(false);

    // Capture current status text after first fire
    const statusEl = container.querySelector('.combat-screen__status')!;
    const statusAfterFirst = statusEl.textContent;

    // Second click at a different cell — engine's actionTaken guard blocks it
    const secondCell = container.querySelector('[data-col="5"][data-row="5"]') as HTMLElement;
    secondCell.click();

    // Status unchanged (second fire was a no-op)
    expect(statusEl.textContent).toBe(statusAfterFirst);
    // End Turn still enabled from the first (and only) fire
    expect(endTurnBtn.disabled).toBe(false);
  });

  it('board toggle switches to own fleet view', () => {
    const toggleBtns = container.querySelectorAll('.combat-screen__toggle-btn');
    const ownFleetBtn = Array.from(toggleBtns).find(
      (b) => b.textContent === 'OWN FLEET',
    ) as HTMLElement;

    ownFleetBtn.click();

    expect(ownFleetBtn.classList.contains('combat-screen__toggle-btn--active')).toBe(true);

    // After toggle, grid should now show ship cells (ALPHA's own ships are at depth 0)
    const cells = container.querySelectorAll('.slice-grid__cell');
    expect(cells.length).toBe(64);

    // At depth 0, row 0 cols 0-4 hold the Typhoon — should be rendered as cell-ship
    const shipCell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    expect(shipCell.classList.contains('cell-ship')).toBe(true);
  });

  it('cannot fire on own fleet view: click produces no fire result', () => {
    // Switch to own fleet
    const toggleBtns = container.querySelectorAll('.combat-screen__toggle-btn');
    const ownFleetBtn = Array.from(toggleBtns).find(
      (b) => b.textContent === 'OWN FLEET',
    ) as HTMLElement;
    ownFleetBtn.click();

    const statusEl = container.querySelector('.combat-screen__status')!;
    expect(statusEl.textContent).toBe('');

    // Click a cell — should be a no-op because boardView !== 'targeting'
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    expect(statusEl.textContent).toBe('');

    const buttons = Array.from(container.querySelectorAll('.crt-button')) as HTMLButtonElement[];
    const endTurnBtn = buttons.find((b) => b.textContent === 'END TURN')!;
    expect(endTurnBtn.disabled).toBe(true);
  });

  it('End Turn calls endTurn and navigates to handoff', () => {
    // Fire first to enable End Turn
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    const buttons = Array.from(container.querySelectorAll('.crt-button')) as HTMLButtonElement[];
    const endTurnBtn = buttons.find((b) => b.textContent === 'END TURN')! as HTMLButtonElement;
    expect(endTurnBtn.disabled).toBe(false);

    endTurnBtn.click();

    expect(router.getCurrentScreen()).toBe('handoff');
  });

  it('game log shows formatted fire result after a shot', () => {
    // Fire at (col:0, row:0, depth:0) — depth 0 is the initial slice, coord is A-1-D1
    const cell = container.querySelector('[data-col="0"][data-row="0"]') as HTMLElement;
    cell.click();

    const logEntry = container.querySelector('.combat-screen__log-entry');
    expect(logEntry).not.toBeNull();

    const logText = logEntry!.textContent ?? '';
    // Format: "T1 A-1-D1: HIT" (turn 1, column A=0, row 1=0+1, depth D1=0+1)
    expect(logText).toContain('T1');
    expect(logText).toContain('A-1-D1');
    expect(logText).toMatch(/HIT|SUNK/);
  });

  it('navigates to victory when last ship sunk', () => {
    // Sink all of BRAVO's ships except the last cell of Midget Sub at (col:1, row:4, depth:0).
    // We fire programmatically, alternating turns (ALPHA fires at BRAVO's ships,
    // BRAVO fires at empty/irrelevant cells on ALPHA's grid, then back to ALPHA).

    const p2ShipCells: Array<{ col: number; row: number; depth: number }> = [
      // Typhoon: cols 0-4, row 0, depth 0
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
      { col: 2, row: 0, depth: 0 },
      { col: 3, row: 0, depth: 0 },
      { col: 4, row: 0, depth: 0 },
      // Akula: cols 0-3, row 1, depth 0
      { col: 0, row: 1, depth: 0 },
      { col: 1, row: 1, depth: 0 },
      { col: 2, row: 1, depth: 0 },
      { col: 3, row: 1, depth: 0 },
      // Seawolf: cols 0-2, row 2, depth 0
      { col: 0, row: 2, depth: 0 },
      { col: 1, row: 2, depth: 0 },
      { col: 2, row: 2, depth: 0 },
      // Virginia: cols 0-2, row 3, depth 0
      { col: 0, row: 3, depth: 0 },
      { col: 1, row: 3, depth: 0 },
      { col: 2, row: 3, depth: 0 },
      // Midget Sub first cell only: col 0, row 4, depth 0
      // (last cell col:1, row:4 reserved for the final UI click)
      { col: 0, row: 4, depth: 0 },
    ];

    // Shoot at all pre-victory cells programmatically.
    // BRAVO fires at unique empty cells using a monotonically increasing index so
    // no cell is targeted twice (which would cause fireTorpedo to return null,
    // break the actionTaken guard, and prevent endTurn from advancing the turn).
    // Safe zone: row 6, col 0-7, depth 2-7 — well away from all ships at depth 0.
    let bravoShotIndex = 0;
    for (const target of p2ShipCells) {
      // ALPHA fires at BRAVO's ship cell
      const alphaResult = game.fireTorpedo(target);
      // Guard: if the shot was blocked (shouldn't happen with unique targets) skip pair
      if (alphaResult === null) continue;
      game.endTurn();

      // BRAVO fires at a unique empty cell (row 6, cycling col and depth)
      const bravoCol = bravoShotIndex % 8;
      const bravoDepth = 2 + Math.floor(bravoShotIndex / 8); // depth 2, then 3, etc.
      game.fireTorpedo({ col: bravoCol, row: 6, depth: bravoDepth });
      game.endTurn();

      bravoShotIndex++;
    }

    // Re-mount the combat screen (ALPHA's turn, one Midget Sub cell remaining)
    router.navigate('combat');

    // Click the last remaining cell of BRAVO's Midget Sub via the UI
    const lastCell = container.querySelector('[data-col="1"][data-row="4"]') as HTMLElement;
    lastCell.click();

    expect(router.getCurrentScreen()).toBe('victory');
  });
});
