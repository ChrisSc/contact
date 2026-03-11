# src/ui/ - Screens & Components (Vanilla DOM)

## Screen Flow

```
title → setup (P1) → handoff → setup (P2) → handoff → combat ↔ handoff → victory → title
                                                          help ← title
```

## Files

| File | Role |
|---|---|
| `screen-router.ts` | `ScreenRouter`: mount/unmount lifecycle, navigation with context. `ScreenId`: title, setup, handoff, combat, victory, help. `ScreenContext` carries `aiMode` + `aiOpponent`. `setAIMode()` / `clearAIMode()` manage AI lifecycle. |
| `flicker.ts` | CRT flicker (persists across screens). `getFlickerController()` singleton. `pulse(intensity, duration)` for ability cross-effects. |
| `effects/crt-noise.ts` | `CRTNoise`: 256x256 canvas grain tiled full-screen, z-index 999. Pulseable. |
| `effects/ability-overlays.ts` | `AbilityOverlayManager`: single canvas at z-index 50, 7 ability-specific 2D animations. Cross-effects with flicker + noise. |
| `components/slice-grid.ts` | `SliceGrid`: 7x7 grid for one depth layer |
| `components/ship-roster.ts` | `ShipRoster`: fleet list with placement status. Decoy entry styled amber. |
| `components/perk-store.ts` | `PerkStore`: slide-out panel. Offensive (red) / Defensive (green). Cost badges amber. |
| `components/inventory-tray.ts` | `InventoryTray`: purchased perks grouped by type with count badges |
| `components/action-slots.ts` | `ActionSlots`: PING / ATTACK / DEFEND slot HUD |
| `components/notification-banner.ts` | `NotificationBanner`: queued CRT notifications with auto-dismiss |
| `screens/title-screen.ts` | Title with CRT aesthetic. Mode selector (LOCAL/AI). Rank selector (recruit/enlisted/officer, default officer). AI mode prompts for Anthropic API key → creates `AIOpponent`. START → `setRank()` + setup, HELP → help |
| `screens/setup-screen.ts` | Canvas-dominant 3D layout. Ship/decoy placement via raycaster. 8-axis selector, AUTO DEPLOY, ghost preview. Phases: ships → decoy-pending → decoy → confirm. |
| `screens/handoff-screen.ts` | Player transition with ready confirmation |
| `screens/combat-screen.ts` | Canvas-dominant 3D. Fire/abilities via raycaster. Board toggle (own/targeting). All perk modes, animations, audio, notifications. Rank bonus notification on mount, DRY counter in bottom bar for non-officer ranks. AI mode: auto-executes AI turns via `context.aiOpponent.executeTurn()`, locks UI during AI thinking. |
| `screens/victory-screen.ts` | Winner display, stats, session export, NEW ENGAGEMENT → title |
| `screens/help-screen.ts` | Scrollable Operations Manual (11 sections). Includes Game Modes (LOCAL / VS AI). |

## Key Patterns

- **Screen mount pattern**: `mount(container, context): ScreenCleanup`. ScreenRouter manages lifecycle.
- **Vanilla DOM only**: `createElement`, `appendChild`, `classList`. No innerHTML for dynamic content.
- **UI state in screen closures**, not in GameController. Engine state and UI state are separate.
- **SceneManager shared pattern**: Both setup and combat screens instantiate SceneManager, wire `onCellClick`/`onCellHover`, call `start()`, and `dispose()` on unmount.
- **Combat mode state**: `CombatUIState` tracks `storeOpen`, `pingMode`, `droneMode`, `depthChargeMode`, `silentRunningMode`, `gSonarMode`, `turnSlots`. Mode cancellation on board view switch or new inventory selection.
- **Persistent footer**: Created in `main.ts`, z-index 5. All bottom UI elements offset 20px to clear it.
- **CRT effects persist** across screen navigations, not re-created per screen.

## Combat Feedback Chain

1. Engine method called (e.g., `game.fireTorpedo()`)
2. 3D animation (`sceneManager.playHitAnimation()`)
3. 2D overlay (`overlays.play('torpedo_hit')`)
4. Audio (`playTorpedoHitSound()`)
5. Screen shake (on hit/sunk)
6. Notification banner ("VESSEL DESTROYED", "+N CREDITS")
7. UI refresh (grids, inventory, action slots, fleet status)
