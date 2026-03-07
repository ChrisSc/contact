import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { CellState, GRID_SIZE } from '../../types/grid';
import type { FleetRosterEntry, PlacementAxis } from '../../types/fleet';
import { FLEET_ROSTER } from '../../types/fleet';
import { calculateShipCells, validatePlacement } from '../../engine/fleet';
import { getCell } from '../../engine/grid';
import { SliceGrid } from '../components/slice-grid';
import { DepthSelector } from '../components/depth-selector';
import { AxisSelector } from '../components/axis-selector';
import { ShipRoster } from '../components/ship-roster';
import { CoordinateDisplay } from '../components/coordinate-display';
import { PLAYER_DESIGNATIONS } from '../../types/game';

interface SetupUIState {
  selectedShipId: string | null;
  currentAxis: PlacementAxis;
  currentDepth: number;
  hoveredCoord: Coordinate | null;
  placementPhase: 'ships' | 'decoy' | 'confirm';
}

export function mountSetupScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;
  const player = game.getCurrentPlayer();

  const uiState: SetupUIState = {
    selectedShipId: null,
    currentAxis: 'col',
    currentDepth: 0,
    hoveredCoord: null,
    placementPhase: 'ships',
  };

  // Root element
  const el = document.createElement('div');
  el.className = 'setup-screen';

  // Header
  const header = document.createElement('div');
  header.className = 'setup-screen__header';
  header.innerHTML = `
    <span class="setup-screen__header-title">FLEET DEPLOYMENT</span>
    <span class="setup-screen__header-player">${PLAYER_DESIGNATIONS[player.index]}</span>
  `;
  el.appendChild(header);

  // Grid area
  const gridArea = document.createElement('div');
  gridArea.className = 'setup-screen__grid-area';
  el.appendChild(gridArea);

  // Coordinate display
  const coordDisplay = new CoordinateDisplay();
  gridArea.appendChild(coordDisplay.render());

  // Slice grid
  let sliceGrid = createSliceGrid();
  gridArea.appendChild(sliceGrid.render());

  // Status message
  const statusEl = document.createElement('div');
  statusEl.className = 'setup-screen__status';
  gridArea.appendChild(statusEl);

  // Controls column
  const controls = document.createElement('div');
  controls.className = 'setup-screen__controls';
  el.appendChild(controls);

  // Axis selector
  const axisSelector = new AxisSelector({
    initialAxis: uiState.currentAxis,
    onAxisChange(axis) {
      uiState.currentAxis = axis;
      updateGhostPreview();
    },
  });
  controls.appendChild(axisSelector.render());

  // Depth selector
  const depthSelector = new DepthSelector({
    initialDepth: uiState.currentDepth,
    onDepthChange(depth) {
      uiState.currentDepth = depth === -1 ? 0 : depth;
      rebuildSliceGrid();
    },
  });
  controls.appendChild(depthSelector.render());

  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'setup-screen__sidebar';
  el.appendChild(sidebar);

  // Ship roster
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
      // If we were past ships phase, go back
      uiState.placementPhase = 'ships';
      refreshState();
    },
  });
  shipRoster.updatePlaced(player.ships);
  sidebar.appendChild(shipRoster.render());

  // Footer
  const footer = document.createElement('div');
  footer.className = 'setup-screen__footer';
  el.appendChild(footer);

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'crt-button crt-button--danger';
  resetBtn.textContent = 'RESET ALL';
  resetBtn.addEventListener('click', handleReset);
  footer.appendChild(resetBtn);

  // Confirm button
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'crt-button';
  confirmBtn.textContent = 'CONFIRM DEPLOYMENT';
  confirmBtn.disabled = true;
  confirmBtn.addEventListener('click', handleConfirm);
  footer.appendChild(confirmBtn);

  container.appendChild(el);
  updateStatus();

  // --- Helpers ---

  function createSliceGrid(): SliceGrid {
    return new SliceGrid({
      grid: game.getCurrentPlayer().ownGrid,
      depth: uiState.currentDepth,
      showShips: true,
      onCellClick: handleCellClick,
      onCellHover: handleCellHover,
    });
  }

  function rebuildSliceGrid(): void {
    const oldEl = sliceGrid.render();
    sliceGrid.destroy();
    sliceGrid = createSliceGrid();
    gridArea.insertBefore(sliceGrid.render(), oldEl.nextSibling ?? statusEl);
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
    coordDisplay.update(coord);
    updateGhostPreview();
  }

  function handleShipPlacement(coord: Coordinate): void {
    if (!uiState.selectedShipId) return;
    const entry = FLEET_ROSTER.find((r) => r.id === uiState.selectedShipId);
    if (!entry) return;

    const success = game.placeShipForCurrentPlayer(entry, coord, uiState.currentAxis);
    if (!success) return;

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

    uiState.placementPhase = 'confirm';
    refreshState();
  }

  function checkShipsComplete(): void {
    const currentPlayer = game.getCurrentPlayer();
    const allPlaced = FLEET_ROSTER.every((r) =>
      currentPlayer.ships.some((s) => s.id === r.id),
    );
    if (allPlaced) {
      uiState.placementPhase = 'decoy';
    }
  }

  function handleReset(): void {
    const currentPlayer = game.getCurrentPlayer();
    // Remove all ships
    const shipIds = currentPlayer.ships.map((s) => s.id);
    for (const id of shipIds) {
      game.removeShipForCurrentPlayer(id);
    }
    // Remove decoy — scan grid for decoy cells
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
        sliceGrid.setGhostCells(cells, validation.valid);
        return;
      }
    }

    if (uiState.placementPhase === 'decoy' && uiState.hoveredCoord) {
      const currentPlayer = game.getCurrentPlayer();
      const cell = getCell(currentPlayer.ownGrid, uiState.hoveredCoord);
      const valid = cell?.state === CellState.Empty;
      sliceGrid.setGhostCells([uiState.hoveredCoord], valid);
      return;
    }

    sliceGrid.clearGhostCells();
  }

  function updateStatus(): void {
    switch (uiState.placementPhase) {
      case 'ships':
        if (uiState.selectedShipId) {
          const entry = FLEET_ROSTER.find((r) => r.id === uiState.selectedShipId);
          statusEl.textContent = `PLACING: ${entry?.name?.toUpperCase() ?? ''} — CLICK GRID TO DEPLOY`;
        } else {
          statusEl.textContent = 'SELECT A VESSEL FROM THE ROSTER';
        }
        break;
      case 'decoy':
        statusEl.textContent = 'DEPLOY DECOY — CLICK AN EMPTY CELL';
        break;
      case 'confirm':
        statusEl.textContent = 'FLEET DEPLOYED — CONFIRM WHEN READY';
        break;
    }
    confirmBtn.disabled = uiState.placementPhase !== 'confirm';
  }

  function refreshState(): void {
    const currentPlayer = game.getCurrentPlayer();
    shipRoster.updatePlaced(currentPlayer.ships);
    sliceGrid.update({
      grid: currentPlayer.ownGrid,
      depth: uiState.currentDepth,
    });
    updateGhostPreview();
    updateStatus();
  }

  return {
    unmount(): void {
      sliceGrid.destroy();
      depthSelector.destroy();
      axisSelector.destroy();
      shipRoster.destroy();
      coordDisplay.destroy();
      el.remove();
    },
  };
}
