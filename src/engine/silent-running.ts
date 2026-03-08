import type { SilentRunningEntry } from '../types/game';

export function isShipSilentRunning(
  silentRunningShips: SilentRunningEntry[],
  shipId: string,
): boolean {
  return silentRunningShips.some((entry) => entry.shipId === shipId);
}

export function decrementSilentRunning(
  entries: SilentRunningEntry[],
): { remaining: SilentRunningEntry[]; expired: string[] } {
  const remaining: SilentRunningEntry[] = [];
  const expired: string[] = [];

  for (const entry of entries) {
    const newTurns = entry.turnsRemaining - 1;
    if (newTurns > 0) {
      remaining.push({ shipId: entry.shipId, turnsRemaining: newTurns });
    } else {
      expired.push(entry.shipId);
    }
  }

  return { remaining, expired };
}
