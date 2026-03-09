// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountSetupScreen } from '../../src/ui/screens/setup-screen';
import { mountHandoffScreen } from '../../src/ui/screens/handoff-screen';
import { initLogger } from '../../src/observability/logger';
import { FLEET_ROSTER } from '../../src/types/fleet';
import type { Coordinate } from '../../src/types/grid';

// Mock SceneManager to avoid WebGL requirement
let cellClickCb: ((coord: Coordinate) => void) | null = null;
let cellHoverCb: ((coord: Coordinate | null) => void) | null = null;

const mockSceneManager = {
  setViewMode: vi.fn(),
  setDepth: vi.fn(),
  setBoardType: vi.fn(),
  updateGrid: vi.fn(),
  setGhostCells: vi.fn(),
  clearGhostCells: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  onCellClick: vi.fn((cb: (coord: Coordinate) => void) => { cellClickCb = cb; }),
  onCellHover: vi.fn((cb: (coord: Coordinate | null) => void) => { cellHoverCb = cb; }),
  views: {
    getInteractableMeshes: vi.fn(() => new Array(49)),
    getMode: vi.fn(() => 'cube'),
    getDepth: vi.fn(() => 0),
  },
};

vi.mock('../../src/renderer/scene', () => ({
  SceneManager: vi.fn(() => mockSceneManager),
}));

