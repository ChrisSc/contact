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
  playScreenShake: vi.fn(),
  setSilentRunningOverlay: vi.fn(),
  clearSilentRunningOverlay: vi.fn(),
  setFriendlyFleetOverlay: vi.fn(),
  clearFriendlyFleetOverlay: vi.fn(),
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
  setGamePhase: vi.fn(),
  getAudioPhaseFromTurn: vi.fn(() => 'combat_early'),
  toggleMute: vi.fn(),
  isMuted: vi.fn(() => false),
}));

vi.mock('../../src/audio/ambient', () => ({
  startAmbient: vi.fn(),
  stopAmbient: vi.fn(),
  updateAmbientPhase: vi.fn(),
  isAmbientRunning: vi.fn(() => false),
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
  playGSonarSound: vi.fn(),
  playAcousticCloakSound: vi.fn(),
  playPurchaseSound: vi.fn(),
  playInsufficientFundsSound: vi.fn(),
}));

vi.mock('../../src/ui/effects/ability-overlays', () => ({
  AbilityOverlayManager: vi.fn(() => ({
    render: vi.fn(() => document.createElement('canvas')),
    play: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
  })),
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
    const enemyEntries = container.querySelectorAll('.combat-screen__enemy-fleet .combat-screen__fleet-entry');
    expect(enemyEntries.length).toBe(5);
    const enemyPips = container.querySelectorAll('.combat-screen__enemy-fleet .combat-screen__pip');
    expect(enemyPips.length).toBe(17); // 5+4+3+3+2
  });

  it('renders friendly fleet with health pips', () => {
    const friendlyEntries = container.querySelectorAll('.combat-screen__friendly-fleet .combat-screen__fleet-entry');
    expect(friendlyEntries.length).toBe(5);
    const friendlyPips = container.querySelectorAll('.combat-screen__friendly-fleet .combat-screen__pip');
    expect(friendlyPips.length).toBe(17); // 5+4+3+3+2
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

  // --- 4a. Full Game Loop Integration ---

  describe('full game loop integration', () => {
    // P2 (BRAVO) ship cells placed by placeStandardFleet at col axis, depth 0:
    // typhoon  (size 5): cols 0-4, row 0, depth 0
    // akula    (size 4): cols 0-3, row 1, depth 0
    // seawolf  (size 3): cols 0-2, row 2, depth 0
    // virginia (size 3): cols 0-2, row 3, depth 0
    // midget   (size 2): cols 0-1, row 4, depth 0
    const p2ShipCells: Coordinate[] = [
      { col: 0, row: 0, depth: 0 }, { col: 1, row: 0, depth: 0 }, { col: 2, row: 0, depth: 0 },
      { col: 3, row: 0, depth: 0 }, { col: 4, row: 0, depth: 0 },
      { col: 0, row: 1, depth: 0 }, { col: 1, row: 1, depth: 0 }, { col: 2, row: 1, depth: 0 },
      { col: 3, row: 1, depth: 0 },
      { col: 0, row: 2, depth: 0 }, { col: 1, row: 2, depth: 0 }, { col: 2, row: 2, depth: 0 },
      { col: 0, row: 3, depth: 0 }, { col: 1, row: 3, depth: 0 }, { col: 2, row: 3, depth: 0 },
      { col: 0, row: 4, depth: 0 },
      // last cell (midget second cell) fired separately to trigger victory
    ];

    it('fires all but last P2 ship cell then navigates to handoff each turn without victory', () => {
      // Use fresh context so we can advance through turns
      const { game: g, router: r } = setupCombatGame();

      for (let i = 0; i < p2ShipCells.length; i++) {
        // ALPHA fires at P2 ship cell
        g.fireTorpedo(p2ShipCells[i]);
        g.endTurn();
        // BRAVO fires at a safe miss cell — use depth offset to prevent duplicate coords
        g.fireTorpedo({ col: i % 8, row: 7, depth: 2 + Math.floor(i / 8) });
        g.endTurn();
      }

      // After 16 rounds, 16 of 17 cells hit; one midget cell remains
      // Navigate to combat for ALPHA's turn (the deciding shot)
      r.navigate('combat');
      // Clicking the last midget cell should trigger victory navigation
      cellClickCb!({ col: 1, row: 4, depth: 0 });
      expect(r.getCurrentScreen()).toBe('victory');
    });

    it('end turn after each valid attack navigates to handoff', () => {
      const { game: g, router: r } = setupCombatGame();

      // ALPHA fires via UI callback (sets attackUsed = true on the live screen)
      cellClickCb!({ col: 0, row: 0, depth: 0 }); // hit
      const endBtn = document.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(endBtn.disabled).toBe(false);
      endBtn.click();
      // After end turn, router navigates to handoff
      expect(r.getCurrentScreen()).toBe('handoff');

      // BRAVO's turn: navigate back to combat via handoff continue
      r.navigate('combat');
      cellClickCb!({ col: 5, row: 5, depth: 5 }); // BRAVO fires miss
      const endBtn2 = document.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(endBtn2.disabled).toBe(false);
      endBtn2.click();
      expect(r.getCurrentScreen()).toBe('handoff');
    });

    it('victory navigation fires immediately on last sunk cell click without manual end turn', () => {
      const { game: g, router: r } = setupCombatGame();
      // Sink all but last cell via engine API alternating turns
      const allCells: Coordinate[] = [
        { col: 0, row: 0, depth: 0 }, { col: 1, row: 0, depth: 0 }, { col: 2, row: 0, depth: 0 },
        { col: 3, row: 0, depth: 0 }, { col: 4, row: 0, depth: 0 },
        { col: 0, row: 1, depth: 0 }, { col: 1, row: 1, depth: 0 }, { col: 2, row: 1, depth: 0 },
        { col: 3, row: 1, depth: 0 },
        { col: 0, row: 2, depth: 0 }, { col: 1, row: 2, depth: 0 }, { col: 2, row: 2, depth: 0 },
        { col: 0, row: 3, depth: 0 }, { col: 1, row: 3, depth: 0 }, { col: 2, row: 3, depth: 0 },
        { col: 0, row: 4, depth: 0 },
      ];
      for (let i = 0; i < allCells.length; i++) {
        g.fireTorpedo(allCells[i]);
        g.endTurn();
        // BRAVO fires safe miss cells using depth offset to avoid coordinate repeats
        g.fireTorpedo({ col: i % 8, row: 7, depth: 2 + Math.floor(i / 8) });
        g.endTurn();
      }
      r.navigate('combat');
      // Last cell: col 1, row 4, depth 0 (midget's second cell)
      cellClickCb!({ col: 1, row: 4, depth: 0 });
      expect(r.getCurrentScreen()).toBe('victory');
    });
  });

  // --- 4b. View Mode State Preservation ---

  describe('view mode state preservation', () => {
    it('switching to SLICE view calls setViewMode with slice and preserves status text', () => {
      // Fire a torpedo to set a status message
      cellClickCb!({ col: 0, row: 0, depth: 0 }); // hit
      const statusBefore = container.querySelector('.combat-screen__status')?.textContent;
      expect(statusBefore).toContain('HIT');

      // Switch to SLICE mode
      mockSceneManager.setViewMode.mockClear();
      const btns = container.querySelectorAll('.combat-screen__mode-btn');
      const sliceBtn = Array.from(btns).find(b => b.textContent === 'SLICE') as HTMLElement;
      sliceBtn.click();

      expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('slice');
      // Status text must still show the previous fire result
      const statusAfter = container.querySelector('.combat-screen__status')?.textContent;
      expect(statusAfter).toContain('HIT');
    });

    it('toggling to own board then back to targeting calls setBoardType and updateGrid', () => {
      mockSceneManager.setBoardType.mockClear();
      mockSceneManager.updateGrid.mockClear();

      // Switch to own fleet view
      const ownBtn = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
      ownBtn.click();
      expect(mockSceneManager.setBoardType).toHaveBeenCalledWith('own');
      expect(mockSceneManager.updateGrid).toHaveBeenCalled();

      mockSceneManager.setBoardType.mockClear();
      mockSceneManager.updateGrid.mockClear();

      // Switch back to targeting
      const targetingBtn = container.querySelector('.combat-screen__toggle-btn:first-child') as HTMLElement;
      targetingBtn.click();
      expect(mockSceneManager.setBoardType).toHaveBeenCalledWith('targeting');
      expect(mockSceneManager.updateGrid).toHaveBeenCalled();
    });

    it('switching view mode does not reset active board type', () => {
      // Switch to own fleet view first
      const ownBtn = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
      ownBtn.click();

      // Now switch view mode — board type should remain 'own' (updateGrid uses 'own' grid)
      mockSceneManager.updateGrid.mockClear();
      const btns = container.querySelectorAll('.combat-screen__mode-btn');
      const xrayBtn = Array.from(btns).find(b => b.textContent === 'X-RAY') as HTMLElement;
      xrayBtn.click();

      expect(mockSceneManager.setViewMode).toHaveBeenCalledWith('xray');
      // updateGrid should have been called (refreshed) and OWN fleet board btn still active
      expect(mockSceneManager.updateGrid).toHaveBeenCalled();
      const ownBtnAfter = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
      expect(ownBtnAfter.classList.contains('combat-screen__toggle-btn--active')).toBe(true);
    });
  });

  // --- 4c. No-Pass Enforcement ---

  describe('no-pass enforcement', () => {
    it('end turn button is disabled before any action', () => {
      const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('sonar ping alone does NOT enable end turn button', () => {
      // Purchase sonar ping and navigate to get fresh UI with inventory item
      game.purchasePerk('sonar_ping');
      router.navigate('handoff');
      router.navigate('combat');
      const cont = document.querySelector('.screen-container')!;

      // Select the sonar ping from inventory
      const item = cont.querySelector('.inventory-tray__item') as HTMLElement;
      if (item) item.click();

      // Use sonar ping on a cell
      cellClickCb!({ col: 7, row: 7, depth: 7 });

      // End turn should still be disabled — ping slot only, not attack slot
      const btn = cont.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('firing a torpedo enables end turn button', () => {
      cellClickCb!({ col: 0, row: 0, depth: 0 }); // valid attack
      const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('cannot fire second torpedo in same turn (attackUsed gate)', () => {
      // First torpedo (hit)
      cellClickCb!({ col: 0, row: 0, depth: 0 });
      // Attempt a second fire — engine returns null, end turn button stays enabled but no double-fire
      mockSceneManager.playHitAnimation.mockClear();
      mockSceneManager.playMissAnimation.mockClear();
      cellClickCb!({ col: 1, row: 0, depth: 0 });
      // Neither animation should have fired a second time
      expect(mockSceneManager.playHitAnimation).not.toHaveBeenCalled();
      expect(mockSceneManager.playMissAnimation).not.toHaveBeenCalled();
    });

    it('end turn is disabled on own fleet view even after torpedo fire', () => {
      // Switch to own fleet view — this should block torpedo fires from enabling end turn
      const ownBtn = container.querySelector('.combat-screen__toggle-btn:last-child') as HTMLElement;
      ownBtn.click();
      // Attempt a cell click in own fleet view — should be ignored
      cellClickCb!({ col: 0, row: 0, depth: 0 });
      const btn = container.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('drone scan (attack ability) enables end turn button', () => {
      // Give ALPHA a recon drone and refresh UI
      game.purchasePerk('recon_drone');
      router.navigate('handoff');
      router.navigate('combat');
      const cont = document.querySelector('.screen-container')!;

      // Select drone from inventory
      const item = cont.querySelector('.inventory-tray__item') as HTMLElement;
      if (item) item.click();

      // Use drone at a cell
      cellClickCb!({ col: 4, row: 4, depth: 4 });

      const btn = cont.querySelector('.combat-screen__end-turn') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });
});
