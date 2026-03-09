import type { LogEvent, LogEventType } from '../types/events';
import { generateSessionId, createSequenceCounter } from './session';
import type { SequenceCounter } from './session';

const BUFFER_CAP = 10_000;

export class Logger {
  private buffer: LogEvent[] = [];
  private sessionId: string;
  private seq: SequenceCounter;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? generateSessionId();
    this.seq = createSequenceCounter();
  }

  emit(event: LogEventType, data: Record<string, unknown> = {}): LogEvent {
    const entry: LogEvent = {
      ts: new Date().toISOString(),
      seq: this.seq.next(),
      event,
      session: this.sessionId,
      data,
    };

    if (this.buffer.length >= BUFFER_CAP) {
      this.buffer.shift();
    }
    this.buffer.push(entry);

    if (import.meta.env?.DEV) {
      console.debug(`[${entry.event}]`, entry);
    }

    return entry;
  }

  getBuffer(): readonly LogEvent[] {
    return this.buffer;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  clear(): void {
    this.buffer = [];
    this.seq.reset();
  }
}

let instance: Logger | null = null;

export function initLogger(sessionId?: string): Logger {
  instance = new Logger(sessionId);
  return instance;
}

export function getLogger(): Logger {
  if (!instance) {
    throw new Error('Logger not initialized. Call initLogger() first.');
  }
  return instance;
}
