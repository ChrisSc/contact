  
**CONTACT**

3D Naval Combat

Game Design Document

Version 1.2

March 2026

Chris Scragg

CLASSIFIED // SONAR COMMAND

**1\. CONCEPT OVERVIEW**

## **1.1 High Concept**

CONTACT is a 3D evolution of classic naval combat (Battleship). Players command fleets of submarines hidden within a volumetric 8×8×8 sonar cube, firing torpedoes into three-dimensional space to locate and destroy enemy vessels. The addition of depth as a third dimension transforms the familiar search-and-destroy loop into a spatial reasoning challenge with significantly expanded strategic depth.

## **1.2 Elevator Pitch**

*"Battleship, but in three dimensions."* Navigate depth layers, deploy sonar drones, jam enemy radar, and hunt submarines across a 512-cell volumetric grid. A credit-based perk store lets players buy offensive and defensive abilities — spend on recon to find targets, save up for a depth charge, or invest in defense to slow the opponent. The economy creates a dynamic game arc that gets smarter as it progresses.

## **1.3 Core Pillars**

* **Spatial Reasoning:** Players must build and maintain a mental model of 3D space, tracking hits and misses across depth layers.

* **Credit Economy:** Players earn credits through combat performance (hits, consecutive hits, sinks) and spend them in a perk store. Every offensive tool has a paired defensive counter. Players choose their own loadout — no two games play the same.

* **Escalating Tension:** The game arc moves from blind searching to informed hunting to psychological warfare as abilities unlock.

* **Accessible Complexity:** The slice view (depth layer isolation) makes 3D navigation intuitive. The cube is complex; the interface is not.

## **1.4 Target Audience**

Two-player local (hot-seat). Designed for couples, friends, and families who enjoy Battleship but want a deeper strategic experience. Session length: 30–60 minutes.

## **1.5 Platform & Technology**

* Browser-based (HTML5 / JavaScript / Three.js)

* Responsive design with mobile touch support

* CRT green phosphor sonar aesthetic (8-bit inspired)

**2\. GAME BOARD**

## **2.1 Grid Specifications**

| Parameter | Value |
| :---- | :---- |
| Grid Dimensions | 8 × 8 × 8 (512 total cells) |
| Axes | Column (A–H), Row (1–8), Depth (D1–D8) |
| Coordinate Format | Column-Row-Depth (e.g., C-4-D3) |
| Ship Orientation | 6 axes: col, row, diagonal (×2), cross-slice (×2). No purely vertical. |
| Occupied Cells | 17 of 512 (3.3% density) |

## **2.2 View Modes**

Three view modes provide different perspectives on the 3D volume:

* **CUBE:** Full 3D volumetric view. Freely rotatable. When a depth layer is selected, other layers dim but remain visible for spatial context. Primary navigation mode.

* **SLICE:** Isolates a single depth layer as a flat 8×8 grid. The primary firing mode. Equivalent to looking at one “floor” of the cube. Ghosted outlines of adjacent layers provide peripheral awareness.

* **X-RAY:** Hides all empty cells, showing only occupied cells (ships on own board) or action cells (hits/misses on targeting board). Useful for endgame assessment and reviewing the state of play.

## **2.3 Visual Language**

| Cell State | Own Board | Targeting Board |
| :---- | :---- | :---- |
| Empty | Dim green wireframe | Dim green wireframe |
| Ship | Solid green block | Hidden (shows as empty) |
| Miss | Dim green dot marker | Dim green dot marker |
| Hit | Red × with pulse glow | Red × with pulse glow |
| Sunk | Orange × (entire ship) | Orange × (entire ship revealed) |
| Decoy | Yellow blinking cell | Appears as Hit, then fades |

**3\. FLEET COMPOSITION**

## **3.1 Ship Roster**

| Vessel | Size | Orientation | Notes |
| :---- | :---: | :---- | :---- |
| **Typhoon** | 5 | Any allowed axis | Flagship. Largest target. |
| **Akula** | 4 | Any allowed axis | Attack submarine. |
| **Seawolf** | 3 | Any allowed axis | Fast attack class. |
| **Virginia** | 3 | Any allowed axis | Multi-role platform. |
| **Midget Sub** | 2 | Any allowed axis | Small, hard to find. |

Total occupied cells: 17 of 512 (3.3% volume density). Ships are placed along one of six allowed axes. Ships cannot bend, overlap, or extend outside the grid boundary.

### **3.1.1 Placement Axes**

Six orientation axes are available, organized into two categories:

