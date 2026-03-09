import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CellState, GRID_SIZE } from '../../src/types/grid';
import type { Grid } from '../../src/types/grid';
import { MaterialPool } from '../../src/renderer/materials';
import { GridCube } from '../../src/renderer/cube';
import { ViewManager } from '../../src/renderer/views';

function createTestGrid(defaultState: CellState = CellState.Empty): Grid {
  const grid: Grid = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    grid[col] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      grid[col]![row] = [];
      for (let depth = 0; depth < GRID_SIZE; depth++) {
        grid[col]![row]![depth] = { state: defaultState, shipId: null };
      }
    }
  }
  return grid;
}

describe('ViewManager', () => {
  let pool: MaterialPool;
  let cube: GridCube;
  let views: ViewManager;

  beforeEach(() => {
    pool = new MaterialPool();
    cube = new GridCube(pool);
    views = new ViewManager(cube, pool);
  });

  afterEach(() => {
    views.dispose();
    cube.dispose();
    pool.dispose();
  });

  it('defaults to cube mode with null depth', () => {
    expect(views.getMode()).toBe('cube');
    expect(views.getDepth()).toBeNull();
  });

  describe('CUBE mode', () => {
    it('ALL depth: all cells visible with normal materials', () => {
      const grid = createTestGrid();
      views.applyView(grid);

      const allCells = cube.getAllCellMeshes();
      for (const cell of allCells) {
        expect(cell.group.visible).toBe(true);
      }
      // Check normal materials on a sample cell
      const sample = cube.getCellMesh({ col: 0, row: 0, depth: 0 })!;
      expect(sample.box.material).toBe(pool.getMaterials(CellState.Empty).fill);
    });

    it('selected depth: selected layer gets normal materials, others dimmed', () => {
      const grid = createTestGrid();
      views.setDepth(3);
      views.applyView(grid);

      const selectedCell = cube.getCellMesh({ col: 0, row: 0, depth: 3 })!;
      expect(selectedCell.box.material).toBe(pool.getMaterials(CellState.Empty).fill);

      const otherCell = cube.getCellMesh({ col: 0, row: 0, depth: 5 })!;
      expect(otherCell.box.material).toBe(pool.getDimmedMaterials(CellState.Empty).fill);
      expect(otherCell.group.visible).toBe(true);
    });
  });

  describe('SLICE mode', () => {
    it('auto-selects depth 0 when depth is null', () => {
      views.setMode('slice');
      expect(views.getDepth()).toBe(0);
    });

    it('selected depth visible + normal, adjacent visible + ghost, rest hidden', () => {
      const grid = createTestGrid();
      views.setMode('slice');
      views.setDepth(3);
      views.applyView(grid);

      // Selected layer (3) is visible with normal materials
      const selected = cube.getCellMesh({ col: 0, row: 0, depth: 3 })!;
      expect(selected.group.visible).toBe(true);
      expect(selected.box.material).toBe(pool.getMaterials(CellState.Empty).fill);

      // Adjacent layers (2, 4) are visible with ghost materials
      const adj = cube.getCellMesh({ col: 0, row: 0, depth: 2 })!;
      expect(adj.group.visible).toBe(true);
      expect(adj.box.material).toBe(pool.getGhostMaterials(CellState.Empty).fill);

      const adj2 = cube.getCellMesh({ col: 0, row: 0, depth: 4 })!;
      expect(adj2.group.visible).toBe(true);
      expect(adj2.box.material).toBe(pool.getGhostMaterials(CellState.Empty).fill);

      // Far layers hidden
      const far = cube.getCellMesh({ col: 0, row: 0, depth: 0 })!;
      expect(far.group.visible).toBe(false);

      const far2 = cube.getCellMesh({ col: 0, row: 0, depth: 6 })!;
      expect(far2.group.visible).toBe(false);
    });

    it('edge depth (0): no adjacent below, adjacent above visible', () => {
      const grid = createTestGrid();
      views.setMode('slice');
      views.setDepth(0);
      views.applyView(grid);

      const selected = cube.getCellMesh({ col: 0, row: 0, depth: 0 })!;
      expect(selected.group.visible).toBe(true);

      const adj = cube.getCellMesh({ col: 0, row: 0, depth: 1 })!;
      expect(adj.group.visible).toBe(true);
      expect(adj.box.material).toBe(pool.getGhostMaterials(CellState.Empty).fill);

      const far = cube.getCellMesh({ col: 0, row: 0, depth: 2 })!;
      expect(far.group.visible).toBe(false);
    });
  });

  describe('X-RAY mode', () => {
    it('hides empty cells, shows non-empty cells (own board)', () => {
      const grid = createTestGrid();
      grid[2]![3]![4]!.state = CellState.Ship;
      grid[5]![5]![5]!.state = CellState.Hit;

      views.setMode('xray');
      views.setBoardType('own');
      views.applyView(grid);

      const empty = cube.getCellMesh({ col: 0, row: 0, depth: 0 })!;
      expect(empty.group.visible).toBe(false);

      const ship = cube.getCellMesh({ col: 2, row: 3, depth: 4 })!;
      expect(ship.group.visible).toBe(true);

      const hit = cube.getCellMesh({ col: 5, row: 5, depth: 5 })!;
      expect(hit.group.visible).toBe(true);
    });

    it('own board shows Ship, Decoy, Hit, Sunk, DecoyHit', () => {
      const grid = createTestGrid();
      grid[0]![0]![0]!.state = CellState.Ship;
      grid[0]![0]![1]!.state = CellState.Decoy;
      grid[0]![0]![2]!.state = CellState.Hit;
      grid[0]![0]![3]!.state = CellState.Sunk;
      grid[0]![0]![4]!.state = CellState.DecoyHit;
      grid[0]![0]![5]!.state = CellState.Miss; // Not visible on own board

      views.setMode('xray');
      views.setBoardType('own');
      views.applyView(grid);

      for (let d = 0; d < 5; d++) {
        expect(cube.getCellMesh({ col: 0, row: 0, depth: d })!.group.visible).toBe(true);
      }
      expect(cube.getCellMesh({ col: 0, row: 0, depth: 5 })!.group.visible).toBe(false);
    });

    it('targeting board shows Hit, Miss, Sunk, DecoyHit, DronePositive, SonarPositive', () => {
      const grid = createTestGrid();
      grid[0]![0]![0]!.state = CellState.Hit;
      grid[0]![0]![1]!.state = CellState.Miss;
      grid[0]![0]![2]!.state = CellState.Sunk;
      grid[0]![0]![3]!.state = CellState.DecoyHit;
      grid[0]![0]![4]!.state = CellState.DronePositive;
      grid[0]![0]![5]!.state = CellState.SonarPositive;
      grid[0]![0]![6]!.state = CellState.Ship; // Not visible on targeting board

      views.setMode('xray');
      views.setBoardType('targeting');
      views.applyView(grid);

      for (let d = 0; d < 6; d++) {
        expect(cube.getCellMesh({ col: 0, row: 0, depth: d })!.group.visible).toBe(true);
      }
      expect(cube.getCellMesh({ col: 0, row: 0, depth: 6 })!.group.visible).toBe(false);
    });

    it('with depth set, only shows non-empty at that depth', () => {
      const grid = createTestGrid();
      grid[0]![0]![2]!.state = CellState.Ship;
      grid[0]![0]![5]!.state = CellState.Ship;

      views.setMode('xray');
      views.setBoardType('own');
      views.setDepth(2);
      views.applyView(grid);

      expect(cube.getCellMesh({ col: 0, row: 0, depth: 2 })!.group.visible).toBe(true);
      expect(cube.getCellMesh({ col: 0, row: 0, depth: 5 })!.group.visible).toBe(false);
    });
  });

  describe('getInteractableMeshes', () => {
    it('CUBE ALL: returns all 343 meshes', () => {
      const grid = createTestGrid();
      views.applyView(grid);
      expect(views.getInteractableMeshes().length).toBe(343);
    });

    it('CUBE depth: returns 49 meshes at selected depth', () => {
      const grid = createTestGrid();
      views.setDepth(3);
      views.applyView(grid);
      expect(views.getInteractableMeshes().length).toBe(49);
    });

    it('SLICE: returns 49 meshes at selected depth', () => {
      const grid = createTestGrid();
      views.setMode('slice');
      views.setDepth(2);
      views.applyView(grid);
      expect(views.getInteractableMeshes().length).toBe(49);
    });

    it('X-RAY: returns only visible meshes', () => {
      const grid = createTestGrid();
      grid[0]![0]![0]!.state = CellState.Ship;
      grid[1]![1]![1]!.state = CellState.Hit;

      views.setMode('xray');
      views.setBoardType('own');
      views.applyView(grid);

      expect(views.getInteractableMeshes().length).toBe(2);
    });
  });

  describe('transitions', () => {
    it('starts transitioning on mode change', () => {
      const grid = createTestGrid();
      views.applyView(grid);
      views.setMode('slice');
      expect(views.isTransitioning()).toBe(true);
    });

    it('update progresses transition', () => {
      const grid = createTestGrid();
      views.applyView(grid);
      views.setMode('slice');
      views.update(0.1); // 100ms of 200ms
      expect(views.isTransitioning()).toBe(true);
      views.update(0.15); // 250ms total, past 200ms
      expect(views.isTransitioning()).toBe(false);
    });

    it('update is a no-op when not transitioning', () => {
      // Should not throw
      views.update(0.016);
      expect(views.isTransitioning()).toBe(false);
    });
  });

  describe('mode/depth change logging', () => {
    it('setMode changes mode state', () => {
      views.setMode('slice');
      expect(views.getMode()).toBe('slice');
      views.setMode('xray');
      expect(views.getMode()).toBe('xray');
      views.setMode('cube');
      expect(views.getMode()).toBe('cube');
    });

    it('setDepth changes depth state', () => {
      views.setDepth(5);
      expect(views.getDepth()).toBe(5);
      views.setDepth(null);
      expect(views.getDepth()).toBeNull();
    });

    it('same mode is a no-op', () => {
      views.setMode('cube');
      // No transition should start since mode didn't change
      expect(views.isTransitioning()).toBe(false);
    });

    it('same depth is a no-op', () => {
      views.setDepth(null);
      expect(views.isTransitioning()).toBe(false);
    });
  });
});
