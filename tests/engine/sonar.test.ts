import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import { executeSonarPing } from '../../src/engine/sonar';
import { CellState } from '../../src/types/grid';
import { createEmptyPlayerState } from '../setup';

beforeEach(() => {
  initLogger('test-sonar');
});

describe('executeSonarPing', () => {
  it('ping empty cell returns rawResult false, displayedResult false', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(false);
    expect(result.displayedResult).toBe(false);
    expect(result.jammed).toBe(false);
    expect(result.cloaked).toBe(false);
  });

  it('ping ship cell returns rawResult true, displayedResult true', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    // Place a ship cell on defender's grid
    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.displayedResult).toBe(true);
  });

  it('ping decoy cell returns rawResult true, displayedResult true (false positive)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[4]![4]![4] = { state: CellState.Decoy, shipId: null };

    const result = executeSonarPing({ col: 4, row: 4, depth: 4 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.displayedResult).toBe(true);
  });

  it('with radar_jammer active: jammed true, result inverted', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    // Place a ship cell
    defender.ownGrid[2]![2]![2] = { state: CellState.Ship, shipId: 'akula' };
    // Activate radar jammer on defender
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 2, row: 2, depth: 2 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.jammed).toBe(true);
    expect(result.displayedResult).toBe(false); // inverted: true -> false
  });

  it('with radar_jammer active on empty cell: inverts false to true', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 5, row: 5, depth: 5 }, attacker, defender);
    expect(result.rawResult).toBe(false);
    expect(result.jammed).toBe(true);
    expect(result.displayedResult).toBe(true); // inverted: false -> true
  });

  it('with acoustic_cloak active: cloaked true, displayedResult false', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    // Place a ship cell
    defender.ownGrid[1]![1]![1] = { state: CellState.Ship, shipId: 'seawolf' };
    // Activate acoustic cloak on defender
    defender.abilities.acoustic_cloak = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 1, row: 1, depth: 1 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.cloaked).toBe(true);
    expect(result.displayedResult).toBe(false); // cloaked overrides to false
  });

  it('decoy + radar_jammer: inverted false positive = false (accidentally correct)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    // Decoy cell
    defender.ownGrid[6]![6]![6] = { state: CellState.Decoy, shipId: null };
    // Activate radar jammer
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 6, row: 6, depth: 6 }, attacker, defender);
    expect(result.rawResult).toBe(true);   // decoy reads as positive
    expect(result.jammed).toBe(true);
    expect(result.displayedResult).toBe(false); // inverted: true -> false (accidentally correct)
  });

  it('silent running ship is masked (displayedResult false, silentRunning true)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }];

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.silentRunning).toBe(true);
    expect(result.displayedResult).toBe(false);
  });

  it('silent running does not mask decoy (decoy has null shipId)', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Decoy, shipId: null };
    // Even if SR list has entries, decoy has no shipId so SR should not affect it
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }];

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.silentRunning).toBe(false);
    expect(result.displayedResult).toBe(true); // decoy still shows as positive
  });

  it('silent running takes priority over jammer for SR ship', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'typhoon' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 1 }];
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.silentRunning).toBe(true);
    expect(result.jammed).toBe(true);
    // SR takes priority: displayedResult is false (masked), NOT jammer-inverted
    expect(result.displayedResult).toBe(false);
  });

  it('non-SR ship still affected by jammer normally', () => {
    const attacker = createEmptyPlayerState(0);
    const defender = createEmptyPlayerState(1);

    defender.ownGrid[3]![3]![3] = { state: CellState.Ship, shipId: 'akula' };
    defender.silentRunningShips = [{ shipId: 'typhoon', turnsRemaining: 2 }]; // different ship
    defender.abilities.radar_jammer = { earned: true, used: false, active: true, turnsRemaining: null };

    const result = executeSonarPing({ col: 3, row: 3, depth: 3 }, attacker, defender);
    expect(result.rawResult).toBe(true);
    expect(result.silentRunning).toBe(false);
    expect(result.jammed).toBe(true);
    expect(result.displayedResult).toBe(false); // jammer inverts true -> false
  });
});
