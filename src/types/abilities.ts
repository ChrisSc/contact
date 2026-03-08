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
    description: 'Reveal whether a 2x2x2 quadrant contains a ship',
  },
  {
    id: 'radar_jammer',
    name: 'Radar Jammer',
    type: 'defensive',
    pair: 'intelligence',
    cost: 'free',
    description: 'Invert the next Sonar Ping result against you',
  },
  {
    id: 'recon_drone',
    name: 'Recon Drone',
    type: 'offensive',
    pair: 'reconnaissance',
    cost: 'attack',
    description: 'Reveal all cells in a single row, column, or depth layer',
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
    description: 'Attack a 2x2x1 area (4 cells)',
  },
  {
    id: 'silent_running',
    name: 'Silent Running',
    type: 'defensive',
    pair: 'heavy_ordnance',
    cost: 'free',
    description: 'Hide your remaining ships from scans for 2 opponent turns',
  },
  {
    id: 'g_sonar',
    name: 'G-SONAR',
    type: 'offensive',
    pair: 'global_intel',
    cost: 'attack',
    description: 'Reveal exact cell count of enemy ships in each depth layer',
  },
  {
    id: 'acoustic_cloak',
    name: 'Acoustic Cloak',
    type: 'defensive',
    pair: 'global_intel',
    cost: 'free',
    description: 'Scramble G-SONAR results when enemy uses it',
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
  { id: 'sonar_ping', name: 'Sonar Ping', type: 'offensive', slot: 'ping', cost: 3, description: 'Binary yes/no: is a ship present in a single cell?' },
  { id: 'recon_drone', name: 'Recon Drone', type: 'offensive', slot: 'attack', cost: 10, description: 'Reveals contents of a 3x3x1 slice (9 cells)' },
  { id: 'depth_charge', name: 'Depth Charge', type: 'offensive', slot: 'attack', cost: 25, description: 'Strikes all occupied cells in a 3x3x3 volume' },
  { id: 'g_sonar', name: 'G-SONAR', type: 'offensive', slot: 'attack', cost: 18, description: 'Scans an entire depth layer (64 cells)' },
  { id: 'radar_jammer', name: 'Radar Jammer', type: 'defensive', slot: 'defend', cost: 5, description: 'Inverts next enemy Sonar Ping or Recon Drone result' },
  { id: 'silent_running', name: 'Silent Running', type: 'defensive', slot: 'defend', cost: 10, description: 'Masks a ship from recon for 2 opponent turns' },
  { id: 'acoustic_cloak', name: 'Acoustic Cloak', type: 'defensive', slot: 'defend', cost: 6, description: 'All ships masked from recon for 2 opponent turns' },
] as const;
