import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { DEPTH_LABELS } from '../../types/grid';
import { CellState } from '../../types/grid';
import type { FireResult, DepthChargeResult } from '../../engine/game';
import type { TurnSlots } from '../../types/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../../types/game';
import type { PerkId, PerkInstance } from '../../types/abilities';
import { FLEET_ROSTER } from '../../types/fleet';
import { formatCoordinate, getCell } from '../../engine/grid';
import { getInventoryBySlot } from '../../engine/perks';
import { calculateScanArea } from '../../engine/drone';
import { SceneManager } from '../../renderer/scene';
import type { ViewMode } from '../../renderer/views';
import { getLogger } from '../../observability/logger';
import { PerkStore } from '../components/perk-store';
import { InventoryTray } from '../components/inventory-tray';
import { ActionSlots } from '../components/action-slots';
import { initAudioContext } from '../../audio/audio-manager';
import {
  playDepthChargeSound,
  playSilentRunningActivate,
  playTorpedoFireSound,
  playTorpedoHitSound,
  playTorpedoMissSound,
  playTorpedoSunkSound,
  playSonarPingSound,
  playReconDroneSound,
  playRadarJammerSound,
  playGSonarSound,
  playAcousticCloakSound,
} from '../../audio/abilities';

interface CombatUIState {
  currentDepth: number | null;
  boardView: 'targeting' | 'own';
  viewMode: ViewMode;
  hoveredCoord: Coordinate | null;
  lastFireResult: FireResult | null;
  sunkShipIds: string[];
  gameLog: string[];
  storeOpen: boolean;
  pingMode: boolean;
  droneMode: boolean;
  depthChargeMode: boolean;
  silentRunningMode: boolean;
  gSonarMode: boolean;
  turnSlots: TurnSlots;
}

