import * as THREE from 'three';
import type { Grid } from '../types/grid';
import { MaterialPool, CRT_COLORS } from './materials';
import { GridCube } from './cube';
import { OrbitControls } from './orbit';
import { getLogger } from '../observability/logger';

export interface SceneConfig {
  container: HTMLElement;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitControls;
  readonly cube: GridCube;
  readonly materialPool: MaterialPool;

  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver;
  private container: HTMLElement;

  constructor(config: SceneConfig) {
    this.container = config.container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(CRT_COLORS.BG);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const width = config.container.clientWidth || 800;
    const height = config.container.clientHeight || 600;
    this.renderer.setSize(width, height);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(CRT_COLORS.BG, 0.02);

    this.materialPool = new MaterialPool();
    this.cube = new GridCube(this.materialPool);
    this.scene.add(this.cube.root);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    config.container.appendChild(canvas);

    this.orbit = new OrbitControls(this.camera, canvas);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(config.container);

    try {
      getLogger().emit('view.change', { view: '3d', action: 'scene_init' });
    } catch {
      // Logger may not be initialized
    }
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    const loop = (): void => {
      this.animationFrameId = requestAnimationFrame(loop);
      this.orbit.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  updateGrid(grid: Grid): void {
    this.cube.updateFromGrid(grid);
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  dispose(): void {
    this.stop();
    this.orbit.dispose();
    this.cube.dispose();
    this.materialPool.dispose();
    this.renderer.dispose();
    this.resizeObserver.disconnect();

    const canvas = this.renderer.domElement;
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }
}
