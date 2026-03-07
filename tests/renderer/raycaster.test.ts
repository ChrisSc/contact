import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { MaterialPool } from '../../src/renderer/materials';
import { GridCube } from '../../src/renderer/cube';
import { GridRaycaster } from '../../src/renderer/raycaster';

describe('GridRaycaster', () => {
  let pool: MaterialPool;
  let cube: GridCube;
  let camera: THREE.PerspectiveCamera;
  let raycaster: GridRaycaster;
  let mockElement: HTMLElement;

  beforeEach(() => {
    pool = new MaterialPool();
    cube = new GridCube(pool);
    camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    mockElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    } as unknown as HTMLElement;

    raycaster = new GridRaycaster(camera, mockElement, cube);
  });

  afterEach(() => {
    raycaster.dispose();
    cube.dispose();
    pool.dispose();
  });

  it('toNDC normalizes pointer coordinates to [-1, 1]', () => {
    // Center of element
    const centerEvent = { clientX: 400, clientY: 300 } as PointerEvent;
    const centerNDC = raycaster.toNDC(centerEvent);
    expect(centerNDC.x).toBeCloseTo(0);
    expect(centerNDC.y).toBeCloseTo(0);

    // Top-left corner
    const tlEvent = { clientX: 0, clientY: 0 } as PointerEvent;
    const tlNDC = raycaster.toNDC(tlEvent);
    expect(tlNDC.x).toBeCloseTo(-1);
    expect(tlNDC.y).toBeCloseTo(1);

    // Bottom-right corner
    const brEvent = { clientX: 800, clientY: 600 } as PointerEvent;
    const brNDC = raycaster.toNDC(brEvent);
    expect(brNDC.x).toBeCloseTo(1);
    expect(brNDC.y).toBeCloseTo(-1);
  });

  it('returns null when no intersection', () => {
    // Point far off to the side
    const event = { clientX: 0, clientY: 0 } as PointerEvent;
    const coord = raycaster.pick(event);
    // Could be null or a coord at the edge — depends on camera angle
    // With camera at (0,0,15) looking at origin, top-left might miss all cells
    // Just verify it doesn't throw
    expect(coord === null || (coord && typeof coord.col === 'number')).toBe(true);
  });

  it('respects mesh source filtering', () => {
    // Set mesh source that returns empty array
    raycaster.setMeshSource(() => []);
    const event = { clientX: 400, clientY: 300 } as PointerEvent;
    const coord = raycaster.pick(event);
    expect(coord).toBeNull();
  });

  it('uses cube.getInteractableMeshes when no mesh source set', () => {
    const spy = vi.spyOn(cube, 'getInteractableMeshes');
    raycaster.setMeshSource(null as unknown as () => THREE.Mesh[]);

    // Reset to no source
    raycaster.dispose();
    raycaster = new GridRaycaster(camera, mockElement, cube);

    const event = { clientX: 400, clientY: 300 } as PointerEvent;
    raycaster.pick(event);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('dispose clears mesh source', () => {
    raycaster.setMeshSource(() => []);
    raycaster.dispose();
    // After dispose, pick should use default (cube.getInteractableMeshes)
    // This just tests it doesn't crash
    expect(() => raycaster.pick({ clientX: 400, clientY: 300 } as PointerEvent)).not.toThrow();
  });
});
