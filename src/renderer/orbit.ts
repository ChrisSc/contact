import * as THREE from 'three';
import { getLogger } from '../observability/logger';

export interface OrbitConfig {
  minDistance: number;
  maxDistance: number;
  damping: number;
  rotateSpeed: number;
  zoomSpeed: number;
  initialDistance: number;
  initialPhi: number;
  initialTheta: number;
}

const DEFAULT_CONFIG: OrbitConfig = {
  minDistance: 6,
  maxDistance: 25,
  damping: 0.92,
  rotateSpeed: 0.005,
  zoomSpeed: 0.1,
  initialDistance: 15,
  initialPhi: Math.PI / 4,
  initialTheta: Math.PI / 4,
};

export function sphericalToCartesian(
  distance: number,
  phi: number,
  theta: number,
): { x: number; y: number; z: number } {
  return {
    x: distance * Math.sin(phi) * Math.sin(theta),
    y: distance * Math.cos(phi),
    z: distance * Math.sin(phi) * Math.cos(theta),
  };
}

export function clampPhi(phi: number): number {
  return Math.max(0.1, Math.min(Math.PI - 0.1, phi));
}

export function clampDistance(
  distance: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, distance));
}

export class OrbitControls {
  private config: OrbitConfig;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private enabled = true;

  private theta: number;
  private phi: number;
  private distance: number;
  private velocityTheta = 0;
  private velocityPhi = 0;

  private isDragging = false;
  private previousPointer = { x: 0, y: 0 };
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private lastPinchDistance = 0;

  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    config?: Partial<OrbitConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.camera = camera;
    this.domElement = domElement;

    this.theta = this.config.initialTheta;
    this.phi = this.config.initialPhi;
    this.distance = this.config.initialDistance;

    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);

    domElement.style.touchAction = 'none';
    domElement.addEventListener('pointerdown', this.boundOnPointerDown);
    domElement.addEventListener('pointermove', this.boundOnPointerMove);
    domElement.addEventListener('pointerup', this.boundOnPointerUp);
    domElement.addEventListener('pointercancel', this.boundOnPointerUp);
    domElement.addEventListener('wheel', this.boundOnWheel, { passive: false });

    this.updateCamera();
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.previousPointer = { x: e.clientX, y: e.clientY };
      this.velocityTheta = 0;
      this.velocityPhi = 0;
    } else if (this.activePointers.size === 2) {
      this.lastPinchDistance = this.getPinchDistance();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2) {
      const pinchDist = this.getPinchDistance();
      const delta = pinchDist - this.lastPinchDistance;
      this.distance = clampDistance(
        this.distance - delta * this.config.zoomSpeed * 0.1,
        this.config.minDistance,
        this.config.maxDistance,
      );
      this.lastPinchDistance = pinchDist;
      return;
    }

    if (!this.isDragging || this.activePointers.size !== 1) return;

    const dx = e.clientX - this.previousPointer.x;
    const dy = e.clientY - this.previousPointer.y;

    this.velocityTheta = -dx * this.config.rotateSpeed;
    this.velocityPhi = -dy * this.config.rotateSpeed;

    this.previousPointer = { x: e.clientX, y: e.clientY };
  }

  private onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0 && this.isDragging) {
      this.isDragging = false;
      try {
        getLogger().emit('view.rotate', {
          theta: this.theta,
          phi: this.phi,
          distance: this.distance,
        });
      } catch {
        // Logger may not be initialized in tests
      }
    }

    if (this.activePointers.size === 1) {
      const remaining = this.activePointers.values().next().value!;
      this.previousPointer = { x: remaining.x, y: remaining.y };
      this.isDragging = true;
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    this.distance = clampDistance(
      this.distance + delta * this.config.zoomSpeed * this.distance * 0.1,
      this.config.minDistance,
      this.config.maxDistance,
    );
  }

  private getPinchDistance(): number {
    const pointers = [...this.activePointers.values()];
    if (pointers.length < 2) return 0;
    const dx = pointers[0]!.x - pointers[1]!.x;
    const dy = pointers[0]!.y - pointers[1]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private updateCamera(): void {
    const pos = sphericalToCartesian(this.distance, this.phi, this.theta);
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(0, 0, 0);
  }

  update(): void {
    if (!this.isDragging) {
      this.velocityTheta *= this.config.damping;
      this.velocityPhi *= this.config.damping;
    }

    this.theta += this.velocityTheta;
    this.phi = clampPhi(this.phi + this.velocityPhi);

    this.updateCamera();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.isDragging = false;
      this.activePointers.clear();
      this.velocityTheta = 0;
      this.velocityPhi = 0;
    }
  }

  reset(): void {
    this.theta = this.config.initialTheta;
    this.phi = this.config.initialPhi;
    this.distance = this.config.initialDistance;
    this.velocityTheta = 0;
    this.velocityPhi = 0;
    this.updateCamera();
  }

  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.domElement.removeEventListener('pointermove', this.boundOnPointerMove);
    this.domElement.removeEventListener('pointerup', this.boundOnPointerUp);
    this.domElement.removeEventListener('pointercancel', this.boundOnPointerUp);
    this.domElement.removeEventListener('wheel', this.boundOnWheel);
    this.activePointers.clear();
  }
}
