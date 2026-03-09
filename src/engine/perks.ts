import type { PerkId, PerkDefinition, PerkInstance, PerkSlot } from '../types/abilities';
import { PERK_CATALOG } from '../types/abilities';
import type { PlayerState } from '../types/game';

export function getPerkDefinition(perkId: PerkId): PerkDefinition {
  const def = PERK_CATALOG.find((p) => p.id === perkId);
  if (!def) throw new Error(`Unknown perk: ${perkId}`);
  return def;
}

export function generateInstanceId(perkId: PerkId, inventory: PerkInstance[]): string {
  const existing = inventory.filter((p) => p.perkId === perkId).length;
  return `${perkId}_${existing + 1}`;
}

export function purchasePerk(
  player: PlayerState,
  perkId: PerkId,
  turnCount: number,
): { player: PlayerState; instance: PerkInstance } | null {
  const def = getPerkDefinition(perkId);
  if (player.credits < def.cost) return null;

  const instance: PerkInstance = {
    id: generateInstanceId(perkId, player.inventory),
    perkId,
    purchasedOnTurn: turnCount,
  };

  return {
    player: {
      ...player,
      credits: player.credits - def.cost,
      inventory: [...player.inventory, instance],
    },
    instance,
  };
}

export function removeFromInventory(player: PlayerState, instanceId: string): PlayerState {
  return {
    ...player,
    inventory: player.inventory.filter((p) => p.id !== instanceId),
  };
}

export function getInventoryBySlot(inventory: PerkInstance[], slot: PerkSlot): PerkInstance[] {
  return inventory.filter((p) => {
    const def = getPerkDefinition(p.perkId);
    return def.slot === slot;
  });
}
