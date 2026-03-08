import { describe, it, expect } from 'vitest';
import { calculateFireCredits, CREDIT_AWARDS } from '../../src/engine/credits';

describe('calculateFireCredits', () => {
  it('miss returns empty awards array', () => {
    const result = calculateFireCredits('miss', false);
    expect(result.awards).toEqual([]);
  });

  it('hit returns hit award of 1', () => {
    const result = calculateFireCredits('hit', false);
    expect(result.awards).toEqual([
      { type: 'hit', amount: CREDIT_AWARDS.hit },
    ]);
  });

  it('hit with consecutive (wasLastTurnHit=true) returns hit + consecutive_hit', () => {
    const result = calculateFireCredits('hit', true);
    expect(result.awards).toEqual([
      { type: 'hit', amount: 1 },
      { type: 'consecutive_hit', amount: 5 },
    ]);
  });

  it('sunk returns hit + sink awards', () => {
    const result = calculateFireCredits('sunk', false);
    expect(result.awards).toEqual([
      { type: 'hit', amount: 1 },
      { type: 'sink', amount: 10 },
    ]);
  });

  it('sunk with consecutive returns hit + consecutive_hit + sink', () => {
    const result = calculateFireCredits('sunk', true);
    expect(result.awards).toEqual([
      { type: 'hit', amount: 1 },
      { type: 'consecutive_hit', amount: 5 },
      { type: 'sink', amount: 10 },
    ]);
  });
});
