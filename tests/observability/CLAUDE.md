# tests/observability/ — Logger Tests

## Files

- **`logger.test.ts`** — Event structure, sequence numbering, buffer management (10k cap, FIFO eviction), clear, JSONL serialization, session ID propagation

## Notes

- Tests `Logger` class directly (not via GameController)
- Direct instantiation for isolation, not singleton factory
