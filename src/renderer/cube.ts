import * as THREE from 'three';
import type { Coordinate, Grid } from '../types/grid';
import { CellState, GRID_SIZE } from '../types/grid';
import type { MaterialPool } from './materials';

export const CELL_SIZE = 0.9;
export const CELL_SPACING = 1.0;
export const GRID_OFFSET = (GRID_SIZE - 1) / 2;

export interface CellMesh {
  coord: Coordinate;
  box: THREE.Mesh;
  edges: THREE.LineSegments;
  group: THREE.Group;
}

export function coordToPosition(col: number, row: number, depth: number): THREE.Vector3 {
  return new THREE.Vector3(
    col * CELL_SPACING - GRID_OFFSET,
    row * CELL_SPACING - GRID_OFFSET,
    depth * CELL_SPACING - GRID_OFFSET,
  );
}

function coordKey(col: number, row: number, depth: number): string {
  return `${col},${row},${depth}`;
}

export class GridCube {
  readonly root: THREE.Group;
  private cellMeshes: Map<string, CellMesh> = new Map();
  private meshToCoord: Map<THREE.Mesh, Coordinate> = new Map();
  private materialPool: MaterialPool;
  private boxGeometry: THREE.BoxGeometry;
  private edgesGeometry: THREE.EdgesGeometry;

  constructor(materialPool: MaterialPool) {
    this.materialPool = materialPool;
    this.root = new THREE.Group();
    this.boxGeometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
    this.edgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);

    this.buildGrid();
  }

  private buildGrid(): void {
    const emptyMats = this.materialPool.getMaterials(CellState.Empty);

    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          const group = new THREE.Group();
          const pos = coordToPosition(col, row, depth);
          group.position.copy(pos);

          const box = new THREE.Mesh(this.boxGeometry, emptyMats.fill);
          const edges = new THREE.LineSegments(this.edgesGeometry, emptyMats.edge);

          group.add(box);
          group.add(edges);
          this.root.add(group);

          const coord: Coordinate = { col, row, depth };
          const cellMesh: CellMesh = { coord, box, edges, group };

          this.cellMeshes.set(coordKey(col, row, depth), cellMesh);
          this.meshToCoord.set(box, coord);
        }
      }
    }
  }

  updateCell(coord: Coordinate, state: CellState): void {
    const cell = this.cellMeshes.get(coordKey(coord.col, coord.row, coord.depth));
    if (!cell) return;
    const mats = this.materialPool.getMaterials(state);
    cell.box.material = mats.fill;
    cell.edges.material = mats.edge;
  }

  updateFromGrid(grid: Grid): void {
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let depth = 0; depth < GRID_SIZE; depth++) {
          const cell = grid[col]?.[row]?.[depth];
          if (cell) {
            this.updateCell({ col, row, depth }, cell.state);
          }
        }
      }
    }
  }

  getCellMesh(coord: Coordinate): CellMesh | undefined {
    return this.cellMeshes.get(coordKey(coord.col, coord.row, coord.depth));
  }

  getInteractableMeshes(): THREE.Mesh[] {
    return [...this.meshToCoord.keys()];
  }

  getCellMeshesAtDepth(depth: number): CellMesh[] {
    const result: CellMesh[] = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        const cell = this.cellMeshes.get(coordKey(col, row, depth));
        if (cell) result.push(cell);
      }
    }
    return result;
  }

  getAllCellMeshes(): CellMesh[] {
    return [...this.cellMeshes.values()];
  }

  setLayerVisible(depth: number, visible: boolean): void {
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        const cell = this.cellMeshes.get(coordKey(col, row, depth));
        if (cell) cell.group.visible = visible;
      }
    }
  }

  coordFromMesh(mesh: THREE.Object3D): Coordinate | null {
    if (mesh instanceof THREE.Mesh) {
      return this.meshToCoord.get(mesh) ?? null;
    }
    return null;
  }

  dispose(): void {
    this.boxGeometry.dispose();
    this.edgesGeometry.dispose();
    this.cellMeshes.clear();
    this.meshToCoord.clear();

    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]!);
    }
  }
}
