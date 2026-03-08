import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CellState } from '../../src/types/grid';
import { MaterialPool, CRT_COLORS, MATERIAL_DEFS } from '../../src/renderer/materials';

describe('MaterialPool', () => {
  let pool: MaterialPool;

  beforeEach(() => {
    pool = new MaterialPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it('returns a MaterialSet for every CellState', () => {
    for (const state of Object.values(CellState)) {
      const set = pool.getMaterials(state);
      expect(set).toBeDefined();
      expect(set.fill).toBeDefined();
      expect(set.edge).toBeDefined();
    }
  });

  it('returns the same reference for the same state (pool reuse)', () => {
    const a = pool.getMaterials(CellState.Hit);
    const b = pool.getMaterials(CellState.Hit);
    expect(a).toBe(b);
    expect(a.fill).toBe(b.fill);
    expect(a.edge).toBe(b.edge);
  });

  it('returns different MaterialSets for different states', () => {
    const hit = pool.getMaterials(CellState.Hit);
    const miss = pool.getMaterials(CellState.Miss);
    expect(hit).not.toBe(miss);
    expect(hit.fill).not.toBe(miss.fill);
  });

  it('returns a distinct hover MaterialSet', () => {
    const hover = pool.getHoverMaterials();
    const empty = pool.getMaterials(CellState.Empty);
    expect(hover).not.toBe(empty);
    expect(hover.fill).not.toBe(empty.fill);
  });

  it('hover set returns same reference on repeated calls', () => {
    const a = pool.getHoverMaterials();
    const b = pool.getHoverMaterials();
    expect(a).toBe(b);
  });

  it('all fill materials have transparent: true and depthWrite: false', () => {
    for (const state of Object.values(CellState)) {
      const { fill } = pool.getMaterials(state);
      expect(fill.transparent).toBe(true);
      expect(fill.depthWrite).toBe(false);
    }
  });

  it('Hit materials use RED color', () => {
    const { fill, edge } = pool.getMaterials(CellState.Hit);
    expect(fill.color.getHex()).toBe(CRT_COLORS.RED);
    expect(edge.color.getHex()).toBe(CRT_COLORS.RED);
  });

  it('Empty fill has opacity 0', () => {
    const { fill } = pool.getMaterials(CellState.Empty);
    expect(fill.opacity).toBe(0);
  });

  it('getDimmedMaterials returns a MaterialSet for every CellState', () => {
    for (const state of Object.values(CellState)) {
      const set = pool.getDimmedMaterials(state);
      expect(set).toBeDefined();
      expect(set.fill).toBeDefined();
      expect(set.edge).toBeDefined();
    }
  });

  it('getDimmedMaterials returns different references from normal pool', () => {
    const normal = pool.getMaterials(CellState.Hit);
    const dimmed = pool.getDimmedMaterials(CellState.Hit);
    expect(dimmed).not.toBe(normal);
    expect(dimmed.fill).not.toBe(normal.fill);
  });

  it('dimmed materials have lower opacity than normal', () => {
    const normal = pool.getMaterials(CellState.Ship);
    const dimmed = pool.getDimmedMaterials(CellState.Ship);
    expect(dimmed.fill.opacity).toBeLessThan(normal.fill.opacity);
    expect(dimmed.edge.opacity).toBeLessThan(normal.edge.opacity);
  });

  it('getGhostMaterials returns a MaterialSet for every CellState', () => {
    for (const state of Object.values(CellState)) {
      const set = pool.getGhostMaterials(state);
      expect(set).toBeDefined();
      expect(set.fill).toBeDefined();
    }
  });

  it('ghost materials have lower opacity than dimmed', () => {
    const dimmed = pool.getDimmedMaterials(CellState.Ship);
    const ghost = pool.getGhostMaterials(CellState.Ship);
    expect(ghost.fill.opacity).toBeLessThan(dimmed.fill.opacity);
  });

  it('setDimOpacity scales dimmed pool opacities', () => {
    const before = pool.getDimmedMaterials(CellState.Ship).fill.opacity;
    pool.setDimOpacity(0.5);
    const after = pool.getDimmedMaterials(CellState.Ship).fill.opacity;
    expect(after).toBeCloseTo(before * 0.5);
  });

  it('setGhostOpacity scales ghost pool opacities', () => {
    const before = pool.getGhostMaterials(CellState.Ship).fill.opacity;
    pool.setGhostOpacity(0.5);
    const after = pool.getGhostMaterials(CellState.Ship).fill.opacity;
    expect(after).toBeCloseTo(before * 0.5);
  });

  it('dispose() does not throw', () => {
    expect(() => pool.dispose()).not.toThrow();
  });

  it('dispose cleans up dimmed and ghost pools', () => {
    // Just verify dispose doesn't throw with all pools
    const pool2 = new MaterialPool();
    pool2.getDimmedMaterials(CellState.Hit);
    pool2.getGhostMaterials(CellState.Hit);
    expect(() => pool2.dispose()).not.toThrow();
  });

  it('CRT_COLORS.CYAN exists and equals 0x33ffcc', () => {
    expect(CRT_COLORS.CYAN).toBe(0x33ffcc);
  });

  it('DronePositive materials use CYAN color', () => {
    const { fill, edge } = pool.getMaterials(CellState.DronePositive);
    expect(fill.color.getHex()).toBe(CRT_COLORS.CYAN);
    expect(edge.color.getHex()).toBe(CRT_COLORS.CYAN);
  });

  it('SonarPositive materials use CYAN color', () => {
    const { fill, edge } = pool.getMaterials(CellState.SonarPositive);
    expect(fill.color.getHex()).toBe(CRT_COLORS.CYAN);
    expect(edge.color.getHex()).toBe(CRT_COLORS.CYAN);
  });

  it('MATERIAL_DEFS is exported and contains all CellState keys', () => {
    for (const state of Object.values(CellState)) {
      expect(MATERIAL_DEFS[state]).toBeDefined();
      expect(MATERIAL_DEFS[state].fillColor).toBeTypeOf('number');
      expect(MATERIAL_DEFS[state].edgeColor).toBeTypeOf('number');
    }
  });
});
