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
import { ViewManager } from '../../src/renderer/views';
import { GridRaycaster } from '../../src/renderer/raycaster';

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

  it('creates ViewManager and GridRaycaster', () => {
    expect(manager.views).toBeInstanceOf(ViewManager);
    expect(manager.raycaster).toBeInstanceOf(GridRaycaster);
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

  it('setViewMode delegates to ViewManager', () => {
    const spy = vi.spyOn(manager.views, 'setMode');
    manager.setViewMode('slice');
    expect(spy).toHaveBeenCalledWith('slice');
  });

  it('setDepth delegates to ViewManager', () => {
    const spy = vi.spyOn(manager.views, 'setDepth');
    manager.setDepth(3);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('setBoardType delegates to ViewManager', () => {
    const spy = vi.spyOn(manager.views, 'setBoardType');
    manager.setBoardType('own');
    expect(spy).toHaveBeenCalledWith('own');
  });

  it('dispose() cleans up all resources', () => {
    const rendererDispose = vi.spyOn(manager.renderer, 'dispose');
    const viewsDispose = vi.spyOn(manager.views, 'dispose');
    const raycasterDispose = vi.spyOn(manager.raycaster, 'dispose');
    manager.dispose();
    expect(rendererDispose).toHaveBeenCalled();
    expect(viewsDispose).toHaveBeenCalled();
    expect(raycasterDispose).toHaveBeenCalled();
  });

  it('onCellClick registers callback', () => {
    const cb = vi.fn();
    manager.onCellClick(cb);
    // Callback is stored — we can't easily trigger it without raycasting
    // but verify it doesn't throw
    expect(() => manager.onCellClick(cb)).not.toThrow();
  });

  it('onCellHover registers callback', () => {
    const cb = vi.fn();
    manager.onCellHover(cb);
    expect(() => manager.onCellHover(cb)).not.toThrow();
  });

  it('has animations property (AnimationManager)', () => {
    expect(manager.animations).toBeDefined();
  });

  it('animations.update called during render loop', () => {
    const spy = vi.spyOn(manager.animations, 'update');
    let capturedCallback: FrameRequestCallback | null = null;
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      // Capture the first callback; do not invoke immediately to avoid recursion
      if (!capturedCallback) capturedCallback = cb as FrameRequestCallback;
      return 1;
    });
    manager.start();
    // Invoke the captured loop callback exactly once
    capturedCallback!(performance.now() + 16);
    expect(spy).toHaveBeenCalled();
    manager.stop();
    rafSpy.mockRestore();
  });

  it('dispose calls animations.dispose', () => {
    const spy = vi.spyOn(manager.animations, 'dispose');
    manager.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