vi.mock('../../src/audio/audio-manager', () => ({
  initAudioContext: vi.fn(),
  isAudioReady: vi.fn(() => false),
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

function resetMocks(): void {
  cellClickCb = null;
  cellHoverCb = null;
  for (const fn of Object.values(mockSceneManager)) {
    if (typeof fn === 'object' && fn !== null) {
      for (const innerFn of Object.values(fn)) {
        if (typeof innerFn === 'function' && 'mockClear' in innerFn) {
          (innerFn as ReturnType<typeof vi.fn>).mockClear();
        }
      }
    }
    if (typeof fn === 'function' && 'mockClear' in fn) {
      (fn as ReturnType<typeof vi.fn>).mockClear();
    }
  }
  mockSceneManager.onCellClick.mockImplementation((cb: (coord: Coordinate) => void) => { cellClickCb = cb; });
  mockSceneManager.onCellHover.mockImplementation((cb: (coord: Coordinate | null) => void) => { cellHoverCb = cb; });
}

describe('Setup Screen', () => {
  let container: HTMLElement;
  let game: GameController;
  let router: ScreenRouter;
  let appContainer: HTMLElement;

  beforeEach(() => {
    resetMocks();
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

  it('renders with fleet roster showing all 7 ships + decoy', () => {
    mountScreen();
    const entries = container.querySelectorAll('.ship-roster__entry');
    expect(entries.length).toBe(8);
  });

  it('renders top bar with ALPHA player badge', () => {
    mountScreen();
    const badge = container.querySelector('.setup-screen__player-badge');
    expect(badge?.textContent).toBe('ALPHA');
  });

  it('renders 3D canvas container', () => {
    mountScreen();
    expect(container.querySelector('.setup-screen__canvas')).not.toBeNull();
  });

  it('initializes SceneManager with own board type', () => {
    mountScreen();
    expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('cube');
    expect(mockSceneManager.setBoardType).toHaveBeenCalledWith('own');
    expect(mockSceneManager.start).toHaveBeenCalled();
  });

  it('renders view mode buttons (CUBE/SLICE/X-RAY)', () => {
    mountScreen();
    const btns = container.querySelectorAll('.setup-screen__mode-btn');
    expect(btns.length).toBe(3);
    expect(Array.from(btns).map(b => b.textContent)).toEqual(['CUBE', 'SLICE', 'X-RAY']);
  });

  it('renders depth buttons (ALL + 1-7)', () => {
    mountScreen();
    const btns = container.querySelectorAll('.setup-screen__depth-btn');
    expect(btns.length).toBe(8);
  });

  it('renders axis selector with 8 buttons', () => {
    mountScreen();
    const btns = container.querySelectorAll('.setup-screen__axis-btn');
    expect(btns.length).toBe(8);
    expect(Array.from(btns).map(b => b.textContent)).toEqual([
      'ROW', 'COL', 'DIAG\u2197', 'DIAG\u2198', 'ROW+D', 'ROW-D', 'COL+D', 'COL-D',
    ]);
  });

  it('clicking view mode button updates active state and calls setViewMode', () => {
    mountScreen();
    const btns = container.querySelectorAll('.setup-screen__mode-btn');
    const sliceBtn = Array.from(btns).find(b => b.textContent === 'SLICE') as HTMLElement;
    sliceBtn.click();
    expect(sliceBtn.classList.contains('setup-screen__mode-btn--active')).toBe(true);
    expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('slice');
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

  it('places a ship via raycaster cell click after selecting from roster', () => {
    mountScreen();

    // Select Midget Sub (size 2)
    const entries = container.querySelectorAll('.ship-roster__entry');
    const midgetEntry = Array.from(entries).find(
      (e) => e.querySelector('.ship-roster__name')?.textContent === 'Midget Sub',
    ) as HTMLElement;
    midgetEntry.click();

    // Simulate raycaster cell click
    cellClickCb!({ col: 0, row: 0, depth: 0 });

    const player = game.getCurrentPlayer();
    expect(player.ships.length).toBe(1);
    expect(player.ships[0]!.id).toBe('midget');
  });

  it('cell hover updates coordinate display', () => {
    mountScreen();
    cellHoverCb!({ col: 2, row: 3, depth: 4 });
    const coord = container.querySelector('.setup-screen__coord-display');
    expect(coord?.textContent).toBe('C-4-D5');
  });

  it('hover with selected ship calls setGhostCells', () => {
    mountScreen();

    // Select Midget Sub
    const entries = container.querySelectorAll('.ship-roster__entry');
    const midgetEntry = Array.from(entries).find(
      (e) => e.querySelector('.ship-roster__name')?.textContent === 'Midget Sub',
    ) as HTMLElement;
    midgetEntry.click();

    mockSceneManager.setGhostCells.mockClear();
    cellHoverCb!({ col: 0, row: 0, depth: 0 });

    expect(mockSceneManager.setGhostCells).toHaveBeenCalled();
    const [coords, valid] = mockSceneManager.setGhostCells.mock.calls[0]!;
    expect(coords.length).toBe(2);
    expect(valid).toBe(true);
  });

  it('full placement flow: place all ships + decoy + confirm', () => {
    mountScreen();

    const placements = [
      { id: 'typhoon', col: 0, row: 0, depth: 0 },
      { id: 'akula', col: 0, row: 1, depth: 0 },
      { id: 'seawolf', col: 0, row: 2, depth: 0 },
      { id: 'virginia', col: 0, row: 3, depth: 0 },
      { id: 'midget', col: 0, row: 4, depth: 0 },
      { id: 'narwhal', col: 0, row: 5, depth: 0 },
      { id: 'piranha', col: 0, row: 6, depth: 0 },
    ];

    for (const p of placements) {
      const entries = container.querySelectorAll('.ship-roster__entry');
      const entry = Array.from(entries).find(
        (e) => e.getAttribute('data-ship-id') === p.id,
      ) as HTMLElement;
      entry.click();

      // Place via raycaster click
      cellClickCb!({ col: p.col, row: p.row, depth: p.depth });
    }

    expect(game.getCurrentPlayer().ships.length).toBe(7);

    const status = container.querySelector('.setup-screen__status');
    expect(status?.textContent).toContain('DECOY');

    // Select decoy from roster, then place via raycaster
    const decoyEntry = container.querySelector('[data-ship-id="decoy"]') as HTMLElement;
    decoyEntry.click();
    cellClickCb!({ col: 6, row: 6, depth: 6 });

    const confirmBtn = container.querySelector('.crt-button:not(.crt-button--danger)') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    expect(status?.textContent).toContain('CONFIRM');

    confirmBtn.click();
    expect(router.getCurrentScreen()).toBe('handoff');
  });

  it('reset button clears all placements', () => {
    mountScreen();

    // Place one ship
    const entries = container.querySelectorAll('.ship-roster__entry');
    const midget = Array.from(entries).find(
      (e) => e.querySelector('.ship-roster__name')?.textContent === 'Midget Sub',
    ) as HTMLElement;
    midget.click();
    cellClickCb!({ col: 0, row: 0, depth: 0 });

    expect(game.getCurrentPlayer().ships.length).toBe(1);

    const resetBtn = container.querySelector('.crt-button--danger') as HTMLElement;
    resetBtn.click();

    expect(game.getCurrentPlayer().ships.length).toBe(0);
  });

  it('R key cycles to next axis during ship placement', () => {
    mountScreen();
    // Default axis is 'col', R should cycle to 'row'
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    const btns = container.querySelectorAll('.setup-screen__axis-btn');
    const activeBtn = Array.from(btns).find(b => b.classList.contains('setup-screen__axis-btn--active'));
    expect(activeBtn?.textContent).toBe('COL'); // 'row' axis → COL label
  });

  it('R key wraps around after last axis', () => {
    mountScreen();
    // Press R 8 times to wrap around back to 'col'
    for (let i = 0; i < 8; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    }
    const btns = container.querySelectorAll('.setup-screen__axis-btn');
    const activeBtn = Array.from(btns).find(b => b.classList.contains('setup-screen__axis-btn--active'));
    expect(activeBtn?.textContent).toBe('ROW'); // 'col' axis → ROW label
  });

  it('R key does nothing during confirm phase', () => {
    mountScreen();

    // Place all ships + decoy to reach confirm phase
    const placements = [
      { id: 'typhoon', col: 0, row: 0, depth: 0 },
      { id: 'akula', col: 0, row: 1, depth: 0 },
      { id: 'seawolf', col: 0, row: 2, depth: 0 },
      { id: 'virginia', col: 0, row: 3, depth: 0 },
      { id: 'midget', col: 0, row: 4, depth: 0 },
      { id: 'narwhal', col: 0, row: 5, depth: 0 },
      { id: 'piranha', col: 0, row: 6, depth: 0 },
    ];
    for (const p of placements) {
      const entries = container.querySelectorAll('.ship-roster__entry');
      const entry = Array.from(entries).find(
        (e) => e.getAttribute('data-ship-id') === p.id,
      ) as HTMLElement;
      entry.click();
      cellClickCb!({ col: p.col, row: p.row, depth: p.depth });
    }
    const decoyEntry = container.querySelector('[data-ship-id="decoy"]') as HTMLElement;
    decoyEntry.click();
    cellClickCb!({ col: 6, row: 6, depth: 6 });

    // Now in confirm phase — R should not change axis
    const btnsBefore = container.querySelectorAll('.setup-screen__axis-btn');
    const activeBefore = Array.from(btnsBefore).find(b => b.classList.contains('setup-screen__axis-btn--active'));
    const labelBefore = activeBefore?.textContent;

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));

    const btnsAfter = container.querySelectorAll('.setup-screen__axis-btn');
    const activeAfter = Array.from(btnsAfter).find(b => b.classList.contains('setup-screen__axis-btn--active'));
    expect(activeAfter?.textContent).toBe(labelBefore);
  });

  it('dispose is called on unmount', () => {
    mountScreen();
    mockSceneManager.dispose.mockClear();
    router.navigate('handoff');
    expect(mockSceneManager.dispose).toHaveBeenCalled();
  });
});
