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
  type: 'hit_flash' | 'sunk_cascade' | 'miss_fade';
  elapsed: number;
  entries: AnimEntry[];
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

    for (const [key, anim] of this.animations) {
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
  // cancelAt — remove animation, dispose private materials, restore pool mats
  // -------------------------------------------------------------------------

  cancelAt(coord: Coordinate): void {
    const key = coordKey(coord);
    this._cancelKey(key);
  }

  private _cancelKey(key: string): void {
    const anim = this.animations.get(key);
    if (!anim) return;

    // Determine restore state
    const restoreState =
      anim.type === 'hit_flash' ? CellState.Hit :
      anim.type === 'sunk_cascade' ? CellState.Sunk :
      CellState.Miss;

    const pooledMats = this.materialPool.getMaterials(restoreState);

    // Restore all entries in the animation (cascade may span multiple cells)
    for (const entry of anim.entries) {
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
    // Collect unique animations (cascade registers under multiple keys)
    const seen = new Set<ActiveAnimation>();
    for (const anim of this.animations.values()) {
      seen.add(anim);
    }

    for (const anim of seen) {
      const restoreState =
        anim.type === 'hit_flash' ? CellState.Hit :
        anim.type === 'sunk_cascade' ? CellState.Sunk :
        CellState.Miss;

      const pooledMats = this.materialPool.getMaterials(restoreState);
      for (const entry of anim.entries) {
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
