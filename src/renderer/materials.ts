import * as THREE from 'three';
import { CellState } from '../types/grid';

export const CRT_COLORS = {
  GREEN: 0x33ff33,
  GREEN_DIM: 0x1a8a1a,
  RED: 0xff3333,
  ORANGE: 0xff8833,
  YELLOW: 0xffff33,
  BG: 0x0a0a0a,
  HOVER: 0x66ff66,
} as const;

export interface MaterialSet {
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
}

interface MaterialDef {
  fillColor: number;
  fillOpacity: number;
  edgeColor: number;
  edgeOpacity: number;
}

const MATERIAL_DEFS: Record<CellState, MaterialDef> = {
  [CellState.Empty]: { fillColor: CRT_COLORS.GREEN, fillOpacity: 0, edgeColor: CRT_COLORS.GREEN_DIM, edgeOpacity: 0.3 },
  [CellState.Ship]: { fillColor: CRT_COLORS.GREEN, fillOpacity: 0.6, edgeColor: CRT_COLORS.GREEN, edgeOpacity: 0.8 },
  [CellState.Hit]: { fillColor: CRT_COLORS.RED, fillOpacity: 0.7, edgeColor: CRT_COLORS.RED, edgeOpacity: 0.9 },
  [CellState.Miss]: { fillColor: CRT_COLORS.GREEN_DIM, fillOpacity: 0.15, edgeColor: CRT_COLORS.GREEN_DIM, edgeOpacity: 0.2 },
  [CellState.Sunk]: { fillColor: CRT_COLORS.ORANGE, fillOpacity: 0.7, edgeColor: CRT_COLORS.ORANGE, edgeOpacity: 0.9 },
  [CellState.Decoy]: { fillColor: CRT_COLORS.YELLOW, fillOpacity: 0.5, edgeColor: CRT_COLORS.YELLOW, edgeOpacity: 0.7 },
  [CellState.DecoyHit]: { fillColor: CRT_COLORS.YELLOW, fillOpacity: 0.3, edgeColor: CRT_COLORS.YELLOW, edgeOpacity: 0.5 },
  [CellState.DronePositive]: { fillColor: CRT_COLORS.GREEN, fillOpacity: 0.4, edgeColor: CRT_COLORS.GREEN, edgeOpacity: 0.6 },
  [CellState.DroneNegative]: { fillColor: CRT_COLORS.GREEN_DIM, fillOpacity: 0.1, edgeColor: CRT_COLORS.GREEN_DIM, edgeOpacity: 0.15 },
  [CellState.SonarPositive]: { fillColor: CRT_COLORS.GREEN, fillOpacity: 0.4, edgeColor: CRT_COLORS.GREEN, edgeOpacity: 0.6 },
  [CellState.SonarNegative]: { fillColor: CRT_COLORS.GREEN_DIM, fillOpacity: 0.1, edgeColor: CRT_COLORS.GREEN_DIM, edgeOpacity: 0.15 },
};

function createMaterialSet(def: MaterialDef): MaterialSet {
  return {
    fill: new THREE.MeshBasicMaterial({
      color: def.fillColor,
      transparent: true,
      opacity: def.fillOpacity,
      depthWrite: false,
    }),
    edge: new THREE.LineBasicMaterial({
      color: def.edgeColor,
      transparent: true,
      opacity: def.edgeOpacity,
    }),
  };
}

export class MaterialPool {
  private pool: Map<CellState, MaterialSet> = new Map();
  private hoverSet: MaterialSet;

  constructor() {
    for (const state of Object.values(CellState)) {
      const def = MATERIAL_DEFS[state];
      this.pool.set(state, createMaterialSet(def));
    }

    this.hoverSet = createMaterialSet({
      fillColor: CRT_COLORS.GREEN,
      fillOpacity: 0.3,
      edgeColor: CRT_COLORS.HOVER,
      edgeOpacity: 0.9,
    });
  }

  getMaterials(state: CellState): MaterialSet {
    return this.pool.get(state)!;
  }

  getHoverMaterials(): MaterialSet {
    return this.hoverSet;
  }

  dispose(): void {
    for (const set of this.pool.values()) {
      set.fill.dispose();
      set.edge.dispose();
    }
    this.hoverSet.fill.dispose();
    this.hoverSet.edge.dispose();
    this.pool.clear();
  }
}
