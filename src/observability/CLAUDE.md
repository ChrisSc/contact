# src/observability/ — Structured JSONL Logging

## Files

- **`logger.ts`** — `Logger` class + singleton factory functions (`initLogger`, `getLogger`)
- **`session.ts`** — Session ID generator + monotonic sequence counter (closure-based)
- **`events.ts`** — Barrel re-export of event types from `src/types/events.ts`
- **`export.ts`** — JSONL serialization + browser file download trigger

## Architecture

- **Singleton Logger** with ring buffer capped at 10,000 events (FIFO eviction when full).
- Factory pattern: `initLogger()` creates the singleton, `getLogger()` retrieves it. Init must be called before get.
- Every logged event receives an ISO timestamp and monotonic sequence number automatically.

## Style Guide

- Access via factory functions, not direct construction (except in tests).
- Buffer is exposed as readonly view — consumers cannot mutate the event log.
- Console mirror is active only in DEV mode (`import.meta.env.DEV`).

## Patterns

- **Event taxonomy** defined in `src/types/events.ts`: `game.*`, `fleet.*`, `combat.*`, `ability.*`, `economy.*`, `perk.*`, `view.*`, `audio.*`, `system.*`
- All state-changing operations across the codebase must emit through this logger.
- JSONL export: one JSON object per line, suitable for streaming parsers and grep.
- Session ID persists for the lifetime of the page; sequence resets only on `clear()`.

## Economy & Perk Events

- `economy.credit` — emitted per credit award (hit, consecutive_hit, sink) with type, amount, balance
- `economy.purchase` — emitted on perk purchase with perkId, cost, balance
- `perk.use` — emitted on perk deployment with perkId, instanceId, target, result
