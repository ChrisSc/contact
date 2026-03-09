import * as THREE from 'three';
import type { Coordinate, Grid } from '../types/grid';
import { MaterialPool, CRT_COLORS } from './materials';
import type { CellMesh } from './cube';
import { GridCube } from './cube';
import { OrbitControls } from './orbit';
import { ViewManager } from './views';
import type { ViewMode, BoardType } from './views';
import { GridRaycaster } from './raycaster';
import { AnimationManager } from './animations';
import { getLogger } from '../observability/logger';

export interface SceneConfig {
  container: HTMLElement;
}

interface GhostEntry {
  cell: CellMesh;
  origFill: THREE.Material;
  origEdge: THREE.Material;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitControls;
  readonly cube: GridCube;
  readonly materialPool: MaterialPool;
  readonly views: ViewManager;
  readonly animations: AnimationManager;
  readonly raycaster: GridRaycaster;

  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver;
  private container: HTMLElement;
  private lastTime = 0;

  private shakeTimeRemaining = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;

  private cellClickCallbacks: ((coord: Coordinate) => void)[] = [];
  private cellHoverCallbacks: ((coord: Coordinate | null) => void)[] = [];

  private ghostEntries: GhostEntry[] = [];
  private ghostValidMat: THREE.MeshBasicMaterial;
  private ghostValidEdge: THREE.LineBasicMaterial;
  private ghostInvalidMat: THREE.MeshBasicMaterial;
  private ghostInvalidEdge: THREE.LineBasicMaterial;

  private srOverlayEntries: GhostEntry[] = [];
  private srOverlayMat: THREE.MeshBasicMaterial;
  private srOverlayEdge: THREE.LineBasicMaterial;

  private friendlyOverlayEntries: GhostEntry[] = [];
  private friendlyOverlayMat: THREE.MeshBasicMaterial;
  private friendlyOverlayEdge: THREE.LineBasicMaterial;

  private boundOnClick: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;

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

    this.ghostValidMat = new THREE.MeshBasicMaterial({ color: CRT_COLORS.GREEN, transparent: true, opacity: 0.3, depthWrite: false });
    this.ghostValidEdge = new THREE.LineBasicMaterial({ color: CRT_COLORS.GREEN, transparent: true, opacity: 0.7 });
    this.ghostInvalidMat = new THREE.MeshBasicMaterial({ color: CRT_COLORS.RED, transparent: true, opacity: 0.3, depthWrite: false });
    this.ghostInvalidEdge = new THREE.LineBasicMaterial({ color: CRT_COLORS.RED, transparent: true, opacity: 0.7 });

    this.srOverlayMat = new THREE.MeshBasicMaterial({ color: CRT_COLORS.CYAN, transparent: true, opacity: 0.2, depthWrite: false });
    this.srOverlayEdge = new THREE.LineBasicMaterial({ color: CRT_COLORS.CYAN, transparent: true, opacity: 0.4 });

    this.friendlyOverlayMat = new THREE.MeshBasicMaterial({ color: CRT_COLORS.GREEN, transparent: true, opacity: 0.3, depthWrite: false });
    this.friendlyOverlayEdge = new THREE.LineBasicMaterial({ color: CRT_COLORS.GREEN, transparent: true, opacity: 0.6 });

    this.views = new ViewManager(this.cube, this.materialPool);
    this.animations = new AnimationManager(this.cube, this.materialPool);
    this.raycaster = new GridRaycaster(this.camera, this.renderer.domElement, this.cube);
    this.raycaster.setMeshSource(() => this.views.getInteractableMeshes());

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    config.container.appendChild(canvas);

    this.orbit = new OrbitControls(this.camera, canvas);

    this.boundOnClick = this.handleClick.bind(this);
    this.boundOnPointerMove = this.handlePointerMove.bind(this);
    canvas.addEventListener('click', this.boundOnClick as EventListener);
    canvas.addEventListener('pointermove', this.boundOnPointerMove);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(config.container);

