import type { PlacementAxis } from '../../types/fleet';

const AXES: { key: PlacementAxis; label: string }[] = [
  { key: 'col', label: 'COL' },
  { key: 'row', label: 'ROW' },
  { key: 'diag+', label: 'DIAG\u2197' },
  { key: 'diag-', label: 'DIAG\u2198' },
  { key: 'col-depth', label: 'COL+D' },
  { key: 'col-depth-', label: 'COL-D' },
  { key: 'row-depth', label: 'ROW+D' },
  { key: 'row-depth-', label: 'ROW-D' },
];

export interface AxisSelectorOptions {
  onAxisChange: (axis: PlacementAxis) => void;
  initialAxis?: PlacementAxis;
}

export class AxisSelector {
  private el: HTMLElement;
  private activeAxis: PlacementAxis;
  private buttons: HTMLButtonElement[] = [];
  private onAxisChange: (axis: PlacementAxis) => void;

  constructor(options: AxisSelectorOptions) {
    this.activeAxis = options.initialAxis ?? 'col';
    this.onAxisChange = options.onAxisChange;
    this.el = document.createElement('div');
    this.el.className = 'axis-selector';
    this.buildButtons();
  }

  private buildButtons(): void {
    for (const { key, label } of AXES) {
      const btn = document.createElement('button');
      btn.className = 'axis-selector__btn';
      btn.textContent = label;
      btn.dataset.axis = key;
      if (key === this.activeAxis) {
        btn.classList.add('axis-selector__btn--active');
      }
      this.buttons.push(btn);
      this.el.appendChild(btn);
    }

    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.axis) {
        this.setActive(target.dataset.axis as PlacementAxis);
      }
    });
  }

  setActive(axis: PlacementAxis): void {
    this.activeAxis = axis;
    for (const btn of this.buttons) {
      btn.classList.toggle(
        'axis-selector__btn--active',
        btn.dataset.axis === axis,
      );
    }
    this.onAxisChange(axis);
  }

  getActive(): PlacementAxis {
    return this.activeAxis;
  }

  render(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    this.el.remove();
  }
}
