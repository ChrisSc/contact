export function generateSessionId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SequenceCounter {
  next(): number;
  reset(): void;
  current(): number;
}

export function createSequenceCounter(): SequenceCounter {
  let value = 0;
  return {
    next(): number {
      return ++value;
    },
    reset(): void {
      value = 0;
    },
    current(): number {
      return value;
    },
  };
}
