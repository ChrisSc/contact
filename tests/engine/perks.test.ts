import { describe, it, expect, beforeEach } from 'vitest';
import { initLogger } from '../../src/observability/logger';
import {
  getPerkDefinition,
  purchasePerk,
  removeFromInventory,
  getInventoryBySlot,
  generateInstanceId,
  resetInstanceCounter,
} from '../../src/engine/perks';
import { createEmptyPlayerState } from '../setup';
import type { PerkInstance } from '../../src/types/abilities';

beforeEach(() => {
  initLogger('test-perks');
  resetInstanceCounter();
});

describe('getPerkDefinition', () => {
  it('returns correct definition for known perk', () => {
    const def = getPerkDefinition('sonar_ping');
    expect(def.id).toBe('sonar_ping');
    expect(def.name).toBe('Sonar Ping');
    expect(def.slot).toBe('ping');
    expect(def.cost).toBe(2);
  });

  it('throws on unknown perk id', () => {
    expect(() => getPerkDefinition('not_a_perk' as any)).toThrow('Unknown perk');
  });
});

describe('purchasePerk', () => {
  it('success: returns new player state with credits deducted and instance added', () => {
    const player = createEmptyPlayerState(0); // credits: 5
    const result = purchasePerk(player, 'sonar_ping', 1); // cost 2

    expect(result).not.toBeNull();
    expect(result!.player.credits).toBe(3); // 5 - 2
    expect(result!.player.inventory).toHaveLength(1);
    expect(result!.instance.perkId).toBe('sonar_ping');
    expect(result!.instance.purchasedOnTurn).toBe(1);
  });

  it('insufficient credits: returns null', () => {
    const player = createEmptyPlayerState(0);
    player.credits = 1;
    const result = purchasePerk(player, 'sonar_ping', 1); // cost 2
    expect(result).toBeNull();
  });

  it('does not mutate the original player state', () => {
    const player = createEmptyPlayerState(0);
    const originalCredits = player.credits;
    purchasePerk(player, 'sonar_ping', 1);
    expect(player.credits).toBe(originalCredits);
    expect(player.inventory).toHaveLength(0);
  });
});

describe('removeFromInventory', () => {
  it('removes the correct instance by id', () => {
    const player = createEmptyPlayerState(0);
    const instance1: PerkInstance = { id: 'sonar_ping_1', perkId: 'sonar_ping', purchasedOnTurn: 1 };
    const instance2: PerkInstance = { id: 'sonar_ping_2', perkId: 'sonar_ping', purchasedOnTurn: 2 };
    player.inventory = [instance1, instance2];

    const updated = removeFromInventory(player, 'sonar_ping_1');
    expect(updated.inventory).toHaveLength(1);
    expect(updated.inventory[0]!.id).toBe('sonar_ping_2');
  });

  it('returns unchanged inventory if id not found', () => {
    const player = createEmptyPlayerState(0);
    const instance: PerkInstance = { id: 'sonar_ping_1', perkId: 'sonar_ping', purchasedOnTurn: 1 };
    player.inventory = [instance];

    const updated = removeFromInventory(player, 'nonexistent');
    expect(updated.inventory).toHaveLength(1);
  });
});

describe('getInventoryBySlot', () => {
  it('filters correctly by slot', () => {
    const inventory: PerkInstance[] = [
      { id: 'sonar_ping_1', perkId: 'sonar_ping', purchasedOnTurn: 1 },       // slot: ping
      { id: 'radar_jammer_1', perkId: 'radar_jammer', purchasedOnTurn: 2 },   // slot: defend
      { id: 'sonar_ping_2', perkId: 'sonar_ping', purchasedOnTurn: 3 },       // slot: ping
    ];

    const pingPerks = getInventoryBySlot(inventory, 'ping');
    expect(pingPerks).toHaveLength(2);
    expect(pingPerks.every((p) => p.perkId === 'sonar_ping')).toBe(true);

    const defendPerks = getInventoryBySlot(inventory, 'defend');
    expect(defendPerks).toHaveLength(1);
    expect(defendPerks[0]!.perkId).toBe('radar_jammer');

    const attackPerks = getInventoryBySlot(inventory, 'attack');
    expect(attackPerks).toHaveLength(0);
  });
});

describe('generateInstanceId', () => {
  it('generates monotonically incrementing IDs', () => {
    const inventory: PerkInstance[] = [];
    const id1 = generateInstanceId('sonar_ping', inventory);
    expect(id1).toBe('sonar_ping_1');

    inventory.push({ id: id1, perkId: 'sonar_ping', purchasedOnTurn: 1 });
    const id2 = generateInstanceId('sonar_ping', inventory);
    expect(id2).toBe('sonar_ping_2');
  });

  it('produces unique IDs across different perk types', () => {
    const inventory: PerkInstance[] = [];
    const id1 = generateInstanceId('sonar_ping', inventory);
    expect(id1).toBe('sonar_ping_1');
    const id2 = generateInstanceId('radar_jammer', inventory);
    expect(id2).toBe('radar_jammer_2');
  });

  it('never reuses IDs after removal', () => {
    const inventory: PerkInstance[] = [];
    const id1 = generateInstanceId('radar_jammer', inventory);
    expect(id1).toBe('radar_jammer_1');
    inventory.push({ id: id1, perkId: 'radar_jammer', purchasedOnTurn: 1 });
    // Simulate removal
    inventory.splice(0, 1);
    const id2 = generateInstanceId('radar_jammer', inventory);
    expect(id2).toBe('radar_jammer_2');
  });
});
