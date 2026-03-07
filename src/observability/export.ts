import type { LogEvent } from '../types/events';
import { getLogger } from './logger';

export function serializeSession(buffer: readonly LogEvent[]): string {
  return buffer.map((entry) => JSON.stringify(entry)).join('\n');
}

export function exportSession(): void {
  const logger = getLogger();
  const buffer = logger.getBuffer();
  const jsonl = serializeSession(buffer);

  const blob = new Blob([jsonl], { type: 'application/jsonl' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `contact-${logger.getSessionId()}.jsonl`;
  a.click();

  URL.revokeObjectURL(url);

  logger.emit('system.export', { eventCount: buffer.length });
}
