export type AbilityId =
  | 'sonar_ping'
  | 'radar_jammer'
  | 'recon_drone'
  | 'decoy'
  | 'depth_charge'
  | 'silent_running'
  | 'g_sonar'
  | 'acoustic_cloak';

export type AbilityType = 'offensive' | 'defensive';

export type TurnCost = 'free' | 'attack';

export interface AbilityState {
  earned: boolean;
  used: boolean;
  active: boolean;
  turnsRemaining: number | null;
}

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  type: AbilityType;
  pair: string;
  cost: TurnCost;
  description: string;
}

export const ABILITY_DEFINITIONS: readonly AbilityDefinition[] = [
  {
    id: 'sonar_ping',
    name: 'Sonar Ping',
    type: 'offensive',
    pair: 'intelligence',
    cost: 'free',
    description: 'Scans a 2x2x2 volume (up to 8 cells) for ship presence',
  },
  {
    id: 'radar_jammer',
    name: 'Radar Jammer',
    type: 'defensive',
    pair: 'intelligence',
    cost: 'free',
    description: 'Inverts next enemy Sonar Ping result; returns all-false for Recon Drone',
  },
  {
    id: 'recon_drone',
    name: 'Recon Drone',
    type: 'offensive',
    pair: 'reconnaissance',
    cost: 'attack',
    description: 'Reveals contents of a 3x3x3 volume (up to 27 cells)',
  },
  {
    id: 'decoy',
    name: 'Decoy',
    type: 'defensive',
    pair: 'reconnaissance',
    cost: 'free',
    description: 'Place a 1-cell false target during setup',
  },
  {
    id: 'depth_charge',
    name: 'Depth Charge',
    type: 'offensive',
    pair: 'heavy_ordnance',
    cost: 'attack',
    description: 'Strikes all occupied cells in a 3x3x3 volume (up to 27 cells)',
  },
  {
    id: 'silent_running',
    name: 'Silent Running',
    type: 'defensive',
    pair: 'heavy_ordnance',
    cost: 'free',
    description: 'Masks a single ship from recon for 2 opponent turns',
  },
  {
    id: 'g_sonar',
    name: 'G-SONAR',
    type: 'offensive',
    pair: 'global_intel',
    cost: 'attack',
    description: 'Scans an entire depth layer (49 cells), reveals ship segments',
  },
  {
    id: 'acoustic_cloak',
    name: 'Acoustic Cloak',
    type: 'defensive',
    pair: 'global_intel',
    cost: 'free',
    description: 'All ships masked from recon for 2 opponent turns',
  },
] as const;

// ---------------------------------------------------------------------------
// Perk System Types (Credit Economy)
// ---------------------------------------------------------------------------

export type PerkId = 'sonar_ping' | 'recon_drone' | 'depth_charge' | 'g_sonar'
  | 'radar_jammer' | 'silent_running' | 'acoustic_cloak';

export type PerkSlot = 'ping' | 'attack' | 'defend';

export interface PerkDefinition {
  id: PerkId;
  name: string;
  type: AbilityType;
  slot: PerkSlot;
  cost: number;
  description: string;
}

export interface PerkInstance {
  id: string;
  perkId: PerkId;
  purchasedOnTurn: number;
}

export type PlayerInventory = PerkInstance[];

export const STARTING_CREDITS = 5;

export const PERK_CATALOG: readonly PerkDefinition[] = [
  { id: 'sonar_ping', name: 'Sonar Ping', type: 'offensive', slot: 'ping', cost: 2, description: 'Scans a 2x2x2 volume (up to 8 cells) for ship presence' },
  { id: 'recon_drone', name: 'Recon Drone', type: 'offensive', slot: 'attack', cost: 10, description: 'Reveals contents of a 3x3x3 volume (up to 27 cells)' },
  { id: 'depth_charge', name: 'Depth Charge', type: 'offensive', slot: 'attack', cost: 20, description: 'Strikes all occupied cells in a 3x3x3 volume' },
  { id: 'g_sonar', name: 'G-SONAR', type: 'offensive', slot: 'attack', cost: 14, description: 'Scans an entire depth layer (49 cells)' },
  { id: 'radar_jammer', name: 'Radar Jammer', type: 'defensive', slot: 'defend', cost: 12, description: 'Inverts next enemy Sonar Ping or Recon Drone result' },
  { id: 'silent_running', name: 'Silent Running', type: 'defensive', slot: 'defend', cost: 8, description: 'Masks a ship from recon for 2 opponent turns' },
  { id: 'acoustic_cloak', name: 'Acoustic Cloak', type: 'defensive', slot: 'defend', cost: 14, description: 'All ships masked from recon for 2 opponent turns' },
] as const;
