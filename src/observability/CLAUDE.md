# src/observability/ - Structured JSONL Logging

## Files

| File | Role |
|---|---|
| `logger.ts` | `Logger` class + `initLogger()` / `getLogger()` singleton factory |
| `session.ts` | Session ID generator + monotonic sequence counter |
| `events.ts` | Barrel re-export of event types from `src/types/events.ts` |
| `export.ts` | JSONL serialization + browser file download |

## Key Facts

- Singleton with ring buffer capped at 10,000 events (FIFO eviction)
- `initLogger()` before `getLogger()` (factory pattern)
- Every event gets ISO timestamp + monotonic sequence number automatically
- Console mirror active only in DEV mode (`import.meta.env.DEV`)
- Event taxonomy: `game.*`, `fleet.*`, `combat.*`, `ability.*`, `economy.*`, `perk.*`, `view.*`, `audio.*`, `system.*`
- JSONL export: one JSON object per line
