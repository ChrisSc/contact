// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';

// Mock WebGLRenderer since jsdom has no WebGL
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof THREE>('three');
  const mockCanvas = () => {
    const c = document.createElement('canvas');
    c.getContext = () => null;
    return c;
  };
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement = mockCanvas();
      setClearColor = vi.fn();
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = vi.fn();
    },
  };
});

import { SceneManager } from '../../src/renderer/scene';

// Polyfill ResizeObserver for jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('SceneManager', () => {
  let container: HTMLDivElement;
  let manager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);
    manager = new SceneManager({ container });
  });

  afterEach(() => {
    manager.dispose();
    if (container.parentElement) {
      document.body.removeChild(container);
    }
  });

  it('creates scene with all sub-components', () => {
    expect(manager.scene).toBeInstanceOf(THREE.Scene);
    expect(manager.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(manager.cube).toBeDefined();
    expect(manager.orbit).toBeDefined();
    expect(manager.materialPool).toBeDefined();
  });

  it('appends canvas to container', () => {
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('cube root is added to scene', () => {
    expect(manager.scene.children).toContain(manager.cube.root);
  });

  it('start() and stop() manage animation frame', () => {
    const spy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    manager.start();
    expect(spy).toHaveBeenCalled();

    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    manager.stop();
    expect(cancelSpy).toHaveBeenCalledWith(expect.any(Number));

    spy.mockRestore();
    cancelSpy.mockRestore();
  });

  it('dispose() cleans up all resources', () => {
    const rendererDispose = vi.spyOn(manager.renderer, 'dispose');
    manager.dispose();
    expect(rendererDispose).toHaveBeenCalled();
  });
});
