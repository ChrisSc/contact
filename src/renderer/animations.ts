import * as THREE from 'three';
import type { Coordinate } from '../types/grid';
import { CellState } from '../types/grid';
import { CRT_COLORS } from './materials';
import type { MaterialPool } from './materials';
import type { GridCube, CellMesh } from './cube';
import { getLogger } from '../observability/logger';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AnimEntry {
  coord: Coordinate;
  cell: CellMesh;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
}

interface ActiveAnimation {
  type: 'hit_flash' | 'sunk_cascade' | 'miss_fade' | 'sonar_sweep' | 'drone_scan' | 'depth_charge_blast' | 'g_sonar_scan';
  elapsed: number;
  entries: AnimEntry[];
  /** Per-entry positive flags for drone_scan / g_sonar_scan (used by cancel to restore correct state) */
  positiveFlags?: boolean[];
  /** Per-entry hit flags for depth_charge_blast (used by cancel to restore correct state) */
  hitFlags?: boolean[];
  onUpdate(elapsed: number): boolean; // returns true when complete
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coordKey(coord: Coordinate): string {
  return `${coord.col},${coord.row},${coord.depth}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function tryLog(action: string, type: string): void {
  try {
    getLogger().emit('view.change', { action, type });
  } catch {
    // logger may not be initialized in tests or early startup
  }
}

// ---------------------------------------------------------------------------
// AnimationManager
// ---------------------------------------------------------------------------

export class AnimationManager {
  private animations: Map<string, ActiveAnimation> = new Map();
  private cube: GridCube;
  private materialPool: MaterialPool;

  constructor(cube: GridCube, materialPool: MaterialPool) {
    this.cube = cube;
    this.materialPool = materialPool;
  }

  // -------------------------------------------------------------------------
  // Frame update — call once per frame from the render loop
  // -------------------------------------------------------------------------

  update(dt: number): void {
    const completed: string[] = [];
    const processed = new Set<ActiveAnimation>();

    for (const [key, anim] of this.animations) {
      // Multi-key animations (sunk_cascade, drone_scan) share one object
      // across many keys — only advance elapsed once per frame.
      if (processed.has(anim)) continue;
      processed.add(anim);

      anim.elapsed += dt;
      const done = anim.onUpdate(anim.elapsed);
      if (done) {
        completed.push(key);
      }
    }

    for (const key of completed) {
      this.animations.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // playHitFlash — infinite sinusoidal pulse, never auto-completes
  // -------------------------------------------------------------------------

  playHitFlash(coord: Coordinate): void {
    const key = coordKey(coord);

    // Cancel any existing animation on this cell first
    if (this.animations.has(key)) {
      this._cancelKey(key);
    }

    const cell = this.cube.getCellMesh(coord);
    if (!cell) return;

    const fill = new THREE.MeshBasicMaterial({
      color: CRT_COLORS.RED,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({
      color: CRT_COLORS.RED,
      transparent: true,
      opacity: 1.0,
    });

    cell.box.material = fill;
    cell.edges.material = edge;

    const entry: AnimEntry = { coord, cell, fill, edge };

    const anim: ActiveAnimation = {
      type: 'hit_flash',
      elapsed: 0,
      entries: [entry],
      onUpdate(elapsed: number): boolean {
        if (elapsed <= 0.2) {
          fill.opacity = 1.0;
          edge.opacity = 1.0;
        } else {
          const pulse = 0.75 + 0.25 * Math.sin((elapsed - 0.2) * (2 * Math.PI / 1.5));
          fill.opacity = pulse;
          edge.opacity = pulse;
        }
        return false; // never completes
      },
    };

    this.animations.set(key, anim);
    tryLog('animation_start', 'hit_flash');
  }

  // -------------------------------------------------------------------------
  // playSunkCascade — staggered RED→ORANGE color lerp, then restore Sunk pool
  // -------------------------------------------------------------------------

  playSunkCascade(coords: Coordinate[]): void {
    if (coords.length === 0) return;

    // Cancel any existing animations on these cells
    for (const coord of coords) {
      const key = coordKey(coord);
      if (this.animations.has(key)) {
        this._cancelKey(key);
      }
    }

    const entries: AnimEntry[] = [];
    const redColor = new THREE.Color(CRT_COLORS.RED);
    const orangeColor = new THREE.Color(CRT_COLORS.ORANGE);
    const lerpColor = new THREE.Color();

    for (const coord of coords) {
      const cell = this.cube.getCellMesh(coord);
      if (!cell) continue;

      const fill = new THREE.MeshBasicMaterial({
        color: CRT_COLORS.RED,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const edge = new THREE.LineBasicMaterial({
        color: CRT_COLORS.RED,
        transparent: true,
        opacity: 0.9,
      });

      cell.box.material = fill;
      cell.edges.material = edge;

      entries.push({ coord, cell, fill, edge });
    }

    const totalDuration = 0.125 * (coords.length - 1) + 0.3;
    const pool = this.materialPool;
    const animType = 'sunk_cascade' as const;

    // We use one shared ActiveAnimation; keyed under first coord
    // but we need to remove from the map for ALL coords on complete.
    // Store all keys so we can clean them all up.
    const allKeys = entries.map(e => coordKey(e.coord));

    const anim: ActiveAnimation = {
      type: animType,
      elapsed: 0,
      entries,
      onUpdate(elapsed: number): boolean {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          const staggerOffset = i * 0.125;
          const t = clamp((elapsed - staggerOffset) / 0.3, 0, 1);
          lerpColor.lerpColors(redColor, orangeColor, t);
          entry.fill.color.set(lerpColor);
          entry.edge.color.set(lerpColor);
        }

        if (elapsed >= totalDuration) {
          // Restore pooled Sunk materials
          const sunkMats = pool.getMaterials(CellState.Sunk);
          for (const entry of entries) {
            entry.cell.box.material = sunkMats.fill;
            entry.cell.edges.material = sunkMats.edge;
            entry.fill.dispose();
            entry.edge.dispose();
          }
          return true;
        }
        return false;
      },
    };

    // Register under ALL coord keys so isAnimating works per cell
    for (const key of allKeys) {
      this.animations.set(key, anim);
    }

    tryLog('animation_start', 'sunk_cascade');

    // Override onUpdate to also clean up all keys from the map
    const originalOnUpdate = anim.onUpdate.bind(anim);
    const animationsMap = this.animations;
    anim.onUpdate = function (elapsed: number): boolean {
      const done = originalOnUpdate(elapsed);
      if (done) {
        // Remove all cascade keys (update() only removes the iterated key;
        // we handle extra keys here)
        for (const k of allKeys) {
          animationsMap.delete(k);
        }
        tryLog('animation_complete', 'sunk_cascade');
      }
      return done;
    };
  }

  // -------------------------------------------------------------------------
  // playMissFade — opacity 0 → target over 300ms, then restore Miss pool
  // -------------------------------------------------------------------------

  playMissFade(coord: Coordinate): void {
    const key = coordKey(coord);

    if (this.animations.has(key)) {
      this._cancelKey(key);
    }

    const cell = this.cube.getCellMesh(coord);
    if (!cell) return;

    const targetFillOpacity = 0.15;
    const targetEdgeOpacity = 0.2;

    const fill = new THREE.MeshBasicMaterial({
      color: CRT_COLORS.GREEN_DIM,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({
      color: CRT_COLORS.GREEN_DIM,
      transparent: true,
      opacity: 0,
    });

    cell.box.material = fill;
    cell.edges.material = edge;

    const entry: AnimEntry = { coord, cell, fill, edge };
    const pool = this.materialPool;
    const animationsMap = this.animations;
    const animType = 'miss_fade' as const;

    const anim: ActiveAnimation = {
      type: animType,
      elapsed: 0,
      entries: [entry],
      onUpdate(elapsed: number): boolean {
        const t = clamp(elapsed / 0.3, 0, 1);
        fill.opacity = t * targetFillOpacity;
        edge.opacity = t * targetEdgeOpacity;

        if (elapsed >= 0.3) {
          // Restore pooled Miss materials
          const missMats = pool.getMaterials(CellState.Miss);
          entry.cell.box.material = missMats.fill;
          entry.cell.edges.material = missMats.edge;
          fill.dispose();
          edge.dispose();
          animationsMap.delete(key);
          tryLog('animation_complete', 'miss_fade');
          return true;
        }
        return false;
      },
    };

    this.animations.set(key, anim);
    tryLog('animation_start', 'miss_fade');
  }

  // -------------------------------------------------------------------------
  // playSonarSweep — pulse up then settle, restore pooled SonarPositive/Negative
  // -------------------------------------------------------------------------

  playSonarSweep(coord: Coordinate, positive: boolean): void {
    const key = coordKey(coord);

    if (this.animations.has(key)) {
      this._cancelKey(key);
    }

    const cell = this.cube.getCellMesh(coord);
    if (!cell) return;

    const color = positive ? CRT_COLORS.CYAN : CRT_COLORS.GREEN_DIM;
    const targetState = positive ? CellState.SonarPositive : CellState.SonarNegative;
    const targetFillOpacity = positive ? 0.4 : 0.1;
    const targetEdgeOpacity = positive ? 0.6 : 0.15;

    const fill = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
    });

    cell.box.material = fill;
    cell.edges.material = edge;

    const entry: AnimEntry = { coord, cell, fill, edge };
    const pool = this.materialPool;
    const animationsMap = this.animations;

    const anim: ActiveAnimation = {
      type: 'sonar_sweep',
      elapsed: 0,
      entries: [entry],
      onUpdate(elapsed: number): boolean {
        if (elapsed <= 0.3) {
          // Phase 1: pulse up (0–300ms)
          const t = clamp(elapsed / 0.3, 0, 1);
          fill.opacity = t * 0.8;
          edge.opacity = t * 1.0;
        } else if (elapsed <= 0.5) {
          // Phase 2: settle to target (300–500ms)
          const t = clamp((elapsed - 0.3) / 0.2, 0, 1);
          fill.opacity = 0.8 + t * (targetFillOpacity - 0.8);
          edge.opacity = 1.0 + t * (targetEdgeOpacity - 1.0);
        }

        if (elapsed >= 0.5) {
          // Restore pooled materials
          const mats = pool.getMaterials(targetState);
          entry.cell.box.material = mats.fill;
          entry.cell.edges.material = mats.edge;
          fill.dispose();
          edge.dispose();
          animationsMap.delete(key);
          tryLog('animation_complete', 'sonar_sweep');
          return true;
        }
        return false;
      },
    };

    this.animations.set(key, anim);
    tryLog('animation_start', 'sonar_sweep');
  }

  // -------------------------------------------------------------------------
  // playDroneScan — staggered sonar-like pulse per cell, restore DronePositive/Negative pool
  // -------------------------------------------------------------------------

  playDroneScan(results: Array<{coord: Coordinate; positive: boolean}>): void {
    if (results.length === 0) return;

    // Cancel existing animations on these cells
    for (const r of results) {
      const key = coordKey(r.coord);
      if (this.animations.has(key)) {
        this._cancelKey(key);
      }
    }

    const entries: AnimEntry[] = [];
    const positiveFlags: boolean[] = [];

    for (const r of results) {
      const cell = this.cube.getCellMesh(r.coord);
      if (!cell) continue;

      const color = r.positive ? CRT_COLORS.CYAN : CRT_COLORS.GREEN_DIM;

      const fill = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const edge = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
      });

      cell.box.material = fill;
      cell.edges.material = edge;

      entries.push({ coord: r.coord, cell, fill, edge });
      positiveFlags.push(r.positive);
    }

    if (entries.length === 0) return;

    const stagger = 0.03; // 30ms per cell
    const cellDuration = 0.5; // 500ms per cell (300ms pulse + 200ms settle)
    const totalDuration = stagger * (entries.length - 1) + cellDuration;
    const pool = this.materialPool;
    const allKeys = entries.map(e => coordKey(e.coord));

    const anim: ActiveAnimation = {
      type: 'drone_scan',
      elapsed: 0,
      entries,
      positiveFlags,
      onUpdate(elapsed: number): boolean {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          const positive = positiveFlags[i]!;
          const staggerOffset = i * stagger;
          const localTime = elapsed - staggerOffset;

          const targetFillOpacity = positive ? 0.4 : 0.1;
          const targetEdgeOpacity = positive ? 0.6 : 0.15;

          if (localTime < 0) {
            // Not started yet
            entry.fill.opacity = 0;
            entry.edge.opacity = 0;
          } else if (localTime <= 0.3) {
            // Phase 1: pulse up
            const t = clamp(localTime / 0.3, 0, 1);
            entry.fill.opacity = t * 0.8;
            entry.edge.opacity = t * 1.0;
          } else if (localTime <= 0.5) {
            // Phase 2: settle to target
            const t = clamp((localTime - 0.3) / 0.2, 0, 1);
            entry.fill.opacity = 0.8 + t * (targetFillOpacity - 0.8);
            entry.edge.opacity = 1.0 + t * (targetEdgeOpacity - 1.0);
          } else {
            // Done — hold at target values
            entry.fill.opacity = targetFillOpacity;
            entry.edge.opacity = targetEdgeOpacity;
          }
        }

        if (elapsed >= totalDuration) {
          // Restore pooled materials for each cell
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!;
            const positive = positiveFlags[i]!;
            const targetState = positive ? CellState.DronePositive : CellState.DroneNegative;
            const mats = pool.getMaterials(targetState);
            entry.cell.box.material = mats.fill;
            entry.cell.edges.material = mats.edge;
            entry.fill.dispose();
            entry.edge.dispose();
          }
          return true;
        }
        return false;
      },
    };

    // Register under ALL coord keys
    const animationsMap = this.animations;
    for (const key of allKeys) {
      this.animations.set(key, anim);
    }

    tryLog('animation_start', 'drone_scan');

    // Override onUpdate to clean up all keys
    const originalOnUpdate = anim.onUpdate.bind(anim);
    anim.onUpdate = function (elapsed: number): boolean {
      const done = originalOnUpdate(elapsed);
      if (done) {
        for (const k of allKeys) {
          animationsMap.delete(k);
        }
        tryLog('animation_complete', 'drone_scan');
      }
      return done;
    };
  }

  // -------------------------------------------------------------------------
  // playGSonarScan — same pulse pattern as drone_scan but 15ms stagger for 64 cells (~1.5s total)
  // -------------------------------------------------------------------------

  playGSonarScan(results: Array<{coord: Coordinate; positive: boolean}>): void {
    if (results.length === 0) return;

    // Cancel existing animations on these cells
    for (const r of results) {
      const key = coordKey(r.coord);
      if (this.animations.has(key)) {
        this._cancelKey(key);
      }
    }

    const entries: AnimEntry[] = [];
    const positiveFlags: boolean[] = [];

    for (const r of results) {
      const cell = this.cube.getCellMesh(r.coord);
      if (!cell) continue;

      const color = r.positive ? CRT_COLORS.CYAN : CRT_COLORS.GREEN_DIM;

      const fill = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const edge = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
      });

      cell.box.material = fill;
      cell.edges.material = edge;

      entries.push({ coord: r.coord, cell, fill, edge });
      positiveFlags.push(r.positive);
    }

    if (entries.length === 0) return;

    const stagger = 0.015; // 15ms per cell (vs 30ms for drone scan)
    const cellDuration = 0.5; // 500ms per cell (300ms pulse + 200ms settle)
    const totalDuration = stagger * (entries.length - 1) + cellDuration;
    const pool = this.materialPool;
    const allKeys = entries.map(e => coordKey(e.coord));

    const anim: ActiveAnimation = {
      type: 'g_sonar_scan',
      elapsed: 0,
      entries,
      positiveFlags,
      onUpdate(elapsed: number): boolean {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          const positive = positiveFlags[i]!;
          const staggerOffset = i * stagger;
          const localTime = elapsed - staggerOffset;

          const targetFillOpacity = positive ? 0.4 : 0.1;
          const targetEdgeOpacity = positive ? 0.6 : 0.15;

          if (localTime < 0) {
            // Not started yet
            entry.fill.opacity = 0;
            entry.edge.opacity = 0;
          } else if (localTime <= 0.3) {
            // Phase 1: pulse up
            const t = clamp(localTime / 0.3, 0, 1);
            entry.fill.opacity = t * 0.8;
            entry.edge.opacity = t * 1.0;
          } else if (localTime <= 0.5) {
            // Phase 2: settle to target
            const t = clamp((localTime - 0.3) / 0.2, 0, 1);
            entry.fill.opacity = 0.8 + t * (targetFillOpacity - 0.8);
            entry.edge.opacity = 1.0 + t * (targetEdgeOpacity - 1.0);
          } else {
            // Done — hold at target values
            entry.fill.opacity = targetFillOpacity;
            entry.edge.opacity = targetEdgeOpacity;
          }
        }

        if (elapsed >= totalDuration) {
          // Restore pooled materials for each cell
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!;
            const positive = positiveFlags[i]!;
            const targetState = positive ? CellState.DronePositive : CellState.DroneNegative;
            const mats = pool.getMaterials(targetState);
            entry.cell.box.material = mats.fill;
            entry.cell.edges.material = mats.edge;
            entry.fill.dispose();
            entry.edge.dispose();
          }
          return true;
        }
        return false;
      },
    };

    // Register under ALL coord keys
    const animationsMap = this.animations;
    for (const key of allKeys) {
      this.animations.set(key, anim);
    }

    tryLog('animation_start', 'g_sonar_scan');

    // Override onUpdate to clean up all keys
    const originalOnUpdate = anim.onUpdate.bind(anim);
    anim.onUpdate = function (elapsed: number): boolean {
      const done = originalOnUpdate(elapsed);
      if (done) {
        for (const k of allKeys) {
          animationsMap.delete(k);
        }
        tryLog('animation_complete', 'g_sonar_scan');
      }
      return done;
    };
  }

  // -------------------------------------------------------------------------
  // playDepthChargeBlast — expanding shockwave from center, then settle to Hit/Miss
  // Phase 1 (0–200ms): center cell full ORANGE flash
  // Phase 2 (200–700ms): rings expand outward staggered by 80ms per Manhattan ring
  // Phase 3 (700–1200ms): settle — hit cells restore Hit pool, miss cells restore Miss pool
  // -------------------------------------------------------------------------

  playDepthChargeBlast(center: Coordinate, results: Array<{coord: Coordinate; hit: boolean}>): void {
    if (results.length === 0) return;

    // Cancel existing animations on these cells
    for (const r of results) {
      const key = coordKey(r.coord);
      if (this.animations.has(key)) {
        this._cancelKey(key);
      }
    }

    const entries: AnimEntry[] = [];
    const hitFlags: boolean[] = [];
    const manhattanDistances: number[] = [];

    for (const r of results) {
      const cell = this.cube.getCellMesh(r.coord);
      if (!cell) continue;

      const fill = new THREE.MeshBasicMaterial({
        color: CRT_COLORS.ORANGE,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const edge = new THREE.LineBasicMaterial({
        color: CRT_COLORS.ORANGE,
        transparent: true,
        opacity: 0,
      });

      cell.box.material = fill;
      cell.edges.material = edge;

      const dist =
        Math.abs(r.coord.col - center.col) +
        Math.abs(r.coord.row - center.row) +
        Math.abs(r.coord.depth - center.depth);

      entries.push({ coord: r.coord, cell, fill, edge });
      hitFlags.push(r.hit);
      manhattanDistances.push(dist);
    }

    if (entries.length === 0) return;

    const pool = this.materialPool;
    const allKeys = entries.map(e => coordKey(e.coord));
    const animationsMap = this.animations;

    // Phase timing constants (in seconds)
    const PHASE1_END = 0.2;   // center flash full
    const PHASE2_START = 0.2; // shockwave expansion begins
    const PHASE2_END = 0.7;   // shockwave expansion ends
    const PHASE3_END = 1.2;   // settle complete

    const RING_STAGGER = 0.08; // 80ms per Manhattan ring

    const anim: ActiveAnimation = {
      type: 'depth_charge_blast',
      elapsed: 0,
      entries,
      hitFlags,
      onUpdate(elapsed: number): boolean {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          const dist = manhattanDistances[i]!;
          const isHit = hitFlags[i]!;

          // Each ring starts its flash staggered by distance
          const ringStart = PHASE2_START + dist * RING_STAGGER;
          const flashPeak = ringStart + 0.15; // 150ms to peak
          const flashEnd = flashPeak + 0.15;  // 150ms to settle

          if (dist === 0) {
            // Center cell — Phase 1 full flash
            if (elapsed <= PHASE1_END) {
              entry.fill.opacity = 1.0;
              entry.edge.opacity = 1.0;
            } else if (elapsed <= PHASE3_END) {
              // Settle to hit/miss target during Phase 3
              const targetFill = isHit ? 0.7 : 0.15;
              const targetEdge = isHit ? 0.9 : 0.2;
              const t = clamp((elapsed - PHASE2_END) / (PHASE3_END - PHASE2_END), 0, 1);
              entry.fill.opacity = 1.0 + t * (targetFill - 1.0);
              entry.edge.opacity = 1.0 + t * (targetEdge - 1.0);
            }
          } else {
            // Shockwave ring cells
            if (elapsed < ringStart) {
              entry.fill.opacity = 0;
              entry.edge.opacity = 0;
            } else if (elapsed <= flashPeak) {
              const t = clamp((elapsed - ringStart) / 0.15, 0, 1);
              entry.fill.opacity = t * 1.0;
              entry.edge.opacity = t * 1.0;
            } else if (elapsed <= flashEnd) {
              const t = clamp((elapsed - flashPeak) / 0.15, 0, 1);
              const targetFill = isHit ? 0.7 : 0.15;
              const targetEdge = isHit ? 0.9 : 0.2;
              entry.fill.opacity = 1.0 + t * (targetFill - 1.0);
              entry.edge.opacity = 1.0 + t * (targetEdge - 1.0);
            } else {
              // Hold at target until animation complete
              entry.fill.opacity = isHit ? 0.7 : 0.15;
              entry.edge.opacity = isHit ? 0.9 : 0.2;
            }
          }
        }

        if (elapsed >= PHASE3_END) {
          // Restore pooled materials per cell
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!;
            const isHit = hitFlags[i]!;
            const targetState = isHit ? CellState.Hit : CellState.Miss;
            const mats = pool.getMaterials(targetState);
            entry.cell.box.material = mats.fill;
            entry.cell.edges.material = mats.edge;
            entry.fill.dispose();
            entry.edge.dispose();
          }
          return true;
        }
        return false;
      },
    };

    // Register under ALL coord keys
    for (const key of allKeys) {
      this.animations.set(key, anim);
    }

    tryLog('animation_start', 'depth_charge_blast');

    // Override onUpdate to clean up all keys on completion
    const originalOnUpdate = anim.onUpdate.bind(anim);
    anim.onUpdate = function (elapsed: number): boolean {
      const done = originalOnUpdate(elapsed);
      if (done) {
        for (const k of allKeys) {
          animationsMap.delete(k);
        }
        tryLog('animation_complete', 'depth_charge_blast');
      }
      return done;
    };
  }

  // -------------------------------------------------------------------------
  // cancelAt — remove animation, dispose private materials, restore pool mats
  // -------------------------------------------------------------------------

  cancelAt(coord: Coordinate): void {
    const key = coordKey(coord);
    this._cancelKey(key);
  }

  private _cancelKey(key: string): void {
    const anim = this.animations.get(key);
    if (!anim) return;

    // Restore all entries in the animation (cascade/drone may span multiple cells)
    for (let i = 0; i < anim.entries.length; i++) {
      const entry = anim.entries[i]!;

      // Drone scan / g_sonar_scan: restore each cell to its correct positive/negative state
      // Depth charge blast: restore each cell to Hit or Miss based on hitFlags
      let restoreState: CellState;
      if ((anim.type === 'drone_scan' || anim.type === 'g_sonar_scan') && anim.positiveFlags) {
        restoreState = anim.positiveFlags[i] ? CellState.DronePositive : CellState.DroneNegative;
      } else if (anim.type === 'depth_charge_blast' && anim.hitFlags) {
        restoreState = anim.hitFlags[i] ? CellState.Hit : CellState.Miss;
      } else {
        restoreState =
          anim.type === 'hit_flash' ? CellState.Hit :
          anim.type === 'sunk_cascade' ? CellState.Sunk :
          anim.type === 'sonar_sweep' ? CellState.SonarPositive :
          CellState.Miss;
      }

      const pooledMats = this.materialPool.getMaterials(restoreState);
      entry.cell.box.material = pooledMats.fill;
      entry.cell.edges.material = pooledMats.edge;
      entry.fill.dispose();
      entry.edge.dispose();
    }

    // Remove all keys that point to this animation (handles cascade)
    for (const [k, v] of this.animations) {
      if (v === anim) {
        this.animations.delete(k);
      }
    }
  }

  // -------------------------------------------------------------------------
  // cancelAll
  // -------------------------------------------------------------------------

  cancelAll(): void {
    // Collect unique animations (cascade/drone register under multiple keys)
    const seen = new Set<ActiveAnimation>();
    for (const anim of this.animations.values()) {
      seen.add(anim);
    }

    for (const anim of seen) {
      for (let i = 0; i < anim.entries.length; i++) {
        const entry = anim.entries[i]!;

        let restoreState: CellState;
        if ((anim.type === 'drone_scan' || anim.type === 'g_sonar_scan') && anim.positiveFlags) {
          restoreState = anim.positiveFlags[i] ? CellState.DronePositive : CellState.DroneNegative;
        } else if (anim.type === 'depth_charge_blast' && anim.hitFlags) {
          restoreState = anim.hitFlags[i] ? CellState.Hit : CellState.Miss;
        } else {
          restoreState =
            anim.type === 'hit_flash' ? CellState.Hit :
            anim.type === 'sunk_cascade' ? CellState.Sunk :
            anim.type === 'sonar_sweep' ? CellState.SonarPositive :
            CellState.Miss;
        }

        const pooledMats = this.materialPool.getMaterials(restoreState);
        entry.cell.box.material = pooledMats.fill;
        entry.cell.edges.material = pooledMats.edge;
        entry.fill.dispose();
        entry.edge.dispose();
      }
    }

    this.animations.clear();
  }

  // -------------------------------------------------------------------------
  // isAnimating
  // -------------------------------------------------------------------------

  isAnimating(coord: Coordinate): boolean {
    return this.animations.has(coordKey(coord));
  }

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    this.cancelAll();
    this.animations.clear();
  }
}
