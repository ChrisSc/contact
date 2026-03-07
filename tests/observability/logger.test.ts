import { describe, it, expect, beforeEach } from 'vitest';
import { Logger, initLogger } from '../../src/observability/logger';
import { serializeSession } from '../../src/observability/export';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = initLogger('test-session-001');
  });

  it('should create events with correct structure', () => {
    const event = logger.emit('system.init', { version: '0.1.0' });

    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.seq).toBe(1);
    expect(event.event).toBe('system.init');
    expect(event.session).toBe('test-session-001');
    expect(event.data).toEqual({ version: '0.1.0' });
  });

  it('should increment sequence numbers monotonically', () => {
    const e1 = logger.emit('system.init', {});
    const e2 = logger.emit('game.start', {});
    const e3 = logger.emit('combat.fire', {});

    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
  });

  it('should store events in buffer', () => {
    logger.emit('system.init', {});
    logger.emit('game.start', {});

    expect(logger.getBufferSize()).toBe(2);
    expect(logger.getBuffer()).toHaveLength(2);
  });

  it('should evict oldest events when buffer exceeds cap', () => {
    for (let i = 0; i < 10_001; i++) {
      logger.emit('system.init', { i });
    }

    expect(logger.getBufferSize()).toBe(10_000);

    const first = logger.getBuffer()[0]!;
    expect(first.data).toEqual({ i: 1 });
  });

  it('should clear buffer and reset sequence', () => {
    logger.emit('system.init', {});
    logger.emit('game.start', {});
    logger.clear();

    expect(logger.getBufferSize()).toBe(0);

    const event = logger.emit('system.init', {});
    expect(event.seq).toBe(1);
  });

  it('should return session ID', () => {
    expect(logger.getSessionId()).toBe('test-session-001');
  });

  it('should handle empty data payload', () => {
    const event = logger.emit('system.init');

    expect(event.data).toEqual({});
  });

  it('should handle complex data payloads', () => {
    const event = logger.emit('combat.fire', {
      player: 0,
      target: 'C-4-D3',
      result: 'hit',
      ship: 'typhoon',
      remaining: 4,
    });

    expect(event.data).toEqual({
      player: 0,
      target: 'C-4-D3',
      result: 'hit',
      ship: 'typhoon',
      remaining: 4,
    });
  });
});

describe('JSONL Serialization', () => {
  it('should serialize buffer to valid JSONL', () => {
    const logger = initLogger('serialize-test');
    logger.emit('system.init', { version: '0.1.0' });
    logger.emit('game.start', {});

    const jsonl = serializeSession(logger.getBuffer());
    const lines = jsonl.split('\n');

    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('ts');
      expect(parsed).toHaveProperty('seq');
      expect(parsed).toHaveProperty('event');
      expect(parsed).toHaveProperty('session');
      expect(parsed).toHaveProperty('data');
    }
  });

  it('should serialize empty buffer to empty string', () => {
    const logger = initLogger('empty-test');
    const jsonl = serializeSession(logger.getBuffer());

    expect(jsonl).toBe('');
  });
});
