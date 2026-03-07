import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Coordinate } from '../../types/grid';
import { DEPTH_LABELS } from '../../types/grid';
import type { FireResult } from '../../engine/game';
import { GamePhase, PLAYER_DESIGNATIONS } from '../../types/game';
import { FLEET_ROSTER } from '../../types/fleet';
import { formatCoordinate } from '../../engine/grid';
import { SliceGrid } from '../components/slice-grid';
import { DepthSelector } from '../components/depth-selector';
import { CoordinateDisplay } from '../components/coordinate-display';
import { getLogger } from '../../observability/logger';

interface CombatUIState {
  currentDepth: number;
  boardView: 'targeting' | 'own';
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
    hoveredCoord: null,
    lastFireResult: null,
    actionTaken: false,
    sunkShipIds: [],
    gameLog: [],
  };

  // Root element
  const el = document.createElement('div');
  el.className = 'combat-screen';

  // --- Header (row 1, all cols) ---
  const header = document.createElement('div');
  header.className = 'combat-screen__header';

  const headerPlayer = document.createElement('span');
  headerPlayer.className = 'combat-screen__header-player';
  header.appendChild(headerPlayer);

  const headerTitle = document.createElement('span');
  headerTitle.className = 'combat-screen__header-title';
  headerTitle.textContent = 'COMBAT';
  header.appendChild(headerTitle);

  const headerTurn = document.createElement('span');
  headerTurn.className = 'combat-screen__header-turn';
  header.appendChild(headerTurn);

  el.appendChild(header);

  // --- Grid area (row 2, col 1) ---
  const gridArea = document.createElement('div');
  gridArea.className = 'combat-screen__grid-area';
  el.appendChild(gridArea);

  // Coordinate display
  const coordDisplay = new CoordinateDisplay();
  gridArea.appendChild(coordDisplay.render());

  // Board toggle buttons
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

  gridArea.appendChild(boardToggle);

  // Slice grid
  let sliceGrid = createSliceGrid();
  gridArea.appendChild(sliceGrid.render());

  // Status message
  const statusEl = document.createElement('div');
  statusEl.className = 'combat-screen__status';
  gridArea.appendChild(statusEl);

  // --- Controls (row 2, col 2) ---
  const controls = document.createElement('div');
  controls.className = 'combat-screen__controls';
  el.appendChild(controls);

  const depthSelector = new DepthSelector({
    initialDepth: uiState.currentDepth,
    onDepthChange(depth) {
      uiState.currentDepth = depth === -1 ? 0 : depth;
      rebuildSliceGrid();
      refreshHud();
    },
  });
  controls.appendChild(depthSelector.render());

  // --- Sidebar (row 2, col 3) ---
  const sidebar = document.createElement('div');
  sidebar.className = 'combat-screen__sidebar';
  el.appendChild(sidebar);

  // HUD
  const hud = document.createElement('div');
  hud.className = 'combat-screen__hud';
  sidebar.appendChild(hud);

  // Fleet status
  const fleetStatus = document.createElement('div');
  fleetStatus.className = 'combat-screen__fleet-status';

  const fleetTitle = document.createElement('div');
  fleetTitle.className = 'combat-screen__fleet-title';
  fleetTitle.textContent = 'ENEMY FLEET';
  fleetStatus.appendChild(fleetTitle);

  sidebar.appendChild(fleetStatus);

  // Game log
  const logContainer = document.createElement('div');
  logContainer.className = 'combat-screen__log';

  const logTitle = document.createElement('div');
  logTitle.className = 'combat-screen__log-title';
  logTitle.textContent = 'COMBAT LOG';
  logContainer.appendChild(logTitle);

  const logEntries = document.createElement('div');
  logEntries.className = 'combat-screen__log-entries';
  logContainer.appendChild(logEntries);

  sidebar.appendChild(logContainer);

  // --- Footer (row 3, all cols) ---
  const footer = document.createElement('div');
  footer.className = 'combat-screen__footer';
  el.appendChild(footer);

  const endTurnBtn = document.createElement('button');
  endTurnBtn.className = 'crt-button';
  endTurnBtn.textContent = 'END TURN';
  endTurnBtn.disabled = true;
  endTurnBtn.addEventListener('click', handleEndTurn);
  footer.appendChild(endTurnBtn);

  container.appendChild(el);

  // Initial render
  refreshHeader();
  refreshHud();
  refreshFleetStatus();

  // --- Helpers ---

  function createSliceGrid(): SliceGrid {
    const player = game.getCurrentPlayer();
    const grid = uiState.boardView === 'targeting' ? player.targetingGrid : player.ownGrid;
    const showShips = uiState.boardView === 'own';
    return new SliceGrid({
      grid,
      depth: uiState.currentDepth,
      showShips,
      onCellClick: handleCellClick,
      onCellHover: handleCellHover,
    });
  }

  function rebuildSliceGrid(): void {
    const oldEl = sliceGrid.render();
    sliceGrid.destroy();
    sliceGrid = createSliceGrid();
    gridArea.insertBefore(sliceGrid.render(), oldEl.nextSibling ?? statusEl);
  }

  function handleBoardToggle(view: 'targeting' | 'own'): void {
    if (uiState.boardView === view) return;
    uiState.boardView = view;

    targetingBtn.classList.toggle('combat-screen__toggle-btn--active', view === 'targeting');
    ownFleetBtn.classList.toggle('combat-screen__toggle-btn--active', view === 'own');

    getLogger().emit('view.board_toggle', { view });

    rebuildSliceGrid();
  }

  function handleCellClick(coord: Coordinate): void {
    if (uiState.boardView !== 'targeting') return;
    handleFire(coord);
  }

  function handleCellHover(coord: Coordinate | null): void {
    uiState.hoveredCoord = coord;
    coordDisplay.update(coord);
  }

  function handleFire(coord: Coordinate): void {
    if (uiState.boardView !== 'targeting') return;

    const result = game.fireTorpedo(coord);
    if (result === null) return;

    uiState.actionTaken = true;
    uiState.lastFireResult = result;

    const coordStr = formatCoordinate(coord);
    const state = game.getState();

    // Update status element
    statusEl.className = 'combat-screen__status';
    let statusText: string;

    if (result.result === 'sunk') {
      const entry = FLEET_ROSTER.find((r) => r.id === result.shipId);
      const shipName = entry ? entry.name.toUpperCase() : (result.shipId ?? 'UNKNOWN').toUpperCase();
      statusText = `TORPEDO: SUNK - ${shipName}`;
      statusEl.classList.add('combat-screen__status--sunk');
      if (result.shipId) {
        uiState.sunkShipIds.push(result.shipId);
      }
    } else if (result.result === 'hit') {
      statusText = 'TORPEDO: HIT';
      statusEl.classList.add('combat-screen__status--hit');
    } else {
      statusText = 'TORPEDO: MISS';
      statusEl.classList.add('combat-screen__status--miss');
    }

    statusEl.textContent = statusText;

    // Append to game log
    const logLine = `T${state.turnCount} ${coordStr}: ${result.result.toUpperCase()}`;
    uiState.gameLog.push(logLine);
    appendLogEntry(logLine);

    // Refresh grid and sidebar
    sliceGrid.update({
      grid: game.getCurrentPlayer().targetingGrid,
      depth: uiState.currentDepth,
    });
    refreshHud();
    refreshFleetStatus();

    // Enable end turn
    endTurnBtn.disabled = false;

    // Check for victory
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
    headerPlayer.textContent = PLAYER_DESIGNATIONS[player.index];
    headerTurn.textContent = `TURN ${state.turnCount}`;
  }

  function refreshHud(): void {
    const player = game.getCurrentPlayer();
    const state = game.getState();
    const { shotsFired, shotsHit } = player;
    const hitRate = shotsFired > 0 ? `${(shotsHit / shotsFired * 100).toFixed(0)}%` : '---';

    hud.innerHTML = '';

    const stats: Array<{ label: string; value: string }> = [
      { label: 'DEPTH', value: DEPTH_LABELS[uiState.currentDepth] ?? 'ALL' },
      { label: 'VIEW', value: 'SLICE' },
      { label: 'CELLS', value: '64' },
      { label: 'TURN', value: String(state.turnCount) },
      { label: 'SHOTS', value: String(shotsFired) },
      { label: 'HITS', value: String(shotsHit) },
      { label: 'RATE', value: hitRate },
    ];

    for (const stat of stats) {
      const statEl = document.createElement('div');
      statEl.className = 'combat-screen__stat';

      const labelEl = document.createElement('span');
      labelEl.className = 'combat-screen__stat-label';
      labelEl.textContent = stat.label;

      const valueEl = document.createElement('span');
      valueEl.className = 'combat-screen__stat-value';
      valueEl.textContent = stat.value;

      statEl.appendChild(labelEl);
      statEl.appendChild(valueEl);
      hud.appendChild(statEl);
    }
  }

  function refreshFleetStatus(): void {
    // Remove all fleet entry elements (keep the title)
    const entries = fleetStatus.querySelectorAll('.combat-screen__fleet-entry');
    for (const entry of entries) {
      entry.remove();
    }

    for (const rosterEntry of FLEET_ROSTER) {
      const entryEl = document.createElement('div');
      entryEl.className = 'combat-screen__fleet-entry';

      const isSunk = uiState.sunkShipIds.includes(rosterEntry.id);
      if (isSunk) {
        entryEl.classList.add('combat-screen__fleet-entry--sunk');
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'combat-screen__fleet-entry-name';
      nameEl.textContent = rosterEntry.name.toUpperCase();

      const sizeEl = document.createElement('span');
      sizeEl.className = 'combat-screen__fleet-entry-size';
      sizeEl.textContent = `[${rosterEntry.size}]`;

      const statusEl = document.createElement('span');
      statusEl.className = 'combat-screen__fleet-entry-status';
      statusEl.textContent = isSunk ? 'SUNK' : 'ACTIVE';
      entryEl.appendChild(nameEl);
      entryEl.appendChild(sizeEl);
      entryEl.appendChild(statusEl);
      fleetStatus.appendChild(entryEl);
    }
  }

  function appendLogEntry(text: string): void {
    const entryEl = document.createElement('div');
    entryEl.className = 'combat-screen__log-entry';
    entryEl.textContent = text;
    logEntries.appendChild(entryEl);
    logEntries.scrollTop = logEntries.scrollHeight;
  }

  return {
    unmount(): void {
      sliceGrid.destroy();
      depthSelector.destroy();
      coordDisplay.destroy();
      el.remove();
    },
  };
}
