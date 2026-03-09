# CONTACT — Cross-Browser Manual Testing Checklist

## Common Test Matrix

The following items must be verified on **every** browser/platform listed below.

### 3D Rendering
- [ ] 7x7x7 volumetric grid renders correctly
- [ ] Custom orbit controls: drag to rotate, scroll/pinch to zoom
- [ ] Layer slicing displays correct depth planes
- [ ] Cell highlighting and hover states respond to pointer
- [ ] Raycasting selects the correct cell on click
- [ ] No z-fighting or flickering artifacts

### Ship Placement (Setup Phase)
- [ ] All 5 ships + decoy can be placed along any axis
- [ ] Ship preview shows before confirming placement
- [ ] Overlap, out-of-bounds, and diagonal placement are rejected
- [ ] Axis rotation controls work correctly
- [ ] Confirm placement transitions to handoff screen
- [ ] Both players can complete setup without errors

### Combat Flow
- [ ] Alternating turns function correctly (ALPHA / BRAVO)
- [ ] Own Grid and Targeting Grid display the right data
- [ ] Fire Torpedo: hit, miss, and sunk feedback all render
- [ ] Handoff screen appears between turns and hides game state
- [ ] Victory screen displays when all 5 ships are sunk

### Abilities
- [ ] Sonar Ping activates on first hit scored
- [ ] Radar Jammer triggers on first hit received
- [ ] Recon Drone unlocks after sinking 1st ship
- [ ] Decoy returns false positive on fire, drone, and sonar
- [ ] Depth Charge unlocks after sinking 2nd ship
- [ ] Silent Running activates on losing 1st ship; auto-reveals after 2 opponent turns
- [ ] G-SONAR unlocks after sinking 3rd ship
- [ ] Acoustic Cloak triggers reactively when enemy uses G-SONAR

### Audio
- [ ] Tone.js initializes after first user interaction (no autoplay errors)
- [ ] Ambient audio plays during combat
- [ ] SFX fire on torpedo launch, hit, miss, sunk, and ability use
- [ ] No audio glitches, pops, or silence where sound is expected

### CRT Effects
- [ ] Scanline overlay renders without blocking interaction
- [ ] CRT curvature/vignette visible
- [ ] Effects do not degrade performance below 30 fps

### JSONL Export
- [ ] Debug menu accessible
- [ ] Export produces a valid `.jsonl` file
- [ ] Exported file contains structured events with correct taxonomy
- [ ] End-of-game export option functions

### Fonts
- [ ] Press Start 2P and Silkscreen load from Google Fonts CDN
- [ ] Text renders at correct sizes and is legible

---

## Desktop Browsers

### Chrome (latest stable)
- [ ] All common test matrix items pass
- [ ] DevTools console shows no errors during full game loop
- [ ] WebGL2 context acquired without fallback warnings

### Firefox (latest stable)
- [ ] All common test matrix items pass
- [ ] DevTools console shows no errors during full game loop
- [ ] WebGL2 context acquired without fallback warnings
- [ ] Pointer lock / capture behavior matches Chrome

### Safari (latest stable, macOS)
- [ ] All common test matrix items pass
- [ ] WebGL2 renders without visual differences from Chrome
- [ ] Tone.js AudioContext resumes correctly after user gesture
- [ ] No CORS issues loading fonts or assets

### Edge (latest stable)
- [ ] All common test matrix items pass
- [ ] DevTools console shows no errors during full game loop
- [ ] Behavior matches Chrome (Chromium baseline)

---

## Mobile

### iOS Safari (latest iOS, iPhone)
- [ ] All common test matrix items pass
- [ ] Touch drag rotates the 3D grid smoothly
- [ ] Pinch-to-zoom works on the cube without triggering page zoom
- [ ] Tap selects the correct cell (no offset from touch target)
- [ ] Ship placement works with touch-only input
- [ ] On-screen UI elements are large enough to tap reliably
- [ ] AudioContext unlocks on first tap (iOS audio policy)
- [ ] No viewport scaling issues; meta viewport tag respected
- [ ] Landscape and portrait orientations both usable

### Android Chrome (latest stable, phone)
- [ ] All common test matrix items pass
- [ ] Touch drag rotates the 3D grid smoothly
- [ ] Pinch-to-zoom works on the cube without triggering page zoom
- [ ] Tap selects the correct cell (no offset from touch target)
- [ ] Ship placement works with touch-only input
- [ ] On-screen UI elements are large enough to tap reliably
- [ ] AudioContext unlocks on first tap
- [ ] Back button does not break game state

---

## Tablet

### iPad Safari (latest iPadOS)
- [ ] All common test matrix items pass
- [ ] Touch and Apple Pencil input both work for cell selection
- [ ] Grid is readable without needing to zoom in
- [ ] Split-screen / Stage Manager does not break layout
- [ ] Landscape orientation provides adequate UI space

### Android Tablet (Chrome, latest stable)
- [ ] All common test matrix items pass
- [ ] Touch input works for all interactions
- [ ] Grid is readable at tablet screen size
- [ ] Landscape and portrait orientations both usable

---

## Docker-Served Build (Local WiFi)

### Setup
- [ ] `npm run build` completes without errors
- [ ] `docker compose up -d` starts the container
- [ ] App is accessible at `http://<host-ip>:8080` from another device

### Cross-Device Access
- [ ] Desktop browser on same WiFi can load and play
- [ ] Mobile phone on same WiFi can load and play
- [ ] Tablet on same WiFi can load and play
- [ ] No CORS or mixed-content errors in console
- [ ] All assets (fonts, JS, CSS) load over local network

### Single-File Build
- [ ] `npm run build:single` produces `dist/contact.html`
- [ ] Opening `contact.html` directly in a browser works (file:// protocol)
- [ ] All functionality intact without a server

---

## Font Fallback

### Procedure
1. Block `fonts.googleapis.com` and `fonts.gstatic.com` (hosts file, browser extension, or DevTools network blocking)
2. Hard-refresh the app

### Verification
- [ ] App loads without errors when Google Fonts CDN is blocked
- [ ] Text falls back to system monospace
- [ ] All UI text remains legible and properly sized
- [ ] No layout shifts or overlapping text from fallback font metrics
- [ ] Game is fully playable with fallback fonts

---

## Performance Notes

| Target | Threshold |
|---|---|
| Initial load (dev) | < 3 seconds |
| Initial load (prod build) | < 1.5 seconds |
| Frame rate during combat | >= 30 fps sustained |
| Tone.js audio latency | < 100 ms perceived |

---

## Sign-Off

| Platform | Tester | Date | Pass/Fail | Notes |
|---|---|---|---|---|
| Chrome Desktop | | | | |
| Firefox Desktop | | | | |
| Safari Desktop | | | | |
| Edge Desktop | | | | |
| iOS Safari | | | | |
| Android Chrome | | | | |
| iPad Safari | | | | |
| Android Tablet | | | | |
| Docker WiFi | | | | |
| Font Fallback | | | | |
