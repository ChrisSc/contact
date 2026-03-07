import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CellState, GRID_SIZE } from '../../src/types/grid';
import type { Coordinate, Grid, Cell } from '../../src/types/grid';
import { MaterialPool } from '../../src/renderer/materials';
import { GridCube, coordToPosition, GRID_OFFSET } from '../../src/renderer/cube';

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

describe('coordToPosition', () => {
  it('maps (0,0,0) to (-3.5,-3.5,-3.5)', () => {
    const pos = coordToPosition(0, 0, 0);
    expect(pos.x).toBeCloseTo(-GRID_OFFSET);
    expect(pos.y).toBeCloseTo(-GRID_OFFSET);
    expect(pos.z).toBeCloseTo(-GRID_OFFSET);
  });

  it('maps (7,7,7) to (3.5,3.5,3.5)', () => {
    const pos = coordToPosition(7, 7, 7);
    expect(pos.x).toBeCloseTo(GRID_OFFSET);
    expect(pos.y).toBeCloseTo(GRID_OFFSET);
    expect(pos.z).toBeCloseTo(GRID_OFFSET);
  });

  it('maps (4,2,6) correctly', () => {
    const pos = coordToPosition(4, 2, 6);
    expect(pos.x).toBeCloseTo(4 - GRID_OFFSET);
    expect(pos.y).toBeCloseTo(2 - GRID_OFFSET);
    expect(pos.z).toBeCloseTo(6 - GRID_OFFSET);
  });
});

describe('GridCube', () => {
  let pool: MaterialPool;
  let cube: GridCube;

  beforeEach(() => {
    pool = new MaterialPool();
    cube = new GridCube(pool);
  });

  afterEach(() => {
    cube.dispose();
    pool.dispose();
  });

  it('creates 512 cell meshes', () => {
    expect(cube.getInteractableMeshes().length).toBe(512);
  });

  it('root group contains 512 child groups', () => {
    expect(cube.root.children.length).toBe(512);
  });

  it('getCellMesh returns a CellMesh for valid coordinates', () => {
    const cell = cube.getCellMesh({ col: 0, row: 0, depth: 0 });
    expect(cell).toBeDefined();
    expect(cell!.coord).toEqual({ col: 0, row: 0, depth: 0 });
  });

  it('getCellMesh returns undefined for invalid coordinates', () => {
    const cell = cube.getCellMesh({ col: 8, row: 0, depth: 0 });
    expect(cell).toBeUndefined();
  });

  it('coordFromMesh returns the correct coordinate', () => {
    const cellMesh = cube.getCellMesh({ col: 3, row: 5, depth: 7 });
    expect(cellMesh).toBeDefined();
    const coord = cube.coordFromMesh(cellMesh!.box);
    expect(coord).toEqual({ col: 3, row: 5, depth: 7 });
  });

  it('coordFromMesh returns null for unknown mesh', () => {
    const unknownMesh = new THREE.Mesh();
    expect(cube.coordFromMesh(unknownMesh)).toBeNull();
  });

  it('updateCell swaps material references', () => {
    const coord: Coordinate = { col: 1, row: 2, depth: 3 };
    const before = cube.getCellMesh(coord)!;
    const emptyFill = before.box.material;

    cube.updateCell(coord, CellState.Hit);

    const hitMats = pool.getMaterials(CellState.Hit);
    expect(before.box.material).toBe(hitMats.fill);
    expect(before.edges.material).toBe(hitMats.edge);
    expect(before.box.material).not.toBe(emptyFill);
  });

  it('updateFromGrid bulk updates all cells', () => {
    const grid = createTestGrid(CellState.Miss);
    cube.updateFromGrid(grid);

    const missMats = pool.getMaterials(CellState.Miss);
    const cell = cube.getCellMesh({ col: 4, row: 4, depth: 4 })!;
    expect(cell.box.material).toBe(missMats.fill);
    expect(cell.edges.material).toBe(missMats.edge);
  });

  it('cell meshes are positioned correctly', () => {
    const cell = cube.getCellMesh({ col: 7, row: 7, depth: 7 })!;
    expect(cell.group.position.x).toBeCloseTo(GRID_OFFSET);
    expect(cell.group.position.y).toBeCloseTo(GRID_OFFSET);
    expect(cell.group.position.z).toBeCloseTo(GRID_OFFSET);
  });

  it('dispose clears all internal state', () => {
    cube.dispose();
    expect(cube.root.children.length).toBe(0);
    expect(cube.getInteractableMeshes().length).toBe(0);
  });
});
