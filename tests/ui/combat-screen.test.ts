// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameController } from '../../src/engine/game';
import { ScreenRouter } from '../../src/ui/screen-router';
import { mountCombatScreen } from '../../src/ui/screens/combat-screen';
import { mountHandoffScreen } from '../../src/ui/screens/handoff-screen';
import { mountVictoryScreen } from '../../src/ui/screens/victory-screen';
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
  start: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
  playHitAnimation: vi.fn(),
  playSunkAnimation: vi.fn(),
  playMissAnimation: vi.fn(),
  playSonarAnimation: vi.fn(),
  playDroneScanAnimation: vi.fn(),
  playDepthChargeAnimation: vi.fn(),
  setSilentRunningOverlay: vi.fn(),
  clearSilentRunningOverlay: vi.fn(),
  clearGhostCells: vi.fn(),
  setGhostCells: vi.fn(),
  onCellClick: vi.fn((cb: (coord: Coordinate) => void) => { cellClickCb = cb; }),
  onCellHover: vi.fn((cb: (coord: Coordinate | null) => void) => { cellHoverCb = cb; }),
  views: {
    getInteractableMeshes: vi.fn(() => new Array(64)),
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

vi.mock('../../src/audio/abilities', () => ({
  playDepthChargeSound: vi.fn(),
  playSilentRunningActivate: vi.fn(),
  playSilentRunningExpire: vi.fn(),
  playTorpedoFireSound: vi.fn(),
  playTorpedoHitSound: vi.fn(),
  playTorpedoMissSound: vi.fn(),
  playTorpedoSunkSound: vi.fn(),
  playSonarPingSound: vi.fn(),
  playReconDroneSound: vi.fn(),
  playRadarJammerSound: vi.fn(),
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

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

  const appContainer = document.createElement('div');
  appContainer.id = 'app';
  document.body.appendChild(appContainer);
  const game = new GameController('test');
  const router = new ScreenRouter(appContainer, game);
  router.register('combat', mountCombatScreen);
  router.register('handoff', mountHandoffScreen);
  router.register('victory', mountVictoryScreen);
  placeStandardFleet(game);
  game.confirmSetup();
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

  it('renders top bar with player badge and turn', () => {
    const badge = container.querySelector('.combat-screen__player-badge');
    const turn = container.querySelector('.combat-screen__turn-label');
    expect(badge?.textContent).toBe('ALPHA');
    expect(turn?.textContent).toBe('TURN 1');
  });

  it('renders 3D canvas container', () => {
    expect(container.querySelector('.combat-screen__canvas')).not.toBeNull();
  });

  it('initializes SceneManager with correct defaults', () => {
    expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('cube');
    expect(mockSceneManager.setBoardType).toHaveBeenCalledWith('targeting');
    expect(mockSceneManager.start).toHaveBeenCalled();
  });

  it('renders view mode buttons (CUBE/SLICE/X-RAY) on left edge', () => {
    const btns = container.querySelectorAll('.combat-screen__mode-btn');
    expect(btns.length).toBe(3);
    expect(Array.from(btns).map(b => b.textContent)).toEqual(['CUBE', 'SLICE', 'X-RAY']);
  });

  it('renders depth buttons (ALL + 1-8) on right edge', () => {
    const btns = container.querySelectorAll('.combat-screen__depth-btn');
    expect(btns.length).toBe(9);
  });

  it('clicking view mode button updates active state', () => {
    const btns = container.querySelectorAll('.combat-screen__mode-btn');
    const sliceBtn = Array.from(btns).find(b => b.textContent === 'SLICE') as HTMLElement;
    sliceBtn.click();
    expect(sliceBtn.classList.contains('combat-screen__mode-btn--active')).toBe(true);
    expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('slice');
  });

  it('board toggle calls setBoardType', () => {
    const ownBtn = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
    ownBtn.click();
    expect(mockSceneManager.setBoardType).toHaveBeenCalledWith('own');
  });

  it('renders bottom stats bar with DEPTH, VISIBLE, SHOTS, HITS, SUNK, MODE', () => {
    const labels = container.querySelectorAll('.combat-screen__stat-label');
    const texts = Array.from(labels).map(el => el.textContent);
    expect(texts).toContain('DEPTH');
    expect(texts).toContain('VISIBLE');
    expect(texts).toContain('MODE');
  });

  it('renders enemy fleet with health pips', () => {
    const entries = container.querySelectorAll('.combat-screen__fleet-entry');
    expect(entries.length).toBe(5);
    const pips = container.querySelectorAll('.combat-screen__pip');
    expect(pips.length).toBe(17); // 5+4+3+3+2
  });

  it('end turn button is disabled initially', () => {
    const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('cell click fires torpedo and shows status', () => {
    cellClickCb!({ col: 0, row: 0, depth: 0 });
    const status = container.querySelector('.combat-screen__status');
    expect(status?.textContent).toContain('HIT');
  });

  it('cell hover updates coordinate display', () => {
    cellHoverCb!({ col: 2, row: 3, depth: 4 });
    const coord = container.querySelector('.combat-screen__coord-display');
    expect(coord?.textContent).toBe('C-4-D5');
  });

  it('cannot fire on own fleet view', () => {
    const ownBtn = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
    ownBtn.click();
    cellClickCb!({ col: 0, row: 0, depth: 0 });
    const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('end turn navigates to handoff', () => {
    cellClickCb!({ col: 0, row: 0, depth: 0 });
    const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
    btn.click();
    expect(router.getCurrentScreen()).toBe('handoff');
  });

  it('navigates to victory when last ship sunk', () => {
    const cells = [
      {col:0,row:0,depth:0},{col:1,row:0,depth:0},{col:2,row:0,depth:0},{col:3,row:0,depth:0},{col:4,row:0,depth:0},
      {col:0,row:1,depth:0},{col:1,row:1,depth:0},{col:2,row:1,depth:0},{col:3,row:1,depth:0},
      {col:0,row:2,depth:0},{col:1,row:2,depth:0},{col:2,row:2,depth:0},
      {col:0,row:3,depth:0},{col:1,row:3,depth:0},{col:2,row:3,depth:0},
      {col:0,row:4,depth:0},
    ];
    let i = 0;
    for (const target of cells) {
      game.fireTorpedo(target);
      game.endTurn();
      game.fireTorpedo({ col: i % 8, row: 6, depth: 2 + Math.floor(i / 8) });
      game.endTurn();
      i++;
    }
    router.navigate('combat');
    cellClickCb!({ col: 1, row: 4, depth: 0 });
    expect(router.getCurrentScreen()).toBe('victory');
  });

  it('dispose is called on unmount', () => {
    mockSceneManager.dispose.mockClear();
    router.navigate('handoff');
    expect(mockSceneManager.dispose).toHaveBeenCalled();
  });

  it('renders credit display in top bar', () => {
    const credits = container.querySelector('.combat-screen__credits');
    expect(credits).not.toBeNull();
    expect(credits?.textContent).toBe('CR: 5');
  });

  it('renders store button', () => {
    const storeBtn = container.querySelector('.combat-screen__store-btn');
    expect(storeBtn).not.toBeNull();
    expect(storeBtn?.textContent).toBe('STORE');
  });

  it('store button toggles perk store visibility', () => {
    const storeBtn = container.querySelector('.combat-screen__store-btn') as HTMLElement;
    storeBtn.click();
    const store = container.querySelector('.perk-store') as HTMLElement;
    expect(store.style.display).not.toBe('none');
    storeBtn.click();
    expect(store.style.display).toBe('none');
  });

  it('purchasing a perk deducts credits and updates display', () => {
    // Open store
    const storeBtn = container.querySelector('.combat-screen__store-btn') as HTMLElement;
    storeBtn.click();

    // Buy sonar ping (cost 3, starting credits 5)
    const buyBtn = container.querySelector('.perk-store__buy-btn') as HTMLButtonElement;
    buyBtn.click();

    const credits = container.querySelector('.combat-screen__credits');
    expect(credits?.textContent).toBe('CR: 2');
  });

  it('purchased perk appears in inventory tray', () => {
    // Buy sonar ping
    const storeBtn = container.querySelector('.combat-screen__store-btn') as HTMLElement;
    storeBtn.click();
    const buyBtn = container.querySelector('.perk-store__buy-btn') as HTMLButtonElement;
    buyBtn.click();

    const items = container.querySelectorAll('.inventory-tray__item');
    expect(items.length).toBe(1);
  });

  it('selecting sonar ping from inventory enables ping mode', () => {
    // Buy and select sonar ping
    game.purchasePerk('sonar_ping');
    // Need to re-navigate to refresh UI
    router.navigate('handoff');
    router.navigate('combat');
    const cont = document.querySelector('.screen-container')!;

    const item = cont.querySelector('.inventory-tray__item') as HTMLElement;
    if (item) item.click();

    const selectLabel = cont.querySelector('.combat-screen__select-label');
    expect(selectLabel?.textContent).toBe('CLICK CELL TO PING');
  });

  it('ping mode: clicking cell calls useSonarPing and plays animation', () => {
    // Buy sonar ping
    game.purchasePerk('sonar_ping');
    // Navigate to refresh
    router.navigate('handoff');
    router.navigate('combat');
    const cont = document.querySelector('.screen-container')!;

    const item = cont.querySelector('.inventory-tray__item') as HTMLElement;
    if (item) item.click();

    // Trigger cell click for ping
    mockSceneManager.playSonarAnimation.mockClear();
    cellClickCb!({ col: 7, row: 7, depth: 7 });

    expect(mockSceneManager.playSonarAnimation).toHaveBeenCalled();
  });

  it('renders action slots', () => {
    const slots = container.querySelectorAll('.action-slots__slot');
    expect(slots.length).toBe(3);
  });

  it('hit awards credits and updates display', () => {
    cellClickCb!({ col: 0, row: 0, depth: 0 }); // hit
    const credits = container.querySelector('.combat-screen__credits');
    expect(credits?.textContent).toBe('CR: 6'); // 5 + 1
  });
});
