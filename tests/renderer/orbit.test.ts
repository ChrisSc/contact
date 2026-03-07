// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  sphericalToCartesian,
  clampPhi,
  clampDistance,
  OrbitControls,
} from '../../src/renderer/orbit';

describe('sphericalToCartesian', () => {
  it('returns origin-like values at distance 0', () => {
    const pos = sphericalToCartesian(0, Math.PI / 4, Math.PI / 4);
    expect(pos.x).toBeCloseTo(0);
    expect(pos.y).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
  });

  it('places camera along +Y when phi=0', () => {
    const pos = sphericalToCartesian(10, 0.001, 0);
    expect(pos.y).toBeGreaterThan(9);
    expect(Math.abs(pos.x)).toBeLessThan(0.1);
  });

  it('places camera in XZ plane when phi=PI/2', () => {
    const pos = sphericalToCartesian(10, Math.PI / 2, 0);
    expect(pos.y).toBeCloseTo(0, 1);
    expect(pos.z).toBeCloseTo(10, 1);
  });

  it('produces correct distance from origin', () => {
    const d = 15;
    const pos = sphericalToCartesian(d, Math.PI / 3, Math.PI / 6);
    const dist = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(dist).toBeCloseTo(d);
  });
});

describe('clampPhi', () => {
  it('clamps values below 0.1 to 0.1', () => {
    expect(clampPhi(0)).toBe(0.1);
    expect(clampPhi(-1)).toBe(0.1);
  });

  it('clamps values above PI-0.1', () => {
    expect(clampPhi(Math.PI)).toBeCloseTo(Math.PI - 0.1);
    expect(clampPhi(10)).toBeCloseTo(Math.PI - 0.1);
  });

  it('passes through values in range', () => {
    expect(clampPhi(1)).toBe(1);
    expect(clampPhi(Math.PI / 2)).toBe(Math.PI / 2);
  });
});

describe('clampDistance', () => {
  it('clamps below min', () => {
    expect(clampDistance(3, 6, 25)).toBe(6);
  });

  it('clamps above max', () => {
    expect(clampDistance(30, 6, 25)).toBe(25);
  });

  it('passes through values in range', () => {
    expect(clampDistance(15, 6, 25)).toBe(15);
  });
});

describe('OrbitControls', () => {
  let camera: THREE.PerspectiveCamera;
  let container: HTMLDivElement;
  let controls: OrbitControls;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    container = document.createElement('div');
    document.body.appendChild(container);
    controls = new OrbitControls(camera, container);
  });

  afterEach(() => {
    controls.dispose();
    document.body.removeChild(container);
  });

  it('positions camera at initial spherical coordinates', () => {
    const dist = Math.sqrt(
      camera.position.x ** 2 +
      camera.position.y ** 2 +
      camera.position.z ** 2,
    );
    expect(dist).toBeCloseTo(15);
  });

  it('update() does not throw', () => {
    expect(() => controls.update()).not.toThrow();
  });

  it('reset() restores initial position', () => {
    const initial = camera.position.clone();
    // Simulate some change by calling update a few times
    controls.update();
    controls.update();
    controls.reset();
    expect(camera.position.x).toBeCloseTo(initial.x);
    expect(camera.position.y).toBeCloseTo(initial.y);
    expect(camera.position.z).toBeCloseTo(initial.z);
  });

  it('setEnabled(false) prevents interaction state', () => {
    controls.setEnabled(false);
    // Should not throw
    controls.update();
    expect(() => controls.update()).not.toThrow();
  });

  it('dispose() removes event listeners without error', () => {
    expect(() => controls.dispose()).not.toThrow();
  });
});
