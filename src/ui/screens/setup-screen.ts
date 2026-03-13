import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { CellState, GRID_SIZE } from '../../types/grid';
import type { FleetRosterEntry, PlacementAxis } from '../../types/fleet';
import { FLEET_ROSTER, PLACEMENT_AXES } from '../../types/fleet';
import { calculateShipCells, validatePlacement } from '../../engine/fleet';
import { getCell, formatCoordinate } from '../../engine/grid';
import { ShipRoster, DECOY_ID } from '../components/ship-roster';
import { ToolPalette } from '../components/tool-palette';
import { SceneManager } from '../../renderer/scene';
import type { ViewMode } from '../../renderer/views';
import { PLAYER_DESIGNATIONS } from '../../types/game';
import { placeFleetRandomly } from '../../engine/ai/ai-placement';

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
  topRight.textContent = `3D SONAR ARRAY // ${GRID_SIZE}\u00d7${GRID_SIZE}\u00d7${GRID_SIZE} // ${GRID_SIZE ** 3} CELLS`;
  topBar.appendChild(topRight);

  el.appendChild(topBar);

  // --- Status message (below top bar, centered) ---
  const statusEl = document.createElement('div');
  statusEl.className = 'setup-screen__status';
  el.appendChild(statusEl);

  // --- Tool palette (view modes, depth, axis) ---
  const toolPalette = new ToolPalette({
    showAxis: true,
    initialViewMode: uiState.viewMode,
    initialDepth: uiState.currentDepth,
    initialAxis: uiState.currentAxis,
    onViewModeChange: handleViewModeChange,
    onDepthChange: handleDepthChange,
    onAxisChange: handleAxisChange,
  });
  el.appendChild(toolPalette.getElement());

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

  const autoDeployBtn = document.createElement('button');
  autoDeployBtn.className = 'setup-screen__auto-deploy';
  autoDeployBtn.textContent = 'AUTO DEPLOY';
  autoDeployBtn.addEventListener('click', handleAutoDeploy);
  rosterPanel.appendChild(autoDeployBtn);

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
    toolPalette.setActiveViewMode(mode);

    if (mode === 'slice' && uiState.currentDepth === null) {
      uiState.currentDepth = 0;
      toolPalette.setActiveDepth(0);
    }

    updateSceneGrid();
  }

  function handleDepthChange(depth: number): void {
    uiState.currentDepth = depth === -1 ? null : depth;
    sceneManager.setDepth(uiState.currentDepth);
    toolPalette.setActiveDepth(uiState.currentDepth);
    updateSceneGrid();
  }

  function handleAxisChange(axis: PlacementAxis): void {
    if (axis === uiState.currentAxis) return;
    uiState.currentAxis = axis;
    toolPalette.setActiveAxis(axis);
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

  function handleAutoDeploy(): void {
    // Reset any existing placements
    handleReset();

    // Try random placement for each ship
    const axisOptions: PlacementAxis[] = [...PLACEMENT_AXES];
    for (const entry of FLEET_ROSTER) {
      let placed = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const origin: Coordinate = {
          col: Math.floor(Math.random() * GRID_SIZE),
          row: Math.floor(Math.random() * GRID_SIZE),
          depth: Math.floor(Math.random() * GRID_SIZE),
        };
        const axis = axisOptions[Math.floor(Math.random() * axisOptions.length)]!;
        const success = game.placeShipForCurrentPlayer(entry, origin, axis);
        if (success) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Bail — shouldn't happen with 343 cells and 22 ship cells
        handleReset();
        statusEl.textContent = 'AUTO DEPLOY FAILED \u2014 TRY AGAIN';
        return;
      }
    }

    // Place decoy in a random empty cell
    for (let attempt = 0; attempt < 200; attempt++) {
      const coord: Coordinate = {
        col: Math.floor(Math.random() * GRID_SIZE),
        row: Math.floor(Math.random() * GRID_SIZE),
        depth: Math.floor(Math.random() * GRID_SIZE),
      };
      if (game.placeDecoyForCurrentPlayer(coord)) break;
    }

    uiState.selectedShipId = null;
    uiState.placementPhase = 'confirm';
    shipRoster.setSelected(null);
    refreshState();
  }

  function handleConfirm(): void {
    const success = game.confirmSetup();
    if (success) {
      if (context.aiMode) {
        // Auto-place AI fleet and skip P2 setup entirely
        placeFleetRandomly(game);
        game.confirmSetup();
        router.navigate('combat');
      } else {
        router.navigate('handoff');
      }
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
      toolPalette.destroy();
      el.remove();
    },
  };
}
