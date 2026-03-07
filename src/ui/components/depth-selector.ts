import { DEPTH_LABELS } from '../../types/grid';
import { getLogger } from '../../observability/logger';

export interface DepthSelectorOptions {
  onDepthChange: (depth: number) => void;
  initialDepth?: number;
}

export class DepthSelector {
  private el: HTMLElement;
  private activeDepth: number;
  private buttons: HTMLButtonElement[] = [];
  private onDepthChange: (depth: number) => void;

  constructor(options: DepthSelectorOptions) {
    this.activeDepth = options.initialDepth ?? 0;
    this.onDepthChange = options.onDepthChange;
    this.el = document.createElement('div');
    this.el.className = 'depth-selector';
    this.buildButtons();
  }

  private buildButtons(): void {
    for (let i = 0; i < DEPTH_LABELS.length; i++) {
      const btn = document.createElement('button');
      btn.className = 'depth-selector__btn';
      btn.textContent = DEPTH_LABELS[i]!;
      btn.dataset.depth = String(i);
      if (i === this.activeDepth) {
        btn.classList.add('depth-selector__btn--active');
      }
      this.buttons.push(btn);
      this.el.appendChild(btn);
    }

    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.dataset.depth !== undefined) {
        this.setActive(Number(target.dataset.depth));
      }
    });
  }

  setActive(depth: number): void {
    this.activeDepth = depth;
    for (const btn of this.buttons) {
      btn.classList.toggle(
        'depth-selector__btn--active',
        Number(btn.dataset.depth) === depth,
      );
    }
    getLogger().emit('view.slice', { depth });
    this.onDepthChange(depth);
  }

  getActive(): number {
    return this.activeDepth;
  }

  render(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    this.el.remove();
  }
}
