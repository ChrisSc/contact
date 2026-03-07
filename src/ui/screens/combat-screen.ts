import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { DEPTH_LABELS } from '../../types/grid';
import type { FireResult } from '../../engine/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../../types/game';
import { FLEET_ROSTER } from '../../types/fleet';
import { formatCoordinate } from '../../engine/grid';
import { SceneManager } from '../../renderer/scene';
import type { ViewMode } from '../../renderer/views';
import { getLogger } from '../../observability/logger';

interface CombatUIState {
  currentDepth: number | null;
  boardView: 'targeting' | 'own';
  viewMode: ViewMode;
  hoveredCoord: Coordinate | null;
  lastFireResult: FireResult | null;
  actionTaken: boolean;
  sunkShipIds: string[];
  gameLog: string[];
}

export function mountCombatScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;

  const uiState: CombatUIState = {
    currentDepth: 0,
    boardView: 'targeting',
    viewMode: 'cube',
    hoveredCoord: null,
    lastFireResult: null,
    actionTaken: false,
    sunkShipIds: [],
    gameLog: [],
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
  topRight.textContent = '3D SONAR ARRAY // 8\u00d78\u00d78 // 512 CELLS';
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
    sceneManager.updateGrid(grid);
  }

  function handleBoardToggle(view: 'targeting' | 'own'): void {
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
    if (uiState.boardView !== 'targeting') return;
    handleFire(coord);
  }

  function handleCellHover(coord: Coordinate | null): void {
    uiState.hoveredCoord = coord;
    coordDisplay.textContent = coord ? formatCoordinate(coord) : '\u2014 \u2014';
  }

  function handleFire(coord: Coordinate): void {
    if (uiState.boardView !== 'targeting') return;

    const result = game.fireTorpedo(coord);
    if (result === null) return;

    uiState.actionTaken = true;
    uiState.lastFireResult = result;

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
    } else if (result.result === 'hit') {
      statusText = 'TORPEDO: HIT';
      statusEl.classList.add('combat-screen__status--hit');
    } else {
      statusText = 'TORPEDO: MISS';
      statusEl.classList.add('combat-screen__status--miss');
    }

    statusEl.textContent = statusText;

    const logLine = `T${state.turnCount} ${coordStr}: ${result.result.toUpperCase()}`;
    uiState.gameLog.push(logLine);

    updateSceneGrid();
    refreshBottomBar();
    refreshFleetStatus();
    endTurnBtn.disabled = false;

    if (game.getState().phase === GamePhase.Victory) {
      router.navigate('victory');
    }
  }

  function handleEndTurn(): void {
    game.endTurn();
    router.navigate('handoff');
  }

  function refreshHeader(): void {
    const player = game.getCurrentPlayer();
    const state = game.getState();
    playerBadge.textContent = PLAYER_DESIGNATIONS[player.index];
    turnLabel.textContent = `TURN ${state.turnCount}`;
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
      sceneManager.dispose();
      el.remove();
    },
  };
}
