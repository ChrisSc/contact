# tests/ui/ - UI Tests

## Files

| File | Tests |
|---|---|
| `slice-grid.test.ts` | Grid rendering, cell state CSS classes, ghost preview, click callbacks |
| `setup-screen.test.ts` | 3D canvas, view modes, axis selector, ship roster, raycaster placement, R key cycling, full placement flow, AUTO DEPLOY, dispose |
| `screen-router.test.ts` | Mount/unmount lifecycle, context passing, cleanup |
| `combat-screen.test.ts` | Fire torpedo, board toggle, perk purchase, ping/drone/depth-charge/SR/G-SONAR/cloak modes, animations, audio, fleet status (friendly + enemy), full game loop, no-pass enforcement, dispose |
| `handoff-screen.test.ts` | Player designation, instructions, navigation, data leakage check |
| `victory-screen.test.ts` | Winner display, stats, session export, NEW ENGAGEMENT navigation |
| `tool-palette.test.ts` | View/depth/axis button rendering, active states, callbacks, axis hiding via config, destruction/cleanup |

## Mock Patterns

- **SceneManager**: Mock object with `vi.fn()` for all methods. `onCellClick`/`onCellHover` capture callbacks. `resetMocks()` helper.
- **Audio**: `vi.mock` for `audio-manager`, `abilities`, `ambient`. Avoids Tone.js ESM issues in jsdom.
- **AbilityOverlayManager**: Mock constructor (jsdom lacks canvas 2D context).
- All tests use real `GameController` + real `Logger`. Only rendering/audio is mocked.
