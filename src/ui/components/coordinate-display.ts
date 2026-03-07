import type { Coordinate } from '../../types/grid';
import { formatCoordinate } from '../../engine/grid';

export class CoordinateDisplay {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'coordinate-display';
    this.el.textContent = '\u00a0';
  }

  render(): HTMLElement {
    return this.el;
  }

  update(coord: Coordinate | null): void {
    this.el.textContent = coord ? formatCoordinate(coord) : '\u00a0';
  }

  destroy(): void {
    this.el.remove();
  }
}
