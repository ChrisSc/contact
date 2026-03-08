import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import type { PlayerState } from '../types/game';
import { getCell } from './grid';

export interface SonarPingResult {
  coord: Coordinate;
  rawResult: boolean;
  jammed: boolean;
  cloaked: boolean;
  displayedResult: boolean;
}

export function executeSonarPing(
  coord: Coordinate,
  _attacker: PlayerState,
  defender: PlayerState,
): SonarPingResult {
  const cell = getCell(defender.ownGrid, coord);
  const rawResult = cell != null && (cell.state === CellState.Ship || cell.state === CellState.Decoy);

  // Check defender abilities for active jammer/cloak
  const jammed = defender.abilities.radar_jammer.active;
  const cloaked = defender.abilities.acoustic_cloak.active;

  let displayedResult = rawResult;
  if (cloaked) {
    displayedResult = false;
  } else if (jammed) {
    displayedResult = !rawResult;
  }

  return { coord, rawResult, jammed, cloaked, displayedResult };
}
