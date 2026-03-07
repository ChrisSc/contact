import * as THREE from 'three';
import type { Coordinate } from '../types/grid';
import type { GridCube } from './cube';

export class GridRaycaster {
  private raycaster: THREE.Raycaster;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private cube: GridCube;
  private meshSource: (() => THREE.Mesh[]) | null = null;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, cube: GridCube) {
    this.raycaster = new THREE.Raycaster();
    this.camera = camera;
    this.domElement = domElement;
    this.cube = cube;
  }

  setMeshSource(fn: () => THREE.Mesh[]): void {
    this.meshSource = fn;
  }

  pick(event: PointerEvent): Coordinate | null {
    const ndc = this.toNDC(event);
    this.raycaster.setFromCamera(ndc, this.camera);

    const meshes = this.meshSource ? this.meshSource() : this.cube.getInteractableMeshes();
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) return null;

    return this.cube.coordFromMesh(intersects[0]!.object);
  }

  toNDC(event: PointerEvent): THREE.Vector2 {
    const rect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  dispose(): void {
    this.meshSource = null;
  }
}