export function mountCombatScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;

  const opponent = game.getOpponent();
  const initialSunkIds = opponent.ships.filter((s) => s.sunk).map((s) => s.id);

  const uiState: CombatUIState = {
    currentDepth: 0,
    boardView: 'targeting',
    viewMode: 'cube',
    hoveredCoord: null,
    lastFireResult: null,
    sunkShipIds: initialSunkIds,
    gameLog: [],
    storeOpen: false,
    pingMode: false,
    droneMode: false,
    depthChargeMode: false,
    silentRunningMode: false,
    gSonarMode: false,
    turnSlots: { pingUsed: false, attackUsed: false, defendUsed: false },
  };

  // Root — fills viewport, positions everything absolute
  const el = document.createElement('div');
  el.className = 'combat-screen';

  // --- Full-screen 3D canvas ---
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'combat-screen__canvas';
  el.appendChild(canvasContainer);

  // --- Top bar (overlay) ---
  const topBar = document.createElement('div');
  topBar.className = 'combat-screen__top-bar';

  const topLeft = document.createElement('div');
  topLeft.className = 'combat-screen__top-left';

  const playerBadge = document.createElement('span');
  playerBadge.className = 'combat-screen__player-badge';
  topLeft.appendChild(playerBadge);

  const turnLabel = document.createElement('span');
  turnLabel.className = 'combat-screen__turn-label';
  topLeft.appendChild(turnLabel);

  topBar.appendChild(topLeft);

  // Coordinate display — large, centered
  const coordDisplay = document.createElement('div');
  coordDisplay.className = 'combat-screen__coord-display';
  coordDisplay.textContent = '\u2014 \u2014';
  topBar.appendChild(coordDisplay);

  const topRight = document.createElement('div');
  topRight.className = 'combat-screen__top-right';

  // Credit display
  const creditsDisplay = document.createElement('span');
  creditsDisplay.className = 'combat-screen__credits';
  topRight.appendChild(creditsDisplay);

  // Store button
  const storeBtn = document.createElement('button');
  storeBtn.className = 'combat-screen__store-btn';
  storeBtn.textContent = 'STORE';
  storeBtn.addEventListener('click', handleStoreToggle);
  topRight.appendChild(storeBtn);

  topBar.appendChild(topRight);

  el.appendChild(topBar);

  // --- Select target label ---
  const selectLabel = document.createElement('div');
  selectLabel.className = 'combat-screen__select-label';
  selectLabel.textContent = 'SELECT TARGET';
  el.appendChild(selectLabel);

  // --- Board toggle (below select label) ---
  const boardToggle = document.createElement('div');
  boardToggle.className = 'combat-screen__board-toggle';

  const targetingBtn = document.createElement('button');
  targetingBtn.className = 'combat-screen__toggle-btn combat-screen__toggle-btn--active';
  targetingBtn.textContent = 'TARGETING';
  targetingBtn.addEventListener('click', () => handleBoardToggle('targeting'));
  boardToggle.appendChild(targetingBtn);

  const ownFleetBtn = document.createElement('button');
  ownFleetBtn.className = 'combat-screen__toggle-btn';
  ownFleetBtn.textContent = 'OWN FLEET';
  ownFleetBtn.addEventListener('click', () => handleBoardToggle('own'));
  boardToggle.appendChild(ownFleetBtn);

  el.appendChild(boardToggle);

  // --- Action Slots (below board toggle) ---
  const actionSlotsComponent = new ActionSlots();
  el.appendChild(actionSlotsComponent.render());

  // --- View mode selector (left edge overlay) ---
  const viewModes = document.createElement('div');
  viewModes.className = 'combat-screen__view-modes';

  const modes: { id: ViewMode; label: string }[] = [
    { id: 'cube', label: 'CUBE' },
    { id: 'slice', label: 'SLICE' },
    { id: 'xray', label: 'X-RAY' },
  ];

  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.className = 'combat-screen__mode-btn';
    if (mode.id === uiState.viewMode) {
      btn.classList.add('combat-screen__mode-btn--active');
    }
    btn.textContent = mode.label;
    btn.dataset.mode = mode.id;
    btn.addEventListener('click', () => handleViewModeChange(mode.id));
    viewModes.appendChild(btn);
  }

  el.appendChild(viewModes);

  // --- Depth selector (right edge overlay) ---
  const depthPanel = document.createElement('div');
  depthPanel.className = 'combat-screen__depth-panel';

  const allBtn = document.createElement('button');
  allBtn.className = 'combat-screen__depth-btn combat-screen__depth-btn--active';
  allBtn.textContent = 'ALL';
  allBtn.dataset.depth = '-1';
  allBtn.addEventListener('click', () => handleDepthChange(-1));
  depthPanel.appendChild(allBtn);

  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button');
    btn.className = 'combat-screen__depth-btn';
    btn.textContent = String(i + 1);
    btn.dataset.depth = String(i);
    btn.addEventListener('click', () => handleDepthChange(i));
    depthPanel.appendChild(btn);
  }

  el.appendChild(depthPanel);

  // --- Status message (center, above bottom bar) ---
  const statusEl = document.createElement('div');
  statusEl.className = 'combat-screen__status';
  el.appendChild(statusEl);

  // --- Perk Store component ---
  const perkStore = new PerkStore({
    onPurchase: handlePurchase,
    onClose: () => {
      uiState.storeOpen = false;
      perkStore.render().style.display = 'none';
      storeBtn.classList.remove('combat-screen__store-btn--active');
    },
  });
  perkStore.render().style.display = 'none';
  el.appendChild(perkStore.render());

  // --- Inventory Tray component ---
  const inventoryTray = new InventoryTray({
    onSelect: handleInventorySelect,
  });
  el.appendChild(inventoryTray.render());

  // --- Enemy fleet (bottom-right overlay) ---
  const fleetPanel = document.createElement('div');
  fleetPanel.className = 'combat-screen__fleet-panel';

  const fleetTitle = document.createElement('div');
  fleetTitle.className = 'combat-screen__fleet-title';
  fleetTitle.textContent = 'ENEMY FLEET';
  fleetPanel.appendChild(fleetTitle);

  el.appendChild(fleetPanel);

  // --- End turn button (bottom-right) ---
  const endTurnBtn = document.createElement('button');
  endTurnBtn.className = 'combat-screen__end-turn crt-button';
  endTurnBtn.textContent = 'END TURN';
  endTurnBtn.disabled = true;
  endTurnBtn.addEventListener('click', handleEndTurn);
  el.appendChild(endTurnBtn);

  // --- Bottom stats bar ---
  const bottomBar = document.createElement('div');
  bottomBar.className = 'combat-screen__bottom-bar';
  el.appendChild(bottomBar);

  // --- Controls hint ---
  const hint = document.createElement('div');
  hint.className = 'combat-screen__hint';
  hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO FIRE';
  el.appendChild(hint);

  container.appendChild(el);

  // --- Initialize 3D Scene ---
  const sceneManager = new SceneManager({ container: canvasContainer });
  sceneManager.setViewMode(uiState.viewMode);
  sceneManager.setBoardType(uiState.boardView);
  sceneManager.setDepth(uiState.currentDepth);

  sceneManager.onCellClick(handleCellClick);
  sceneManager.onCellHover(handleCellHover);

  updateSceneGrid();
  sceneManager.start();

  refreshHeader();
  refreshBottomBar();
  refreshFleetStatus();
  refreshCredits();
  refreshInventory();
  refreshActionSlots();

  // --- Handlers ---

  function handleViewModeChange(mode: ViewMode): void {
    if (mode === uiState.viewMode) return;
    uiState.viewMode = mode;
    sceneManager.setViewMode(mode);

    const btns = viewModes.querySelectorAll('.combat-screen__mode-btn');
    for (const btn of btns) {
      const el = btn as HTMLElement;
      el.classList.toggle('combat-screen__mode-btn--active', el.dataset.mode === mode);
    }

    if (mode === 'slice' && uiState.currentDepth === null) {
      uiState.currentDepth = 0;
      updateDepthButtons();
    }

    refreshBottomBar();
    updateSceneGrid();
  }

  function handleDepthChange(depth: number): void {
    if (uiState.gSonarMode && depth >= 0) {
      handleGSonarScan(depth);
      return;
    }
    if (uiState.gSonarMode && depth === -1) {
      return;
    }
    uiState.currentDepth = depth === -1 ? null : depth;
    sceneManager.setDepth(uiState.currentDepth);
    updateDepthButtons();
    getLogger().emit('view.depth_change', { depth: uiState.currentDepth });
    refreshBottomBar();
    updateSceneGrid();
  }

  function updateDepthButtons(): void {
    const btns = depthPanel.querySelectorAll('.combat-screen__depth-btn');
    for (const btn of btns) {
      const el = btn as HTMLElement;
      const d = Number(el.dataset.depth);
      el.classList.toggle('combat-screen__depth-btn--active',
        (uiState.currentDepth === null && d === -1) ||
        (uiState.currentDepth === d));
    }
  }

  function updateSceneGrid(): void {
    const player = game.getCurrentPlayer();
    const grid = uiState.boardView === 'targeting' ? player.targetingGrid : player.ownGrid;
    sceneManager.clearSilentRunningOverlay();
    sceneManager.updateGrid(grid);

    // Show SR overlay when viewing own grid
    if (uiState.boardView === 'own') {
      const srCoords: Coordinate[] = [];
      for (const entry of player.silentRunningShips) {
        const ship = player.ships.find(s => s.id === entry.shipId);
        if (ship) {
          srCoords.push(...ship.cells);
        }
      }
      if (srCoords.length > 0) {
        sceneManager.setSilentRunningOverlay(srCoords);
      }
    }
  }

  function handleBoardToggle(view: 'targeting' | 'own'): void {
    if (uiState.pingMode) {
      uiState.pingMode = false;
      inventoryTray.clearSelection();
    }
    if (uiState.droneMode) {
      uiState.droneMode = false;
      sceneManager.clearGhostCells();
      inventoryTray.clearSelection();
    }
    if (uiState.depthChargeMode) {
      uiState.depthChargeMode = false;
      sceneManager.clearGhostCells();
      inventoryTray.clearSelection();
    }
    if (uiState.silentRunningMode) {
      uiState.silentRunningMode = false;
      inventoryTray.clearSelection();
    }
    if (uiState.gSonarMode) {
      uiState.gSonarMode = false;
      inventoryTray.clearSelection();
    }
    if (uiState.boardView === view) return;
    uiState.boardView = view;

    targetingBtn.classList.toggle('combat-screen__toggle-btn--active', view === 'targeting');
    ownFleetBtn.classList.toggle('combat-screen__toggle-btn--active', view === 'own');

    sceneManager.setBoardType(view);
    selectLabel.textContent = view === 'targeting' ? 'SELECT TARGET' : 'OWN FLEET VIEW';
    getLogger().emit('view.board_toggle', { view });
    updateSceneGrid();
  }

  function handleCellClick(coord: Coordinate): void {
    if (uiState.silentRunningMode && uiState.boardView === 'own') {
      handleSilentRunningSelect(coord);
      return;
    }
    if (uiState.boardView !== 'targeting') return;
    if (uiState.gSonarMode) return; // G-SONAR uses depth buttons, not cell clicks
    if (uiState.depthChargeMode) {
      handleDepthChargeStrike(coord);
    } else if (uiState.droneMode) {
      handleDroneScan(coord);
    } else if (uiState.pingMode) {
      handlePing(coord);
    } else {
      handleFire(coord);
    }
  }

  function handleCellHover(coord: Coordinate | null): void {
    uiState.hoveredCoord = coord;
    coordDisplay.textContent = coord ? formatCoordinate(coord) : '\u2014 \u2014';

    if (uiState.depthChargeMode || uiState.droneMode) {
      if (coord) {
        const scanCoords = calculateScanArea(coord);
        sceneManager.setGhostCells(scanCoords, true);
      } else {
        sceneManager.clearGhostCells();
      }
    }
  }

  function handleStoreToggle(): void {
    uiState.storeOpen = !uiState.storeOpen;
    perkStore.render().style.display = uiState.storeOpen ? '' : 'none';
    storeBtn.classList.toggle('combat-screen__store-btn--active', uiState.storeOpen);
    if (uiState.storeOpen) {
      perkStore.update(game.getCurrentPlayer().credits);
    }
  }

  function handlePurchase(perkId: PerkId): void {
    const instance = game.purchasePerk(perkId);
    if (!instance) return;
    refreshCredits();
    refreshInventory();
    perkStore.update(game.getCurrentPlayer().credits);
    refreshActionSlots();
  }

  function handleInventorySelect(instance: PerkInstance): void {
    // Cancel any active mode when selecting a new item
    if (uiState.pingMode) {
      uiState.pingMode = false;
      sceneManager.clearGhostCells();
    }
    if (uiState.droneMode) {
      uiState.droneMode = false;
      sceneManager.clearGhostCells();
    }
    if (uiState.depthChargeMode) {
      uiState.depthChargeMode = false;
      sceneManager.clearGhostCells();
    }
    if (uiState.silentRunningMode) {
      uiState.silentRunningMode = false;
    }
    if (uiState.gSonarMode) {
      uiState.gSonarMode = false;
    }

    if (instance.perkId === 'sonar_ping') {
      uiState.pingMode = true;
      selectLabel.textContent = 'CLICK CELL TO PING';
      hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO PING';
    } else if (instance.perkId === 'recon_drone') {
      uiState.droneMode = true;
      selectLabel.textContent = 'SELECT SCAN CENTER';
      hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK TO SCAN 3x3x3';
    } else if (instance.perkId === 'depth_charge') {
      uiState.depthChargeMode = true;
      selectLabel.textContent = 'SELECT STRIKE CENTER';
      hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK TO STRIKE 3x3x3';
    } else if (instance.perkId === 'silent_running') {
      // Switch to own grid view directly (bypass handleBoardToggle to avoid mode cancellation)
      uiState.boardView = 'own';
      targetingBtn.classList.remove('combat-screen__toggle-btn--active');
      ownFleetBtn.classList.add('combat-screen__toggle-btn--active');
      sceneManager.setBoardType('own');
      updateSceneGrid();
      uiState.silentRunningMode = true;
      selectLabel.textContent = 'SELECT SHIP TO CLOAK';
      hint.textContent = 'CLICK ON YOUR SHIP TO ACTIVATE SILENT RUNNING';
    } else if (instance.perkId === 'radar_jammer') {
      const deployed = game.useRadarJammer();
      if (deployed) {
        playRadarJammerSound();
        statusEl.className = 'combat-screen__status';
        statusEl.textContent = 'RADAR JAMMER DEPLOYED';
        statusEl.classList.add('combat-screen__status--sonar-negative');
        inventoryTray.clearSelection();
        refreshInventory();
        refreshActionSlots();
        uiState.turnSlots = game.getTurnSlots();
      }
    } else if (instance.perkId === 'g_sonar') {
      uiState.gSonarMode = true;
      selectLabel.textContent = 'SELECT DEPTH LAYER';
      hint.textContent = 'CLICK D1-D8 TO SCAN ENTIRE DEPTH LAYER';
    } else if (instance.perkId === 'acoustic_cloak') {
      const deployed = game.useAcousticCloak();
      if (deployed) {
        playAcousticCloakSound();
        statusEl.className = 'combat-screen__status';
        statusEl.textContent = 'ACOUSTIC CLOAK: ALL SHIPS MASKED (2 TURNS)';
        statusEl.classList.add('combat-screen__status--sonar-negative');
        inventoryTray.clearSelection();
        refreshInventory();
        refreshActionSlots();
        uiState.turnSlots = game.getTurnSlots();
      }
    }
  }

  function handlePing(coord: Coordinate): void {
    initAudioContext();
    const result = game.useSonarPing(coord);
    if (!result) return;

    uiState.pingMode = false;

    playSonarPingSound();

    // Play sonar animation
    sceneManager.playSonarAnimation(coord, result.displayedResult);

    // Update status
    statusEl.className = 'combat-screen__status';
    if (result.displayedResult) {
      statusEl.textContent = 'SONAR: CONTACT';
      statusEl.classList.add('combat-screen__status--sonar-positive');
    } else {
      statusEl.textContent = 'SONAR: NEGATIVE';
      statusEl.classList.add('combat-screen__status--sonar-negative');
    }

    // Refresh UI
    selectLabel.textContent = 'SELECT TARGET';
    hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO FIRE';
    inventoryTray.clearSelection();
    updateSceneGrid();
    refreshInventory();
    refreshActionSlots();
    uiState.turnSlots = game.getTurnSlots();
  }

  function handleDroneScan(coord: Coordinate): void {
    initAudioContext();
    const result = game.useReconDrone(coord);
    if (!result) return;

    // Reset drone mode
    uiState.droneMode = false;
    sceneManager.clearGhostCells();

    playReconDroneSound();

    // Update scene grid first so materials are set
    updateSceneGrid();

    // Only animate and count cells actually written to the targeting grid
    // (skip cells that already had Hit/Miss/Sunk — animating those would
    // corrupt their visual materials)
    const writtenCells = result.cells.filter(c => c.written);

    // Play drone scan animation
    sceneManager.playDroneScanAnimation(writtenCells);

    // Status message — count displayed contacts among written cells only
    const contacts = writtenCells.filter(c => c.displayedResult).length;
    statusEl.className = 'combat-screen__status';
    if (contacts > 0) {
      statusEl.textContent = `DRONE SCAN: ${contacts} CONTACT${contacts !== 1 ? 'S' : ''}`;
      statusEl.classList.add('combat-screen__status--sonar-positive');
    } else {
      statusEl.textContent = 'DRONE SCAN: NO CONTACTS';
      statusEl.classList.add('combat-screen__status--sonar-negative');
    }

    // Refresh UI
    selectLabel.textContent = 'SELECT TARGET';
    hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO FIRE';
    inventoryTray.clearSelection();
    refreshInventory();
    refreshActionSlots();
    uiState.turnSlots = game.getTurnSlots();

    // Enable end turn (attack slot used)
    endTurnBtn.disabled = false;
  }

  function handleGSonarScan(depth: number): void {
    initAudioContext();
    const result = game.useGSonar(depth);
    if (!result) return;

    uiState.gSonarMode = false;

    playGSonarSound();

    // Update scene grid first so materials are set
    updateSceneGrid();

    // Only animate cells actually written to the targeting grid
    const writtenCells = result.cells.filter(c => c.written);

    // Play G-SONAR scan animation
    sceneManager.playGSonarScanAnimation(writtenCells);

    // Status message
    const contacts = writtenCells.filter(c => c.displayedResult).length;
    statusEl.className = 'combat-screen__status';
    if (result.cloaked) {
      statusEl.textContent = `G-SONAR: LAYER D${depth + 1} SCAN JAMMED`;
      statusEl.classList.add('combat-screen__status--sonar-negative');
    } else if (contacts > 0) {
      statusEl.textContent = `G-SONAR: ${contacts} CONTACT${contacts !== 1 ? 'S' : ''} ON LAYER D${depth + 1}`;
      statusEl.classList.add('combat-screen__status--sonar-positive');
    } else {
      statusEl.textContent = `G-SONAR: LAYER D${depth + 1} CLEAR`;
      statusEl.classList.add('combat-screen__status--sonar-negative');
    }

    // Refresh UI
    selectLabel.textContent = 'SELECT TARGET';
    hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO FIRE';
    inventoryTray.clearSelection();
    refreshInventory();
    refreshActionSlots();
    uiState.turnSlots = game.getTurnSlots();

    // Enable end turn (attack slot used)
    endTurnBtn.disabled = false;
  }

  function handleFire(coord: Coordinate): void {
    initAudioContext();
    if (uiState.boardView !== 'targeting') return;

    const result = game.fireTorpedo(coord);
    if (result === null) return;

    playTorpedoFireSound();

    uiState.lastFireResult = result;
    uiState.turnSlots = game.getTurnSlots();

    const coordStr = formatCoordinate(coord);
    const state = game.getState();

    statusEl.className = 'combat-screen__status';
    let statusText: string;

    if (result.result === 'sunk') {
      const entry = FLEET_ROSTER.find((r) => r.id === result.shipId);
      const shipName = entry ? entry.name.toUpperCase() : (result.shipId ?? 'UNKNOWN').toUpperCase();
      statusText = `TORPEDO: SUNK - ${shipName}`;
      statusEl.classList.add('combat-screen__status--sunk');
      if (result.shipId) uiState.sunkShipIds.push(result.shipId);
      playTorpedoSunkSound();
    } else if (result.result === 'hit') {
      statusText = 'TORPEDO: HIT';
      statusEl.classList.add('combat-screen__status--hit');
      playTorpedoHitSound();
    } else {
      statusText = 'TORPEDO: MISS';
      statusEl.classList.add('combat-screen__status--miss');
      playTorpedoMissSound();
    }

    statusEl.textContent = statusText;

    const logLine = `T${state.turnCount} ${coordStr}: ${result.result.toUpperCase()}`;
    uiState.gameLog.push(logLine);

    updateSceneGrid();

    if (result.result === 'sunk' && result.shipId) {
      const opponent = game.getOpponent();
      const sunkShip = opponent.ships.find((s) => s.id === result.shipId);
      if (sunkShip && sunkShip.cells.length > 0) {
        sceneManager.playSunkAnimation(sunkShip.cells);
      }
    } else if (result.result === 'hit') {
      sceneManager.playHitAnimation(coord);
    } else {
      sceneManager.playMissAnimation(coord);
    }

    refreshBottomBar();
    refreshFleetStatus();
    refreshCredits();
    refreshActionSlots();
    endTurnBtn.disabled = false;

    if (game.getState().phase === GamePhase.Victory) {
      router.navigate('victory');
    }
  }

  function handleDepthChargeStrike(coord: Coordinate): void {
    initAudioContext();
    const result: DepthChargeResult | null = game.useDepthCharge(coord);
    if (!result) return;

    uiState.depthChargeMode = false;
    sceneManager.clearGhostCells();

    // Update scene grid
    updateSceneGrid();

    // Map results for animation (hit = true for 'hit' and 'sunk' results)
    const animResults = result.cellResults
      .filter(r => r.result !== 'already_resolved')
      .map(r => ({
        coord: r.coord,
        hit: r.result === 'hit' || r.result === 'sunk',
      }));

    sceneManager.playDepthChargeAnimation(coord, animResults);
    playDepthChargeSound();

    // Status message
    const hits = result.cellResults.filter(r => r.result === 'hit' || r.result === 'sunk').length;
    const sinks = result.shipsSunk.length;
    statusEl.className = 'combat-screen__status';

    if (sinks > 0) {
      statusEl.textContent = `DEPTH CHARGE: ${hits} HIT${hits !== 1 ? 'S' : ''}, ${sinks} SUNK`;
      statusEl.classList.add('combat-screen__status--sunk');
      for (const shipId of result.shipsSunk) {
        if (!uiState.sunkShipIds.includes(shipId)) {
          uiState.sunkShipIds.push(shipId);
        }
      }
    } else if (hits > 0) {
      statusEl.textContent = `DEPTH CHARGE: ${hits} HIT${hits !== 1 ? 'S' : ''}`;
      statusEl.classList.add('combat-screen__status--hit');
    } else {
      statusEl.textContent = 'DEPTH CHARGE: NO HITS';
      statusEl.classList.add('combat-screen__status--miss');
    }

    // Refresh
    selectLabel.textContent = 'SELECT TARGET';
    hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO FIRE';
    inventoryTray.clearSelection();
    refreshInventory();
    refreshActionSlots();
    refreshFleetStatus();
    refreshCredits();
    refreshBottomBar();
    uiState.turnSlots = game.getTurnSlots();
    endTurnBtn.disabled = false;

    if (game.getState().phase === GamePhase.Victory) {
      router.navigate('victory');
    }
  }

  function handleSilentRunningSelect(coord: Coordinate): void {
    initAudioContext();
    // Find shipId at this coordinate on own grid
    const player = game.getCurrentPlayer();
    const cell = getCell(player.ownGrid, coord);
    if (!cell || cell.state !== CellState.Ship || !cell.shipId) return;

    const success = game.useSilentRunning(cell.shipId);
    if (!success) return;

    playSilentRunningActivate();

    // Find ship name for status
    const ship = player.ships.find(s => s.id === cell.shipId);
    const shipName = ship ? ship.name.toUpperCase() : (cell.shipId ?? 'UNKNOWN').toUpperCase();

    statusEl.className = 'combat-screen__status';
    statusEl.textContent = `SILENT RUNNING: ${shipName} CLOAKED (2 TURNS)`;
    statusEl.classList.add('combat-screen__status--sonar-negative');

    uiState.silentRunningMode = false;

    // Switch back to targeting grid
    handleBoardToggle('targeting');

    // Refresh UI
    inventoryTray.clearSelection();
    refreshInventory();
    refreshActionSlots();
    uiState.turnSlots = game.getTurnSlots();
  }

  function handleEndTurn(): void {
    initAudioContext();
    game.endTurn();
    router.navigate('handoff');
  }

  function refreshHeader(): void {
    const player = game.getCurrentPlayer();
    const state = game.getState();
    playerBadge.textContent = PLAYER_DESIGNATIONS[player.index];
    turnLabel.textContent = `TURN ${state.turnCount}`;
  }

  function refreshCredits(): void {
    const player = game.getCurrentPlayer();
    creditsDisplay.textContent = `CR: ${player.credits}`;
  }

  function refreshInventory(): void {
    const player = game.getCurrentPlayer();
    // Hide radar_jammer instances when ability is active (deployed but not yet triggered)
    const visible = player.inventory.filter(
      p => !(p.perkId === 'radar_jammer' && player.abilities.radar_jammer.active),
    );
    inventoryTray.update(visible);
  }

  function refreshActionSlots(): void {
    const player = game.getCurrentPlayer();
    const slots = game.getTurnSlots();
    actionSlotsComponent.update(slots, {
      ping: getInventoryBySlot(player.inventory, 'ping').length > 0,
      attack: true, // Attack (torpedo) is always available
      defend: getInventoryBySlot(player.inventory, 'defend').length > 0,
    });
  }

  function refreshBottomBar(): void {
    const player = game.getCurrentPlayer();
    const { shotsFired, shotsHit } = player;
    const meshCount = sceneManager.views.getInteractableMeshes().length;
    const depthLabel = uiState.currentDepth !== null
      ? (DEPTH_LABELS[uiState.currentDepth] ?? 'ALL')
      : 'ALL';

    bottomBar.innerHTML = '';

    const stats: Array<{ label: string; value: string }> = [
      { label: 'DEPTH', value: depthLabel },
      { label: 'VISIBLE', value: String(meshCount) },
      { label: 'SHOTS', value: String(shotsFired) },
      { label: 'HITS', value: String(shotsHit) },
      { label: 'SUNK', value: `${uiState.sunkShipIds.length}/5` },
      { label: 'MODE', value: uiState.viewMode.toUpperCase() },
    ];

    for (const stat of stats) {
      const group = document.createElement('div');
      group.className = 'combat-screen__stat';

      const labelEl = document.createElement('span');
      labelEl.className = 'combat-screen__stat-label';
      labelEl.textContent = stat.label;

      const valueEl = document.createElement('span');
      valueEl.className = 'combat-screen__stat-value';
      valueEl.textContent = stat.value;

      group.appendChild(labelEl);
      group.appendChild(valueEl);
      bottomBar.appendChild(group);
    }
  }

  function refreshFleetStatus(): void {
    const entries = fleetPanel.querySelectorAll('.combat-screen__fleet-entry');
    for (const entry of entries) entry.remove();

    for (const rosterEntry of FLEET_ROSTER) {
      const entryEl = document.createElement('div');
      entryEl.className = 'combat-screen__fleet-entry';

      const isSunk = uiState.sunkShipIds.includes(rosterEntry.id);
      if (isSunk) entryEl.classList.add('combat-screen__fleet-entry--sunk');

      const nameEl = document.createElement('span');
      nameEl.textContent = rosterEntry.name.toUpperCase();

      // Health pips
      const pips = document.createElement('span');
      pips.className = 'combat-screen__fleet-pips';
      for (let i = 0; i < rosterEntry.size; i++) {
        const pip = document.createElement('span');
        pip.className = isSunk ? 'combat-screen__pip combat-screen__pip--sunk' : 'combat-screen__pip';
        pips.appendChild(pip);
      }

      entryEl.appendChild(nameEl);
      entryEl.appendChild(pips);
      fleetPanel.appendChild(entryEl);
    }
  }

  return {
    unmount(): void {
      perkStore.destroy();
      inventoryTray.destroy();
      actionSlotsComponent.destroy();
      sceneManager.dispose();
      el.remove();
    },
  };
}
