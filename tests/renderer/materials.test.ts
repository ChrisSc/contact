import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CellState } from '../../src/types/grid';
import { MaterialPool, CRT_COLORS } from '../../src/renderer/materials';

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

  it('dispose() does not throw', () => {
    expect(() => pool.dispose()).not.toThrow();
  });
});
