import { describe, it, expect } from 'vitest';
import { isShipSilentRunning, decrementSilentRunning } from '../../src/engine/silent-running';
import type { SilentRunningEntry } from '../../src/types/game';

describe('isShipSilentRunning', () => {
  it('returns true for an active silent running ship', () => {
    const entries: SilentRunningEntry[] = [{ shipId: 'typhoon', turnsRemaining: 2 }];
    expect(isShipSilentRunning(entries, 'typhoon')).toBe(true);
  });

  it('returns false for a ship not in the list', () => {
    const entries: SilentRunningEntry[] = [{ shipId: 'typhoon', turnsRemaining: 2 }];
    expect(isShipSilentRunning(entries, 'akula')).toBe(false);
  });

  it('returns false for an empty array', () => {
    expect(isShipSilentRunning([], 'typhoon')).toBe(false);
  });

  it('finds ship among multiple entries', () => {
    const entries: SilentRunningEntry[] = [
      { shipId: 'typhoon', turnsRemaining: 2 },
      { shipId: 'akula', turnsRemaining: 1 },
    ];
    expect(isShipSilentRunning(entries, 'akula')).toBe(true);
  });
});

describe('decrementSilentRunning', () => {
  it('decrements turnsRemaining from 2 to 1 (still remaining)', () => {
    const entries: SilentRunningEntry[] = [{ shipId: 'typhoon', turnsRemaining: 2 }];
    const result = decrementSilentRunning(entries);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0]!.shipId).toBe('typhoon');
    expect(result.remaining[0]!.turnsRemaining).toBe(1);
    expect(result.expired).toHaveLength(0);
  });

  it('decrements turnsRemaining from 1 to 0 (expired)', () => {
    const entries: SilentRunningEntry[] = [{ shipId: 'typhoon', turnsRemaining: 1 }];
    const result = decrementSilentRunning(entries);
    expect(result.remaining).toHaveLength(0);
    expect(result.expired).toEqual(['typhoon']);
  });

  it('handles mixed entries (some expire, some remain)', () => {
    const entries: SilentRunningEntry[] = [
      { shipId: 'typhoon', turnsRemaining: 2 },
      { shipId: 'akula', turnsRemaining: 1 },
    ];
    const result = decrementSilentRunning(entries);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0]!.shipId).toBe('typhoon');
    expect(result.remaining[0]!.turnsRemaining).toBe(1);
    expect(result.expired).toEqual(['akula']);
  });

  it('returns empty arrays for empty input', () => {
    const result = decrementSilentRunning([]);
    expect(result.remaining).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
  });

  it('does not mutate original entries', () => {
    const entries: SilentRunningEntry[] = [{ shipId: 'typhoon', turnsRemaining: 2 }];
    decrementSilentRunning(entries);
    expect(entries[0]!.turnsRemaining).toBe(2);
  });
});
