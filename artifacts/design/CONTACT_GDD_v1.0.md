  
**CONTACT**

3D Naval Combat

Game Design Document

Version 1.0

March 2026

Chris Scragg

CLASSIFIED // SONAR COMMAND

**1\. CONCEPT OVERVIEW**

## **1.1 High Concept**

CONTACT is a 3D evolution of classic naval combat (Battleship). Players command fleets of submarines hidden within a volumetric 8×8×8 sonar cube, firing torpedoes into three-dimensional space to locate and destroy enemy vessels. The addition of depth as a third dimension transforms the familiar search-and-destroy loop into a spatial reasoning challenge with significantly expanded strategic depth.

## **1.2 Elevator Pitch**

*"Battleship, but in three dimensions."* Navigate depth layers, deploy sonar drones, jam enemy radar, and hunt submarines across a 512-cell volumetric grid. Earned offensive and defensive abilities compress the search space, creating a dynamic game arc that gets smarter as it progresses.

## **1.3 Core Pillars**

* **Spatial Reasoning:** Players must build and maintain a mental model of 3D space, tracking hits and misses across depth layers.

* **Earned Abilities:** Offensive and defensive tools are earned through gameplay milestones, not given at start. Every offensive tool has a paired defensive counter.

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
| Ship Orientation | Any axis: horizontal, vertical, or depth |
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
| **Typhoon** | 5 | Any single axis | Flagship. Largest target. |
| **Akula** | 4 | Any single axis | Attack submarine. |
| **Seawolf** | 3 | Any single axis | Fast attack class. |
| **Virginia** | 3 | Any single axis | Multi-role platform. |
| **Midget Sub** | 2 | Any single axis | Small, hard to find. |

Total occupied cells: 17 of 512 (3.3% volume density). Ships may be placed along any single axis (horizontal, vertical, or depth) but cannot bend or occupy diagonal paths. Ships cannot overlap or extend outside the grid boundary.

## **3.2 Ship Placement Rules**

* Ships must be placed along a single axis (X, Y, or Z)

* Ships cannot overlap other ships or the Decoy

* Ships cannot extend beyond grid boundaries

* Each player also places one Decoy (see Section 5.2) during setup

* Placement order is not enforced; players arrange freely before confirming

**4\. TURN STRUCTURE**

## **4.1 Game Flow**

1. **Setup Phase:** Both players place their fleet and Decoy on their own 8×8×8 grid. Screen handoff between placements.

2. **Combat Phase:** Players alternate turns. On each turn, a player may either fire a torpedo at one cell OR deploy an earned ability (if available).

3. **Resolution:** The game ends when all of one player’s ships are sunk. The surviving player wins.

## **4.2 Turn Actions**

On each turn, the active player performs exactly one action:

* **Fire Torpedo:** Select a depth layer (Slice view recommended), then click a cell to fire. Result is immediately revealed as Hit or Miss.

* **Deploy Ability:** Use one earned ability instead of firing. Ability is consumed on use. Some abilities (Sonar Ping, Radar Jammer) do not cost the attack turn — see Section 5\.

* **No Pass:** Players must act on every turn. No skipping.

## **4.3 Screen Handoff (Hot-Seat)**

Between turns, the screen displays a neutral handoff state: a blank CRT screen with the next player’s designation (ALPHA or BRAVO). The incoming player confirms readiness before their board is revealed. This prevents accidental intel leaks during local two-player sessions.

**5\. EARNED ABILITIES**

## **5.1 Design Principle**

Every offensive ability has a paired defensive counter. Offensive tools are earned by succeeding (scoring hits, sinking ships). Defensive tools are earned by taking damage (receiving hits, losing ships). This creates a natural comeback mechanic: the trailing player gains defensive tools to slow the leader.

Abilities compress the effective search space, making the 512-cell grid tractable without reducing it to brute-force searching. They also introduce a decision layer: use the ability now, or hold it to counter a future threat?

## **5.2 Ability Matrix**

  **PAIR 1: INTELLIGENCE**

| SONAR PING (Offensive) | RADAR JAMMER (Defensive) |
| :---- | :---- |
| Binary yes/no: is any ship present within a 4×4×4 quadrant? Does not reveal which cells or which ship. | When activated, the next enemy Sonar Ping returns a false result (yes reads as no, no reads as yes). |
| Turn cost: FREE (does not consume attack) | Turn cost: FREE (does not consume attack) |
| **Earned: Score your first hit** | **Earned: Receive your first hit** |
| Uses: 1 | Uses: 1 |

  **PAIR 2: RECONNAISSANCE**

