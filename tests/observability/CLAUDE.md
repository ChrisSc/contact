# tests/observability/ — Logger & Export Tests

## Files

- **`logger.test.ts`** — 10 tests: event structure, sequence numbering, buffer management, FIFO eviction, clear, JSONL serialization

## Architecture

- Tests the `Logger` class directly (not via GameController).
- Tests export utilities for JSONL format correctness.

## Style Guide

- Direct `Logger` instantiation for isolated testing.
- Explicit buffer inspection via readonly accessor.
- JSON round-trip verification for serialization correctness.

## Patterns

- **Buffer cap enforcement**: Log >10,000 events, verify buffer stays at 10k and oldest events are evicted.
- **FIFO eviction order**: First events logged are first evicted when buffer is full.
- **Sequence monotonicity**: Each event's sequence number is strictly greater than the previous.
- **Session ID propagation**: All events in a session share the same session ID.
