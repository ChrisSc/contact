export const GRID_SIZE = 7;

export const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export const DEPTH_LABELS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const;

export type ColumnLabel = (typeof COLUMN_LABELS)[number];
export type RowLabel = (typeof ROW_LABELS)[number];
export type DepthLabel = (typeof DEPTH_LABELS)[number];

export enum CellState {
  Empty = 'empty',
  Ship = 'ship',
  Decoy = 'decoy',
  Hit = 'hit',
  Miss = 'miss',
  Sunk = 'sunk',
  DecoyHit = 'decoy_hit',
  DronePositive = 'drone_positive',
  DroneNegative = 'drone_negative',
  SonarPositive = 'sonar_positive',
  SonarNegative = 'sonar_negative',
}

export interface Coordinate {
  col: number;
  row: number;
  depth: number;
}

export interface Cell {
  state: CellState;
  shipId: string | null;
}

/** 3D grid indexed as grid[col][row][depth] */
export type Grid = Cell[][][];