| RECON DRONE (Offensive) | DECOY (Defensive) |
| :---- | :---- |
| Reveals exact contents of a 3×3×3 sub-cube (27 cells). Shows which cells contain ship segments, but not ship identity or orientation. | A fake 1-cell “ship” placed during setup. When hit, returns a false hit confirmation. On the attacker’s next turn, the Decoy evaporates and the hit is retracted. Poisons drone intel if scanned. |
| Turn cost: CONSUMES ATTACK | Turn cost: None (placed during setup) |
| **Earned: Sink your first enemy ship** | **Earned: Free at setup (1 per player)** |
| Uses: 1 | Uses: 1 (single placement) |

  **PAIR 3: HEAVY ORDNANCE**

| DEPTH CHARGE (Offensive) | SILENT RUNNING (Defensive) |
| :---- | :---- |
| Fire once, striking ALL occupied cells in a single column through all 8 depth layers. Devastating if aimed at a depth-oriented ship. | Activate after taking a hit. Masks the hit for 2 turns (enemy sees “miss” instead of “hit”). The hit is revealed after 2 turns. Enemy loses confirmation and wastes follow-up shots. |
| Turn cost: CONSUMES ATTACK | Turn cost: FREE (activated in response) |
| **Earned: Sink your second enemy ship** | **Earned: Lose your first ship** |
| Uses: 1 | Uses: 1 |

**PAIR 4: GLOBAL INTELLIGENCE** abilities: G-SONAR and ACOUSTIC CLOAK.

| G-SONAR (Offensive) | ACOUSTIC CLOAK (Defensive) |
| :---- | :---- |
| Reveals which **Rows (1-8)** and which **Columns (A-H)** contain at least one enemy ship segment. Effectively reduces search to a 2D plane. | When activated, all of your ship segments are acoustically masked for the next two turns. This causes any G-SONAR, Sonar Ping, or Recon Drone used against you to return a negative (miss/no ship present) result. |
| Turn cost: CONSUMES ATTACK | Turn cost: FREE (activated in response) |
| **Earned: Sink your third enemy ship** | **Earned: Enemy uses G-SONAR** |
| Uses: 1 | Uses: 1 |

**6\. GAME ARC**

## **6.1 Phase Progression**

| Phase | Duration | Gameplay | Abilities Active |
| :---- | :---- | :---- | :---- |
| **Early** | First 15–25 shots | Blind searching. Pattern firing across depth slices. Pure spatial reasoning. | Decoy only |
| **Mid** | First hits scored | Sonar Ping unlocks. Players begin narrowing quadrants. Intel vs. counter-intel dynamic begins. | \+ Sonar Ping, Radar Jammer |
| **Escalation** | First ships sunk | Recon Drone and Depth Charge unlock. Surgical strikes. Decoys may be revealed. Silent Running masks intel. | \+ Recon Drone, Depth Charge, Silent Running |
| **Endgame** | 1–2 ships remaining | G-SONAR unlocks. Total battlespace compression. High-stakes final hunt. | \+ G-SONAR, Acoustic Cloak (All others likely consumed) |

## **6.2 Comeback Mechanics**

The staggered earn timing ensures the trailing player always has defensive tools before the leading player gains offensive ones. Defensive abilities (Radar Jammer, Silent Running) are triggered by taking damage, giving the losing player tools to slow the opponent. This prevents blowouts and keeps both players engaged through the full session.

**7\. UI/UX DESIGN**

## **7.1 Aesthetic Direction**

Cold War CRT sonar terminal. Green phosphor on dark backgrounds. Scanline overlay with CRT curvature vignette. Subtle flicker animation. Static noise layer. All typography in monospace pixel fonts (Press Start 2P for headings, Silkscreen for body). The visual language should evoke submarine sonar consoles from the 1970s–80s.

## **7.2 Screen Layout**

* **Title Bar:** Game title, system designation, classification markings.

* **Viewport:** Central 3D sonar cube. Rotatable, zoomable. Full-bleed within the CRT frame.

* **View Mode Selector:** Left panel. CUBE / SLICE / X-RAY toggle buttons.

* **Depth Layer Selector:** Right panel. ALL \+ individual depth layer buttons (D1–D8).

* **Coordinate Display:** Top center. Shows current hover target in Column-Row-Depth format.

* **HUD Bar:** Bottom. Depth layer, cells visible, shots fired, hits scored, view mode.

* **Ability Tray:** Bottom-left or contextual. Shows earned abilities with availability state.

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

Game state includes: current player, turn count, ability availability per player, ship health per vessel, win condition tracking.

## **8.3 Rendering Architecture**

* Each cell is a Three.js BoxGeometry mesh with EdgesGeometry wireframe overlay

* Materials swap based on cell state (empty/ship/hit/miss/sunk/hover)

* Visibility controlled by muting mesh opacity per view mode and depth selection

* Raycaster for mouse/touch cell selection

* Manual orbit controls (no OrbitControls import — custom drag/scroll handler)

**END OF DOCUMENT**

SUBMARINE // GDD v1.0 // March 2026