**Within-slice** (ship stays at a constant depth layer):
* **COL** — extends along columns (A→H), row and depth fixed
* **ROW** — extends along rows (1→8), column and depth fixed
* **DIAG↗** — extends diagonally within a slice (column and row both increase)
* **DIAG↘** — extends diagonally within a slice (column increases, row decreases)

**Cross-slice** (ship spans multiple depth layers while moving horizontally):
* **COL+D** — extends along columns and depth simultaneously (column and depth both increase, row fixed)
* **ROW+D** — extends along rows and depth simultaneously (row and depth both increase, column fixed)

**Purely vertical placement (depth-only) is not allowed.** Submarines cannot stand on end. This constraint ensures every ship has horizontal extent, making layer-by-layer searching viable while cross-slice axes add complexity that rewards 3D spatial reasoning.

## **3.2 Ship Placement Rules**

* Ships must be placed along one of the six allowed axes (see Section 3.1.1)

* Purely vertical (depth-only) orientation is forbidden

* Ships cannot overlap other ships or the Decoy

* Ships cannot extend beyond grid boundaries

* Each player also places one Decoy (see Section 5.2) during setup

* Placement order is not enforced; players arrange freely before confirming

**4\. TURN STRUCTURE**

## **4.1 Game Flow**

1. **Setup Phase:** Both players place their fleet and Decoy on their own 8×8×8 grid using the full 3D sonar cube interface (CUBE/SLICE/X-RAY view modes available during placement). Screen handoff between placements.

2. **Combat Phase:** Players alternate turns. Each turn has up to three action slots: an optional Sonar Ping, a required attack action (fire torpedo or deploy an offensive perk), and an optional defensive perk. Players can buy perks from the store at any point during their turn.

3. **Resolution:** The game ends when all of one player’s ships are sunk. The surviving player wins.

## **4.2 Turn Actions**

Each turn has three action slots, resolved in order:

1. **Sonar Ping** (optional, costs 3 credits): Check one cell — binary yes/no for ship presence. If positive, the player has intel to act on immediately. Does not consume the attack action.

2. **Attack** (required): Either **Fire Torpedo** at a single cell, OR deploy one **offensive perk** (Recon Drone, Depth Charge, or G-SONAR). Exactly one attack action per turn.

3. **Defend** (optional): Deploy one **defensive perk** (Radar Jammer, Silent Running, or Acoustic Cloak). Does not consume the attack action. Maximum one defensive perk per turn.

**Perk Store:** Players may purchase perks from the store at any point during their turn. Purchased perks are added to the player's inventory and can be deployed immediately or saved for a future turn. Multiple copies of the same perk can be purchased.

**No Pass:** Players must perform an attack action every turn. No skipping.

## **4.3 Screen Handoff (Hot-Seat)**

Between turns, the screen displays a neutral handoff state: a blank CRT screen with the next player’s designation (ALPHA or BRAVO). The incoming player confirms readiness before their board is revealed. This prevents accidental intel leaks during local two-player sessions.

**5\. CREDIT ECONOMY & PERK STORE**

## **5.1 Design Principle**

Players earn credits through combat performance and spend them in a perk store to purchase offensive and defensive abilities. Every offensive perk has a paired defensive counter. Players choose their own loadout — multiple copies of the same perk can be purchased, and purchasing decisions create strategic differentiation between players.

Perks compress the effective search space, making the 512-cell grid tractable without reducing it to brute-force searching. The credit economy introduces a resource management layer: spend early on recon to find targets faster, save up for devastating ordnance, or invest defensively when under pressure.

## **5.2 Credit Economy**

| Accomplishment | Credits Earned |
| :--- | :---: |
| Hit | 1 |
| Consecutive Hit (back-to-back hits on successive turns) | 5 |
| Sink | 10 |
| Starting Credits (each player) | 5 |

**Notes:**
* A hit to a Decoy still rewards credits (1 for the hit).
* Consecutive Hit bonus triggers when a player scores a hit on the turn immediately following a hit (regardless of target ship). The bonus is in addition to the base 1-credit hit reward, for 6 total.
* Total base credits available per player: 5 (starting) + 18 (hits including decoy) + 85 (5 sinks) = 108, plus consecutive hit bonuses.

## **5.3 Perk Store**

### Offensive Perks

| Perk | Effect | Cost | Turn Slot |
| :--- | :--- | :---: | :--- |
| **Sonar Ping** | Binary yes/no: is a ship present in a single cell? | 3 | Ping (does not consume attack) |
| **Recon Drone** | Reveals contents of a 3×3×1 slice (9 cells). Shows which cells contain ship segments, but not ship identity. | 10 | Attack (consumes attack) |
| **Depth Charge** | Strikes all occupied cells in a 3×3×3 volume (27 cells). Area denial. | 25 | Attack (consumes attack) |
| **G-SONAR** | Scans an entire depth layer (64 cells). Reveals which cells contain ship segments. | 18 | Attack (consumes attack) |

