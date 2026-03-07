import type { Grid } from '../types/grid';
import { CellState, GRID_SIZE } from '../types/grid';
import type { GridCube } from './cube';
import type { MaterialPool } from './materials';
import { getLogger } from '../observability/logger';

export type ViewMode = 'cube' | 'slice' | 'xray';
export type BoardType = 'own' | 'targeting';

const TRANSITION_DURATION = 0.2; // seconds

const OWN_VISIBLE_STATES: Set<CellState> = new Set([
  CellState.Ship,
  CellState.Decoy,
  CellState.Hit,
  CellState.Sunk,
  CellState.DecoyHit,
]);

const TARGETING_VISIBLE_STATES: Set<CellState> = new Set([
  CellState.Hit,
  CellState.Miss,
  CellState.Sunk,
  CellState.DecoyHit,
  CellState.DronePositive,
  CellState.SonarPositive,
]);

export class ViewManager {
  private cube: GridCube;
  private materials: MaterialPool;
  private mode: ViewMode = 'cube';
  private depth: number | null = null;
  private boardType: BoardType = 'targeting';
  private lastGrid: Grid | null = null;

  // Transition state
  private transitionProgress = 1; // 1 = fully arrived
  private transitioning = false;

  constructor(cube: GridCube, materials: MaterialPool) {
    this.cube = cube;
    this.materials = materials;
  }

  getMode(): ViewMode {
    return this.mode;
  }

  getDepth(): number | null {
    return this.depth;
  }

  getBoardType(): BoardType {
    return this.boardType;
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;

    // SLICE requires a depth selection
    if (mode === 'slice' && this.depth === null) {
      this.depth = 0;
    }

    this.startTransition();

    if (this.lastGrid) {
      this.applyView(this.lastGrid);
    }

    try {
      getLogger().emit('view.mode_change', { from: prev, to: mode });
    } catch {
      // Logger may not be initialized
    }
  }

  setDepth(depth: number | null): void {
    if (depth === this.depth) return;
    const prev = this.depth;

    // SLICE requires a depth
    if (this.mode === 'slice' && depth === null) {
      depth = 0;
    }

    this.depth = depth;
    this.startTransition();

    if (this.lastGrid) {
      this.applyView(this.lastGrid);
    }

    try {
      getLogger().emit('view.depth_change', { from: prev, to: depth });
    } catch {
      // Logger may not be initialized
    }
  }

  setBoardType(type: BoardType): void {
    if (type === this.boardType) return;
    this.boardType = type;

    if (this.lastGrid) {
      this.applyView(this.lastGrid);
    }
  }

  applyView(grid: Grid): void {
    this.lastGrid = grid;

    switch (this.mode) {
      case 'cube':
        this.applyCube(grid);
        break;
      case 'slice':
        this.applySlice(grid);
        break;
      case 'xray':
        this.applyXray(grid);
        break;
    }
  }

  private applyCube(grid: Grid): void {
    const allCells = this.cube.getAllCellMeshes();

    if (this.depth === null) {
      // ALL depths visible, normal materials
      for (const cell of allCells) {
        cell.group.visible = true;
        const state = grid[cell.coord.col]?.[cell.coord.row]?.[cell.coord.depth]?.state ?? CellState.Empty;
        const mats = this.materials.getMaterials(state);
        cell.box.material = mats.fill;
        cell.edges.material = mats.edge;
      }
    } else {
      // Selected layer normal, others dimmed
      for (const cell of allCells) {
        cell.group.visible = true;
        const state = grid[cell.coord.col]?.[cell.coord.row]?.[cell.coord.depth]?.state ?? CellState.Empty;
        if (cell.coord.depth === this.depth) {
          const mats = this.materials.getMaterials(state);
          cell.box.material = mats.fill;
          cell.edges.material = mats.edge;
        } else {
          const mats = this.materials.getDimmedMaterials(state);
          cell.box.material = mats.fill;
          cell.edges.material = mats.edge;
        }
      }
    }
  }

  private applySlice(grid: Grid): void {
    const selectedDepth = this.depth ?? 0;

    for (let d = 0; d < GRID_SIZE; d++) {
      const diff = Math.abs(d - selectedDepth);

      if (diff === 0) {
        // Selected layer: visible, normal materials
        this.cube.setLayerVisible(d, true);
        for (const cell of this.cube.getCellMeshesAtDepth(d)) {
          const state = grid[cell.coord.col]?.[cell.coord.row]?.[cell.coord.depth]?.state ?? CellState.Empty;
          const mats = this.materials.getMaterials(state);
          cell.box.material = mats.fill;
          cell.edges.material = mats.edge;
        }
      } else if (diff === 1) {
        // Adjacent layers: visible, ghost materials
        this.cube.setLayerVisible(d, true);
        for (const cell of this.cube.getCellMeshesAtDepth(d)) {
          const state = grid[cell.coord.col]?.[cell.coord.row]?.[cell.coord.depth]?.state ?? CellState.Empty;
          const mats = this.materials.getGhostMaterials(state);
          cell.box.material = mats.fill;
          cell.edges.material = mats.edge;
        }
      } else {
        // Rest: hidden
        this.cube.setLayerVisible(d, false);
      }
    }
  }

  private applyXray(grid: Grid): void {
    const visibleStates = this.boardType === 'own' ? OWN_VISIBLE_STATES : TARGETING_VISIBLE_STATES;
    const allCells = this.cube.getAllCellMeshes();

    for (const cell of allCells) {
      const state = grid[cell.coord.col]?.[cell.coord.row]?.[cell.coord.depth]?.state ?? CellState.Empty;
      const isNonEmpty = visibleStates.has(state);

      if (this.depth !== null && cell.coord.depth !== this.depth) {
        cell.group.visible = false;
      } else {
        cell.group.visible = isNonEmpty;
      }

      if (cell.group.visible) {
        const mats = this.materials.getMaterials(state);
        cell.box.material = mats.fill;
        cell.edges.material = mats.edge;
      }
    }
  }

  getInteractableMeshes(): THREE.Mesh[] {
    if (!this.lastGrid) return this.cube.getInteractableMeshes();

    switch (this.mode) {
      case 'cube':
        if (this.depth === null) {
          return this.cube.getInteractableMeshes();
        }
        return this.cube.getCellMeshesAtDepth(this.depth).map(c => c.box);

      case 'slice':
        return this.cube.getCellMeshesAtDepth(this.depth ?? 0).map(c => c.box);

      case 'xray': {
        const result: THREE.Mesh[] = [];
        const allCells = this.cube.getAllCellMeshes();
        for (const cell of allCells) {
          if (cell.group.visible) {
            result.push(cell.box);
          }
        }
        return result;
      }
    }
  }

  update(dt: number): void {
    if (!this.transitioning) return;

    this.transitionProgress = Math.min(1, this.transitionProgress + dt / TRANSITION_DURATION);

    // Lerp opacity for dimmed/ghost pools during transition
    this.materials.setDimOpacity(this.transitionProgress);
    this.materials.setGhostOpacity(this.transitionProgress);

    if (this.transitionProgress >= 1) {
      this.transitioning = false;
    }
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  private startTransition(): void {
    this.transitionProgress = 0;
    this.transitioning = true;
    // Start at zero opacity and lerp to 1
    this.materials.setDimOpacity(0);
    this.materials.setGhostOpacity(0);
  }

  dispose(): void {
    this.lastGrid = null;
  }
}