    try {
      getLogger().emit('view.change', { view: '3d', action: 'scene_init' });
    } catch {
      // Logger may not be initialized
    }
  }

  private handleClick(e: PointerEvent): void {
    if (this.orbit.wasDragging) {
      this.orbit.consumeDrag();
      return;
    }

    const coord = this.raycaster.pick(e);
    if (coord) {
      for (const cb of this.cellClickCallbacks) {
        cb(coord);
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    // Suppress hover during orbit drag
    if (this.orbit.dragging) {
      for (const cb of this.cellHoverCallbacks) {
        cb(null);
      }
      return;
    }

    const coord = this.raycaster.pick(e);
    for (const cb of this.cellHoverCallbacks) {
      cb(coord);
    }
  }

  onCellClick(cb: (coord: Coordinate) => void): void {
    this.cellClickCallbacks.push(cb);
  }

  onCellHover(cb: (coord: Coordinate | null) => void): void {
    this.cellHoverCallbacks.push(cb);
  }

  setViewMode(mode: ViewMode): void {
    this.views.setMode(mode);
  }

  setDepth(depth: number | null): void {
    this.views.setDepth(depth);
  }

  setBoardType(type: BoardType): void {
    this.views.setBoardType(type);
  }

  setGhostCells(coords: Coordinate[], valid: boolean): void {
    this.clearGhostCells();
    const fillMat = valid ? this.ghostValidMat : this.ghostInvalidMat;
    const edgeMat = valid ? this.ghostValidEdge : this.ghostInvalidEdge;
    for (const coord of coords) {
      const cell = this.cube.getCellMesh(coord);
      if (cell) {
        this.ghostEntries.push({
          cell,
          origFill: cell.box.material as THREE.Material,
          origEdge: cell.edges.material as THREE.Material,
        });
        cell.box.material = fillMat;
        cell.edges.material = edgeMat;
      }
    }
  }

  clearGhostCells(): void {
    for (const entry of this.ghostEntries) {
      entry.cell.box.material = entry.origFill;
      entry.cell.edges.material = entry.origEdge;
    }
    this.ghostEntries.length = 0;
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    this.lastTime = performance.now();
    const loop = (now: number): void => {
      this.animationFrameId = requestAnimationFrame(loop);
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.views.update(dt);
      this.animations.update(dt);
      this.orbit.update();
      if (this.shakeTimeRemaining > 0) {
        this.shakeTimeRemaining -= dt;
        const progress = Math.max(0, this.shakeTimeRemaining / this.shakeDuration);
        const decay = progress * progress; // quadratic decay
        const offset = this.shakeIntensity * decay;
        this.camera.position.x += (Math.random() - 0.5) * 2 * offset;
        this.camera.position.y += (Math.random() - 0.5) * 2 * offset;
        this.camera.position.z += (Math.random() - 0.5) * 2 * offset;
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  updateGrid(grid: Grid): void {
    this.clearGhostCells();
    this.clearFriendlyFleetOverlay();
    this.cube.updateFromGrid(grid);
    this.views.applyView(grid);
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

  playHitAnimation(coord: Coordinate): void {
    this.animations.playHitFlash(coord);
  }

  playSunkAnimation(coords: Coordinate[]): void {
    this.animations.playSunkCascade(coords);
  }

  playMissAnimation(coord: Coordinate): void {
    this.animations.playMissFade(coord);
  }

  playSonarAnimation(coord: Coordinate, positive: boolean): void {
    this.animations.playSonarSweep(coord, positive);
  }

  playSonarScanAnimation(cells: Array<{coord: Coordinate; displayedResult: boolean}>): void {
    for (const cell of cells) {
      this.animations.playSonarSweep(cell.coord, cell.displayedResult);
    }
  }

  playDroneScanAnimation(cells: Array<{coord: Coordinate; displayedResult: boolean}>): void {
    this.animations.playDroneScan(cells.map(c => ({coord: c.coord, positive: c.displayedResult})));
  }

  playDepthChargeAnimation(center: Coordinate, results: Array<{coord: Coordinate; hit: boolean}>): void {
    this.animations.playDepthChargeBlast(center, results);
  }

  playGSonarScanAnimation(cells: Array<{coord: Coordinate; displayedResult: boolean}>): void {
    this.animations.playGSonarScan(cells.map(c => ({coord: c.coord, positive: c.displayedResult})));
  }

  playScreenShake(intensity = 0.15, duration = 0.25): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimeRemaining = duration;
    try {
      getLogger().emit('view.change', { action: 'screen_shake', intensity, duration });
    } catch {
      // Logger may not be initialized
    }
  }

  setSilentRunningOverlay(coords: Coordinate[]): void {
    this.clearSilentRunningOverlay();
    for (const coord of coords) {
      const cell = this.cube.getCellMesh(coord);
      if (cell) {
        this.srOverlayEntries.push({
          cell,
          origFill: cell.box.material as THREE.Material,
          origEdge: cell.edges.material as THREE.Material,
        });
        cell.box.material = this.srOverlayMat;
        cell.edges.material = this.srOverlayEdge;
      }
    }
  }

  clearSilentRunningOverlay(): void {
    for (const entry of this.srOverlayEntries) {
      entry.cell.box.material = entry.origFill;
      entry.cell.edges.material = entry.origEdge;
    }
    this.srOverlayEntries.length = 0;
  }

  setFriendlyFleetOverlay(coords: Coordinate[]): void {
    this.clearFriendlyFleetOverlay();
    for (const coord of coords) {
      const cell = this.cube.getCellMesh(coord);
      if (cell) {
        this.friendlyOverlayEntries.push({
          cell,
          origFill: cell.box.material as THREE.Material,
          origEdge: cell.edges.material as THREE.Material,
        });
        cell.box.material = this.friendlyOverlayMat;
        cell.edges.material = this.friendlyOverlayEdge;
      }
    }
  }

  clearFriendlyFleetOverlay(): void {
    for (const entry of this.friendlyOverlayEntries) {
      entry.cell.box.material = entry.origFill;
      entry.cell.edges.material = entry.origEdge;
    }
    this.friendlyOverlayEntries.length = 0;
  }

  dispose(): void {
    this.stop();
    this.clearGhostCells();
    this.clearSilentRunningOverlay();
    this.clearFriendlyFleetOverlay();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('click', this.boundOnClick as EventListener);
    canvas.removeEventListener('pointermove', this.boundOnPointerMove);

    this.ghostValidMat.dispose();
    this.ghostValidEdge.dispose();
    this.ghostInvalidMat.dispose();
    this.ghostInvalidEdge.dispose();
    this.srOverlayMat.dispose();
    this.srOverlayEdge.dispose();
    this.friendlyOverlayMat.dispose();
    this.friendlyOverlayEdge.dispose();

    this.animations.dispose();
    this.views.dispose();
    this.raycaster.dispose();
    this.orbit.dispose();
    this.cube.dispose();
    this.materialPool.dispose();
    this.renderer.dispose();
    this.resizeObserver.disconnect();

    this.cellClickCallbacks.length = 0;
    this.cellHoverCallbacks.length = 0;

    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }
}
