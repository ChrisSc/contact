export const CREDIT_AWARDS = { hit: 1, consecutive_hit: 3, sink: 15 } as const;

export interface CreditAward {
  type: 'hit' | 'consecutive_hit' | 'sink';
  amount: number;
}

export function calculateFireCredits(
  fireResult: 'hit' | 'miss' | 'sunk',
  wasLastTurnHit: boolean,
): { awards: CreditAward[] } {
  if (fireResult === 'miss') {
    return { awards: [] };
  }

  const awards: CreditAward[] = [];

  // Base hit credit (applies to both hit and sunk)
  awards.push({ type: 'hit', amount: CREDIT_AWARDS.hit });

  // Consecutive hit bonus
  if (wasLastTurnHit) {
    awards.push({ type: 'consecutive_hit', amount: CREDIT_AWARDS.consecutive_hit });
  }

  // Sink bonus
  if (fireResult === 'sunk') {
    awards.push({ type: 'sink', amount: CREDIT_AWARDS.sink });
  }

  return { awards };
}
