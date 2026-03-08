import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { CellState, GRID_SIZE } from '../../types/grid';
import type { FleetRosterEntry, PlacementAxis } from '../../types/fleet';
import { FLEET_ROSTER, PLACEMENT_AXES } from '../../types/fleet';
import { calculateShipCells, validatePlacement } from '../../engine/fleet';
import { getCell, formatCoordinate } from '../../engine/grid';
import { ShipRoster, DECOY_ID } from '../components/ship-roster';
import { SceneManager } from '../../renderer/scene';
import type { ViewMode } from '../../renderer/views';
import { PLAYER_DESIGNATIONS } from '../../types/game';

interface SetupUIState {
  selectedShipId: string | null;
  currentAxis: PlacementAxis;
  currentDepth: number | null;
  viewMode: ViewMode;
  hoveredCoord: Coordinate | null;
  placementPhase: 'ships' | 'decoy-pending' | 'decoy' | 'confirm';
}

export function mountSetupScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;
  const player = game.getCurrentPlayer();

  const uiState: SetupUIState = {
    selectedShipId: null,
    currentAxis: 'col',
    currentDepth: 0,
    viewMode: 'cube',
    hoveredCoord: null,
    placementPhase: 'ships',
  };

  // Root — fills viewport, positions everything absolute
  const el = document.createElement('div');
  el.className = 'setup-screen';

  // --- Full-screen 3D canvas ---
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'setup-screen__canvas';
  el.appendChild(canvasContainer);

  // --- Top bar (overlay) ---
  const topBar = document.createElement('div');
  topBar.className = 'setup-screen__top-bar';

  const topLeft = document.createElement('div');
  topLeft.className = 'setup-screen__top-left';

  const playerBadge = document.createElement('span');
  playerBadge.className = 'setup-screen__player-badge';
  playerBadge.textContent = PLAYER_DESIGNATIONS[player.index];
  topLeft.appendChild(playerBadge);

  const titleLabel = document.createElement('span');
  titleLabel.className = 'setup-screen__title-label';
  titleLabel.textContent = 'FLEET DEPLOYMENT';
  topLeft.appendChild(titleLabel);

  topBar.appendChild(topLeft);

  // Coordinate display — large, centered
  const coordDisplay = document.createElement('div');
  coordDisplay.className = 'setup-screen__coord-display';
  coordDisplay.textContent = '\u2014 \u2014';
  topBar.appendChild(coordDisplay);

  const topRight = document.createElement('div');
  topRight.className = 'setup-screen__top-right';
  topRight.textContent = '3D SONAR ARRAY // 8\u00d78\u00d78 // 512 CELLS';
  topBar.appendChild(topRight);

  el.appendChild(topBar);

  // --- Status message (below top bar, centered) ---
  const statusEl = document.createElement('div');
  statusEl.className = 'setup-screen__status';
  el.appendChild(statusEl);

  // --- Axis selector (below status, centered) ---
  const axisBar = document.createElement('div');
  axisBar.className = 'setup-screen__axis-bar';

  const axisLabel = document.createElement('span');
  axisLabel.className = 'setup-screen__axis-label';
  axisLabel.textContent = 'AXIS';
  axisBar.appendChild(axisLabel);

  const axes: { id: PlacementAxis; label: string }[] = [
    { id: 'col', label: 'ROW' },
    { id: 'row', label: 'COL' },
    { id: 'diag+', label: 'DIAG\u2197' },
    { id: 'diag-', label: 'DIAG\u2198' },
    { id: 'col-depth', label: 'ROW+D' },
    { id: 'col-depth-', label: 'ROW-D' },
    { id: 'row-depth', label: 'COL+D' },
    { id: 'row-depth-', label: 'COL-D' },
  ];

  for (const axis of axes) {
    const btn = document.createElement('button');
    btn.className = 'setup-screen__axis-btn';
    if (axis.id === uiState.currentAxis) {
      btn.classList.add('setup-screen__axis-btn--active');
    }
    btn.textContent = axis.label;
    btn.dataset.axis = axis.id;
    btn.addEventListener('click', () => handleAxisChange(axis.id));
    axisBar.appendChild(btn);
  }

  el.appendChild(axisBar);

  // --- View mode selector (left edge overlay) ---
  const viewModes = document.createElement('div');
  viewModes.className = 'setup-screen__view-modes';

  const modes: { id: ViewMode; label: string }[] = [
    { id: 'cube', label: 'CUBE' },
    { id: 'slice', label: 'SLICE' },
    { id: 'xray', label: 'X-RAY' },
  ];

  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.className = 'setup-screen__mode-btn';
    if (mode.id === uiState.viewMode) {
      btn.classList.add('setup-screen__mode-btn--active');
    }
    btn.textContent = mode.label;
    btn.dataset.mode = mode.id;
    btn.addEventListener('click', () => handleViewModeChange(mode.id));
    viewModes.appendChild(btn);
  }

  el.appendChild(viewModes);

  // --- Depth selector (right edge overlay) ---
  const depthPanel = document.createElement('div');
  depthPanel.className = 'setup-screen__depth-panel';

  const allBtn = document.createElement('button');
  allBtn.className = 'setup-screen__depth-btn';
  if (uiState.currentDepth === null) {
    allBtn.classList.add('setup-screen__depth-btn--active');
  }
  allBtn.textContent = 'ALL';
  allBtn.dataset.depth = '-1';
  allBtn.addEventListener('click', () => handleDepthChange(-1));
  depthPanel.appendChild(allBtn);

  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button');
    btn.className = 'setup-screen__depth-btn';
    if (uiState.currentDepth === i) {
      btn.classList.add('setup-screen__depth-btn--active');
    }
    btn.textContent = String(i + 1);
    btn.dataset.depth = String(i);
    btn.addEventListener('click', () => handleDepthChange(i));
    depthPanel.appendChild(btn);
  }

  el.appendChild(depthPanel);

  // --- Ship roster (right side overlay) ---
  const rosterPanel = document.createElement('div');
  rosterPanel.className = 'setup-screen__roster-panel';

  const shipRoster = new ShipRoster({
    onShipSelect(entry: FleetRosterEntry) {
      if (uiState.placementPhase !== 'ships') return;
      uiState.selectedShipId = entry.id;
      shipRoster.setSelected(entry.id);
      updateGhostPreview();
      updateStatus();
    },
    onShipRemove(shipId: string) {
      game.removeShipForCurrentPlayer(shipId);
      if (uiState.selectedShipId === shipId) {
        uiState.selectedShipId = null;
        shipRoster.setSelected(null);
      }
      uiState.placementPhase = 'ships';
      refreshState();
    },
    onDecoySelect() {
      if (uiState.placementPhase !== 'decoy-pending') return;
      uiState.placementPhase = 'decoy';
      uiState.selectedShipId = DECOY_ID;
      shipRoster.setSelected(DECOY_ID);
      updateGhostPreview();
      updateStatus();
    },
  });
  shipRoster.updatePlaced(player.ships);
  rosterPanel.appendChild(shipRoster.render());

  el.appendChild(rosterPanel);

  // --- Footer (bottom overlay) ---
  const footer = document.createElement('div');
  footer.className = 'setup-screen__footer';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'crt-button crt-button--danger';
  resetBtn.textContent = 'RESET ALL';
  resetBtn.addEventListener('click', handleReset);
  footer.appendChild(resetBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'crt-button';
  confirmBtn.textContent = 'CONFIRM DEPLOYMENT';
  confirmBtn.disabled = true;
  confirmBtn.addEventListener('click', handleConfirm);
  footer.appendChild(confirmBtn);

  el.appendChild(footer);

  // --- Controls hint ---
  const hint = document.createElement('div');
  hint.className = 'setup-screen__hint';
  hint.textContent = 'DRAG TO ROTATE \u00b7 SCROLL TO ZOOM \u00b7 CLICK CELL TO PLACE \u00b7 R TO CYCLE AXIS';
  el.appendChild(hint);

  container.appendChild(el);

  // --- Initialize 3D Scene ---
  const sceneManager = new SceneManager({ container: canvasContainer });
  sceneManager.setViewMode(uiState.viewMode);
  sceneManager.setBoardType('own');
  sceneManager.setDepth(uiState.currentDepth);

  sceneManager.onCellClick(handleCellClick);
  sceneManager.onCellHover(handleCellHover);

  updateSceneGrid();
  sceneManager.start();
  updateStatus();

  // --- R key rotation handler ---
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (uiState.placementPhase !== 'ships' && uiState.placementPhase !== 'decoy') return;
    const currentIndex = PLACEMENT_AXES.indexOf(uiState.currentAxis);
    const nextAxis = PLACEMENT_AXES[(currentIndex + 1) % PLACEMENT_AXES.length]!;
    handleAxisChange(nextAxis);
  }
  document.addEventListener('keydown', handleKeyDown);

  // --- Handlers ---

  function handleViewModeChange(mode: ViewMode): void {
    if (mode === uiState.viewMode) return;
    uiState.viewMode = mode;
    sceneManager.setViewMode(mode);

    const btns = viewModes.querySelectorAll('.setup-screen__mode-btn');
    for (const btn of btns) {
      const el = btn as HTMLElement;
      el.classList.toggle('setup-screen__mode-btn--active', el.dataset.mode === mode);
    }

    if (mode === 'slice' && uiState.currentDepth === null) {
      uiState.currentDepth = 0;
      updateDepthButtons();
    }

    updateSceneGrid();
  }

  function handleDepthChange(depth: number): void {
    uiState.currentDepth = depth === -1 ? null : depth;
    sceneManager.setDepth(uiState.currentDepth);
    updateDepthButtons();
    updateSceneGrid();
  }

  function updateDepthButtons(): void {
    const btns = depthPanel.querySelectorAll('.setup-screen__depth-btn');
    for (const btn of btns) {
      const el = btn as HTMLElement;
      const d = Number(el.dataset.depth);
      el.classList.toggle('setup-screen__depth-btn--active',
        (uiState.currentDepth === null && d === -1) ||
        (uiState.currentDepth === d));
    }
  }

  function handleAxisChange(axis: PlacementAxis): void {
    if (axis === uiState.currentAxis) return;
    uiState.currentAxis = axis;

    const btns = axisBar.querySelectorAll('.setup-screen__axis-btn');
    for (const btn of btns) {
      const el = btn as HTMLElement;
      el.classList.toggle('setup-screen__axis-btn--active', el.dataset.axis === axis);
    }

    updateGhostPreview();
  }

  function updateSceneGrid(): void {
    const currentPlayer = game.getCurrentPlayer();
    sceneManager.updateGrid(currentPlayer.ownGrid);
    updateGhostPreview();
  }

  function handleCellClick(coord: Coordinate): void {
    if (uiState.placementPhase === 'ships') {
      handleShipPlacement(coord);
    } else if (uiState.placementPhase === 'decoy') {
      handleDecoyPlacement(coord);
    }
  }

  function handleCellHover(coord: Coordinate | null): void {
    uiState.hoveredCoord = coord;
    coordDisplay.textContent = coord ? formatCoordinate(coord) : '\u2014 \u2014';
    updateGhostPreview();
  }

  function handleShipPlacement(coord: Coordinate): void {
    if (!uiState.selectedShipId) return;
    const entry = FLEET_ROSTER.find((r) => r.id === uiState.selectedShipId);
    if (!entry) return;

    const success = game.placeShipForCurrentPlayer(entry, coord, uiState.currentAxis);
    if (!success) {
      statusEl.textContent = 'INVALID PLACEMENT \u2014 CHECK OVERLAP / BOUNDS';
      return;
    }

    uiState.selectedShipId = null;
    shipRoster.setSelected(null);
    checkShipsComplete();
    refreshState();
  }

  function handleDecoyPlacement(coord: Coordinate): void {
    const currentPlayer = game.getCurrentPlayer();
    const cell = getCell(currentPlayer.ownGrid, coord);
    if (!cell || cell.state !== CellState.Empty) return;

    const success = game.placeDecoyForCurrentPlayer(coord);
    if (!success) return;

    uiState.selectedShipId = null;
    shipRoster.setSelected(null);
    uiState.placementPhase = 'confirm';
    refreshState();
  }

  function checkShipsComplete(): void {
    const currentPlayer = game.getCurrentPlayer();
    const allPlaced = FLEET_ROSTER.every((r) =>
      currentPlayer.ships.some((s) => s.id === r.id),
    );
    if (allPlaced) {
      uiState.placementPhase = 'decoy-pending';
    }
  }

  function handleReset(): void {
    const currentPlayer = game.getCurrentPlayer();
    const shipIds = currentPlayer.ships.map((s) => s.id);
    for (const id of shipIds) {
      game.removeShipForCurrentPlayer(id);
    }
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          const cell = getCell(currentPlayer.ownGrid, { col, row, depth });
          if (cell?.state === CellState.Decoy) {
            game.removeDecoyForCurrentPlayer({ col, row, depth });
          }
        }
      }
    }
    uiState.selectedShipId = null;
    uiState.placementPhase = 'ships';
    shipRoster.setSelected(null);
    refreshState();
  }

  function handleConfirm(): void {
    const success = game.confirmSetup();
    if (success) {
      router.navigate('handoff');
    }
  }

  function updateGhostPreview(): void {
    if (uiState.placementPhase === 'ships' && uiState.selectedShipId && uiState.hoveredCoord) {
      const entry = FLEET_ROSTER.find((r) => r.id === uiState.selectedShipId);
      if (entry) {
        const cells = calculateShipCells(uiState.hoveredCoord, uiState.currentAxis, entry.size);
        const currentPlayer = game.getCurrentPlayer();
        const validation = validatePlacement(currentPlayer.ownGrid, entry, uiState.hoveredCoord, uiState.currentAxis);
        sceneManager.setGhostCells(cells, validation.valid);
        return;
      }
    }

    if (uiState.placementPhase === 'decoy' && uiState.hoveredCoord) {
      const currentPlayer = game.getCurrentPlayer();
      const cell = getCell(currentPlayer.ownGrid, uiState.hoveredCoord);
      const valid = cell?.state === CellState.Empty;
      sceneManager.setGhostCells([uiState.hoveredCoord], valid);
      return;
    }

    sceneManager.clearGhostCells();
  }

  function updateStatus(): void {
    switch (uiState.placementPhase) {
      case 'ships':
        if (uiState.selectedShipId) {
          const entry = FLEET_ROSTER.find((r) => r.id === uiState.selectedShipId);
          statusEl.textContent = `PLACING: ${entry?.name?.toUpperCase() ?? ''} \u2014 CLICK GRID TO DEPLOY`;
        } else {
          statusEl.textContent = 'SELECT A VESSEL FROM THE ROSTER';
        }
        break;
      case 'decoy-pending':
        statusEl.textContent = 'ALL VESSELS PLACED \u2014 SELECT DECOY FROM ROSTER';
        break;
      case 'decoy':
        statusEl.textContent = 'DEPLOY DECOY \u2014 CLICK AN EMPTY CELL';
        break;
      case 'confirm':
        statusEl.textContent = 'FLEET DEPLOYED \u2014 CONFIRM WHEN READY';
        break;
    }
    confirmBtn.disabled = uiState.placementPhase !== 'confirm';
  }

  function refreshState(): void {
    const currentPlayer = game.getCurrentPlayer();
    shipRoster.updatePlaced(currentPlayer.ships);
    const decoyPlaced = uiState.placementPhase === 'confirm';
    const decoyEnabled = uiState.placementPhase === 'decoy-pending' || uiState.placementPhase === 'decoy' || decoyPlaced;
    shipRoster.setDecoyState(decoyEnabled, decoyPlaced);
    updateSceneGrid();
    updateStatus();
  }

  return {
    unmount(): void {
      document.removeEventListener('keydown', handleKeyDown);
      sceneManager.dispose();
      shipRoster.destroy();
      el.remove();
    },
  };
}