### Defensive Perks

| Perk | Effect | Cost | Turn Slot |
| :--- | :--- | :---: | :--- |
| **Radar Jammer** | When activated, the next enemy Sonar Ping or Recon Drone returns an inverted/false result. | 5 | Defend (free action) |
| **Silent Running** | Masks a ship for 2 opponent turns — enemy recon and G-SONAR cannot detect it. | 10 | Defend (free action) |
| **Acoustic Cloak** | All own ship segments are masked for 2 opponent turns. Any G-SONAR, Sonar Ping, or Recon Drone returns negative. | 6 | Defend (free action) |

### Decoy (Special)

The **Decoy** is not purchased — it is placed for free during setup (1 per player). A fake 1-cell “ship” that returns a false hit confirmation when struck. Poisons drone/sonar intel if scanned. Credits are still awarded to the attacker for hitting a Decoy.

## **5.4 Perk Interactions**

* **Radar Jammer vs. Sonar Ping:** Jammer inverts the ping result (yes→no, no→yes). Jammer is consumed on trigger.
* **Radar Jammer vs. Recon Drone:** Jammer returns false scan results for the drone’s area. Jammer is consumed on trigger.
* **Acoustic Cloak vs. G-SONAR:** G-SONAR returns all-negative for cloaked player. Cloak continues for remaining turns.
* **Acoustic Cloak vs. Sonar Ping/Drone:** Returns negative for cloaked cells. Cloak continues for remaining turns.
* **Silent Running:** Hides a specific ship from recon for 2 turns. Torpedoes still hit normally — Silent Running only affects recon abilities.
* **Decoy vs. Recon Drone:** Decoy appears as an occupied cell in scan results.
* **Stacking:** Multiple defensive perks of different types can be active simultaneously (e.g., Acoustic Cloak + Radar Jammer), but only one defensive perk can be deployed per turn.

**6\. GAME ARC**

## **6.1 Phase Progression**

| Phase | Duration | Credits Available | Typical Spending |
| :---- | :---- | :---- | :---- |
| **Early** | First 15–25 shots | 5 starting credits | 1–2 Sonar Pings to scout. Cheap intel. |
| **Mid** | First hits scored | ~10–15 credits | Sonar Pings to confirm targets. Radar Jammers to disrupt opponent's recon. |
| **Escalation** | First ships sunk | ~30–50 credits | Recon Drones for area scanning. Silent Running to protect damaged ships. |
| **Endgame** | 1–2 ships remaining | ~60–100+ credits | G-SONAR for full-layer scans. Depth Charges for area denial. Acoustic Cloak for final defense. |

## **6.2 Economic Tension**

The credit economy creates natural decision points throughout the game:

* **Spend vs. Save:** 3 credits for a Sonar Ping now, or save for a 10-credit Recon Drone later?
* **Offense vs. Defense:** A dominant player can invest in Depth Charges (25 credits) for devastating area attacks, but a defensive Radar Jammer (5 credits) can poison their recon at a fraction of the cost.
* **Consecutive Hit Bonus:** Rewards players who chase a found ship rather than scattershot — 6 credits per consecutive hit (1 base + 5 bonus) funds a Sonar Ping every other turn for free.
* **Losing player economy:** Even a trailing player earns credits from hits. Cheap defensive perks (Radar Jammer at 5, Acoustic Cloak at 6) let them disrupt the leader's intelligence advantage.

**7\. UI/UX DESIGN**

## **7.1 Aesthetic Direction**

Cold War CRT sonar terminal. Green phosphor on dark backgrounds. Scanline overlay with CRT curvature vignette. Subtle flicker animation. Static noise layer. All typography in monospace pixel fonts (Press Start 2P for headings, Silkscreen for body). The visual language should evoke submarine sonar consoles from the 1970s–80s.

## **7.2 Screen Layout**

Both setup and combat screens share a canvas-dominant overlay layout: the 3D sonar cube fills the viewport, with UI controls positioned as transparent overlays.

### **7.2.1 Shared Elements (Setup & Combat)**

* **Viewport:** Full-screen 3D sonar cube. Rotatable via drag, zoomable via scroll. Canvas fills the entire screen.

* **Top Bar (overlay):** Player designation badge, screen title/turn count, coordinate display (center, shows hovered cell in Column-Row-Depth format), system info.

* **View Mode Selector (overlay, left edge):** CUBE / SLICE / X-RAY toggle buttons, vertically stacked.

