import type { Coordinate } from './grid';

export type PlacementAxis = 'col' | 'row' | 'diag+' | 'diag-' | 'col-depth' | 'col-depth-' | 'row-depth' | 'row-depth-';

export const PLACEMENT_AXES: readonly PlacementAxis[] = [
  'col', 'row', 'diag+', 'diag-', 'col-depth', 'col-depth-', 'row-depth', 'row-depth-',
] as const;

export interface ShipPlacement {
  origin: Coordinate;
  axis: PlacementAxis;
}

export interface Ship {
  id: string;
  name: string;
  size: number;
  cells: Coordinate[];
  placement: ShipPlacement | null;
  hits: number;
  sunk: boolean;
}

export interface FleetRosterEntry {
  id: string;
  name: string;
  size: number;
}

export const FLEET_ROSTER: readonly FleetRosterEntry[] = [
  { id: 'typhoon', name: 'Typhoon', size: 5 },
  { id: 'akula', name: 'Akula', size: 4 },
  { id: 'seawolf', name: 'Seawolf', size: 3 },
  { id: 'virginia', name: 'Virginia', size: 3 },
  { id: 'midget', name: 'Midget Sub', size: 2 },
  { id: 'narwhal', name: 'Narwhal', size: 3 },
  { id: 'piranha', name: 'Piranha', size: 2 },
] as const;

export const TOTAL_SHIP_CELLS = 22;
