import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CellState } from '../../src/types/grid';
import type { Coordinate } from '../../src/types/grid';
import { MaterialPool, CRT_COLORS } from '../../src/renderer/materials';
import { GridCube } from '../../src/renderer/cube';
import { AnimationManager } from '../../src/renderer/animations';

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let materialPool: MaterialPool;
let cube: GridCube;
let manager: AnimationManager;
const coord: Coordinate = { col: 0, row: 0, depth: 0 };

beforeEach(() => {
  materialPool = new MaterialPool();
  cube = new GridCube(materialPool);
  manager = new AnimationManager(cube, materialPool);
});

afterEach(() => {
  manager.dispose();
  cube.dispose();
  materialPool.dispose();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCell(c: Coordinate = coord) {
  return cube.getCellMesh(c)!;
}

function pooledFill(state: CellState): THREE.MeshBasicMaterial {
  return materialPool.getMaterials(state).fill as THREE.MeshBasicMaterial;
}

function pooledEdge(state: CellState): THREE.LineBasicMaterial {
  return materialPool.getMaterials(state).edge as THREE.LineBasicMaterial;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimationManager', () => {
  // 1
  it('playHitFlash creates private materials on cell', () => {
    const emptyFill = pooledFill(CellState.Empty);
    manager.playHitFlash(coord);
    const cell = getCell();
    expect(cell.box.material).not.toBe(emptyFill);
    expect(cell.box.material).not.toBe(pooledFill(CellState.Hit));
  });

  // 2
  it('Hit flash starts at full opacity', () => {
    manager.playHitFlash(coord);
    const cell = getCell();
    const fill = cell.box.material as THREE.MeshBasicMaterial;
    expect(fill.opacity).toBeCloseTo(1.0);
  });

  // 3
  it('Hit flash transitions to pulse after 200ms', () => {
    manager.playHitFlash(coord);
    manager.update(0.25);
    const cell = getCell();
    const fill = cell.box.material as THREE.MeshBasicMaterial;
    // Pulse range is 0.5–1.0 (0.75 ± 0.25)
    expect(fill.opacity).toBeGreaterThanOrEqual(0.5);
    expect(fill.opacity).toBeLessThanOrEqual(1.0);
  });

  // 4
  it('Hit flash is infinite (not auto-removed)', () => {
    manager.playHitFlash(coord);
    manager.update(10.0);
    expect(manager.isAnimating(coord)).toBe(true);
  });

  // 5
  it('playSunkCascade creates entries for all ship cells', () => {
    const coords: Coordinate[] = [
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
      { col: 2, row: 0, depth: 0 },
    ];
    const emptyFill = pooledFill(CellState.Empty);
    manager.playSunkCascade(coords);
    for (const c of coords) {
      const cell = cube.getCellMesh(c)!;
      expect(cell.box.material).not.toBe(emptyFill);
      expect(cell.box.material).not.toBe(pooledFill(CellState.Sunk));
    }
  });

  // 6
  it('Cascade staggers transitions', () => {
    const coords: Coordinate[] = [
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
      { col: 2, row: 0, depth: 0 },
    ];
    manager.playSunkCascade(coords);
    // At 0.05s: first cell (stagger=0) has t = 0.05/0.3 = 0.167, so lerped toward orange
    // Third cell (stagger=0.25) has t = clamp((0.05-0.25)/0.3, 0, 1) = 0, still RED
    manager.update(0.05);

    const first = cube.getCellMesh(coords[0]!)!;
    const last = cube.getCellMesh(coords[2]!)!;

    const firstFill = first.box.material as THREE.MeshBasicMaterial;
    const lastFill = last.box.material as THREE.MeshBasicMaterial;

    const redHex = new THREE.Color(CRT_COLORS.RED);

    // First cell: not purely red anymore (has lerped toward orange)
    expect(firstFill.color.r).toBeGreaterThan(redHex.r - 0.001); // r unchanged or similar
    // Green channel: orange has g=0x88/255≈0.533, red has g=0x33/255≈0.2
    // At t=0.167: g = 0.2 + 0.167*(0.533-0.2) ≈ 0.256
    expect(firstFill.color.g).toBeGreaterThan(redHex.g);

    // Last cell: should still be purely red (no lerp started yet)
    expect(lastFill.color.r).toBeCloseTo(redHex.r, 2);
    expect(lastFill.color.g).toBeCloseTo(redHex.g, 2);
    expect(lastFill.color.b).toBeCloseTo(redHex.b, 2);
  });

  // 7
  it('Cascade lerps color from RED to ORANGE', () => {
    const coords: Coordinate[] = [{ col: 0, row: 0, depth: 0 }];
    manager.playSunkCascade(coords);
    // After 0.4s the single cell is fully at orange (stagger=0, t=1 at 0.3s)
    // But we check before completion — at 0.2s t=0.667
    manager.update(0.2);

    const cell = cube.getCellMesh(coords[0]!)!;
    const fill = cell.box.material as THREE.MeshBasicMaterial;

    const orangeColor = new THREE.Color(CRT_COLORS.ORANGE);
    const redColor = new THREE.Color(CRT_COLORS.RED);
    const t = 0.2 / 0.3; // ≈ 0.667
    const expectedR = redColor.r + t * (orangeColor.r - redColor.r);
    const expectedG = redColor.g + t * (orangeColor.g - redColor.g);
    const expectedB = redColor.b + t * (orangeColor.b - redColor.b);

    expect(fill.color.r).toBeCloseTo(expectedR, 2);
    expect(fill.color.g).toBeCloseTo(expectedG, 2);
    expect(fill.color.b).toBeCloseTo(expectedB, 2);
  });

  // 8
  it('Cascade completes and restores pooled materials', () => {
    const coords: Coordinate[] = [
      { col: 0, row: 0, depth: 0 },
      { col: 1, row: 0, depth: 0 },
    ];
    manager.playSunkCascade(coords);
    // Total duration = 0.125*(2-1) + 0.3 = 0.425
    manager.update(0.5);

    for (const c of coords) {
      expect(manager.isAnimating(c)).toBe(false);
      const cell = cube.getCellMesh(c)!;
      expect(cell.box.material).toBe(pooledFill(CellState.Sunk));
      expect(cell.edges.material).toBe(pooledEdge(CellState.Sunk));
    }
  });

  // 9
  it('playMissFade starts at zero opacity', () => {
    manager.playMissFade(coord);
    const cell = getCell();
    const fill = cell.box.material as THREE.MeshBasicMaterial;
    expect(fill.opacity).toBeCloseTo(0);
  });

  // 10
  it('Miss fade reaches target opacity at 300ms', () => {
    manager.playMissFade(coord);
    // advance just under completion so materials haven't been restored yet
    manager.update(0.29);
    const cell = getCell();
    const fill = cell.box.material as THREE.MeshBasicMaterial;
    const edge = cell.edges.material as THREE.LineBasicMaterial;
    const t = clamp(0.29 / 0.3, 0, 1);
    expect(fill.opacity).toBeCloseTo(t * 0.15, 2);
    expect(edge.opacity).toBeCloseTo(t * 0.2, 2);
  });

  // 11
  it('Miss fade completes (one-shot)', () => {
    manager.playMissFade(coord);
    manager.update(0.35);
    expect(manager.isAnimating(coord)).toBe(false);
  });

  // 12
  it('cancelAt removes animation and disposes materials', () => {
    manager.playHitFlash(coord);
    expect(manager.isAnimating(coord)).toBe(true);
    manager.cancelAt(coord);
    expect(manager.isAnimating(coord)).toBe(false);
    // Materials should be restored to Hit pool
    const cell = getCell();
    expect(cell.box.material).toBe(pooledFill(CellState.Hit));
    expect(cell.edges.material).toBe(pooledEdge(CellState.Hit));
  });

  // 13
  it('cancelAll clears all animations', () => {
    const c1: Coordinate = { col: 0, row: 0, depth: 0 };
    const c2: Coordinate = { col: 1, row: 0, depth: 0 };
    const c3: Coordinate = { col: 2, row: 0, depth: 0 };
    manager.playHitFlash(c1);
    manager.playMissFade(c2);
    manager.playSunkCascade([c3]);
    manager.cancelAll();
    expect(manager.isAnimating(c1)).toBe(false);
    expect(manager.isAnimating(c2)).toBe(false);
    expect(manager.isAnimating(c3)).toBe(false);
  });

  // 14
  it('isAnimating returns correct state', () => {
    expect(manager.isAnimating(coord)).toBe(false);
    manager.playHitFlash(coord);
    expect(manager.isAnimating(coord)).toBe(true);
    manager.cancelAt(coord);
    expect(manager.isAnimating(coord)).toBe(false);
  });

  // 15
  it('Duplicate animation on same cell cancels previous', () => {
    manager.playHitFlash(coord);
    const cell = getCell();
    const firstMaterial = cell.box.material;

    manager.playHitFlash(coord);
    const secondMaterial = cell.box.material;

    expect(secondMaterial).not.toBe(firstMaterial);
    // Still animating (new animation in place)
    expect(manager.isAnimating(coord)).toBe(true);
  });

  // 16
  it('dispose cleans up all materials', () => {
    const c1: Coordinate = { col: 0, row: 0, depth: 0 };
    const c2: Coordinate = { col: 1, row: 0, depth: 0 };
    manager.playHitFlash(c1);
    manager.playMissFade(c2);
    // dispose() must not throw and must clear all state
    expect(() => manager.dispose()).not.toThrow();
    expect(manager.isAnimating(c1)).toBe(false);
    expect(manager.isAnimating(c2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper used in test body (not imported — defined locally)
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