* **Depth Layer Selector (overlay, right edge):** ALL \+ individual depth layer buttons (D1–D8), vertically stacked.

* **Controls Hint (overlay, bottom center):** "DRAG TO ROTATE · SCROLL TO ZOOM · CLICK CELL TO ..."

### **7.2.2 Setup Screen**

* **Axis Selector (overlay, top center):** 6-axis toggle: COL / ROW / DIAG↗ / DIAG↘ / COL+D / ROW+D. Controls ship orientation for placement.

* **Ship Roster (overlay, right side):** Fleet list with placement status, click to select for placement, click placed ship to remove.

* **Ghost Cell Preview:** Hovering over the cube with a ship selected shows a green (valid) or red (invalid) preview of the ship's footprint in 3D space.

* **Footer (overlay, bottom):** RESET ALL and CONFIRM DEPLOYMENT buttons.

### **7.2.3 Combat Screen**

* **Board Toggle (overlay, top left):** TARGETING / OWN FLEET switch.

* **Status Message (overlay, center):** Shows torpedo result (HIT/MISS/SUNK) with color coding.

* **Enemy Fleet Panel (overlay, bottom right):** Ship names with health pips, struck-through when sunk.

* **HUD Bar (overlay, bottom):** Depth layer, visible cells, shots fired, hits, sunk count, view mode.

* **End Turn Button (overlay, bottom right):** Enabled after firing.

* **Credit Display (overlay, top):** Current credit balance, prominently visible.

* **Perk Store (overlay, left or contextual):** Browse and purchase perks. Shows perk name, cost, description. Greyed out if insufficient credits.

* **Inventory Tray (overlay, bottom-left):** Shows purchased perks available for deployment. Offensive perks highlighted separately from defensive. Click to deploy.

## **7.3 Player Feedback**

* **Hit:** Red flash on cell. Screen shake. Hit sound effect. Cell pulses with glow animation.

* **Miss:** Dim green marker placed. Subtle sonar ping sound.

* **Ship Sunk:** All cells of sunk ship transition from red to orange. Notification banner. Ability unlock notification if applicable.

* **Ability Used:** Full-screen sonar sweep animation (Sonar Ping). Scan wash effect (Recon Drone). Static burst (Radar Jammer). Fade-to-silence effect (Silent Running).

## **7.4 Audio Design**

Synthesized chiptune audio via Tone.js. Ambient sonar pings at regular intervals. Distinct sound signatures for each action (fire, hit, miss, sink, ability deploy). Background ambient: low submarine hum with periodic sonar sweep. Audio intensity scales with game phase — more layers and tension in late game.

**8\. TECHNICAL ARCHITECTURE**

## **8.1 Technology Stack**

* Rendering: Three.js (r128+) for 3D cube visualization

* Audio: Tone.js for synthesized sound effects and ambient audio

* UI: HTML/CSS with CRT shader overlay via CSS

* State: JavaScript in-memory game state (no server, no database)

* Build: Single HTML file, CDN imports only, zero build step

## **8.2 Game State Model**

Each player maintains two 8×8×8 grids:

* **Own Grid:** Ship placements, Decoy placement, incoming hits/misses.

* **Targeting Grid:** Outgoing shots (hits/misses), drone scan results.

Game state includes: current player, turn count, credit balance per player, perk inventory per player, active perk effects (cloak/jammer/silent running with turn counters), ship health per vessel, consecutive hit tracking, win condition tracking.

## **8.3 Rendering Architecture**

* **SceneManager** is the single orchestrator — used by both setup and combat screens. Manages scene, camera, renderer, orbit controls, grid cube, view manager, and raycaster.

* Each cell is a Three.js BoxGeometry mesh with EdgesGeometry wireframe overlay (512 cells, shared geometry instances)

* **MaterialPool** provides three material tiers per cell state: normal, dimmed (30% opacity), ghost (15% opacity). Opacity lerps for smooth transitions between view modes.

* **ViewManager** controls cell visibility and material assignment per view mode (CUBE, SLICE, X-RAY) and depth selection

* **Ghost cell overlay** for setup placement preview: temporarily swaps cell materials to green (valid) or red (invalid) to show ship footprint before placement

* Raycaster for mouse/touch cell selection, with mesh source filtered by current view mode (only visible/interactable cells are pickable)

* Custom orbit controls (no OrbitControls import — spherical coordinate system with pointer/wheel/pinch input and damping)

* ResizeObserver for responsive canvas sizing. devicePixelRatio capped at 2.

**END OF DOCUMENT**

SUBMARINE // GDD v1.2 // March 2026