import type { ViewMode } from '../../renderer/views';
import type { PlacementAxis } from '../../types/fleet';
import { GRID_SIZE } from '../../types/grid';

export interface ToolPaletteConfig {
  showAxis: boolean;
  initialViewMode: ViewMode;
  initialDepth: number | null;       // null = ALL
  initialAxis?: PlacementAxis;
  onViewModeChange: (mode: ViewMode) => void;
  onDepthChange: (depth: number) => void;   // -1 = ALL
  onAxisChange?: (axis: PlacementAxis) => void;
}

interface ViewButtonDef {
  mode: ViewMode;
  label: string;
}

interface AxisButtonDef {
  axis: PlacementAxis;
  label: string;
}

const VIEW_BUTTONS: readonly ViewButtonDef[] = [
  { mode: 'cube',  label: 'CUBE'  },
  { mode: 'slice', label: 'SLICE' },
  { mode: 'xray',  label: 'X-RAY' },
];

const AXIS_BUTTONS: readonly AxisButtonDef[] = [
  { axis: 'col',        label: 'ROW'  },
  { axis: 'row',        label: 'COL'  },
  { axis: 'diag+',      label: 'DG\u2197' },
  { axis: 'diag-',      label: 'DG\u2198' },
  { axis: 'col-depth',  label: 'R+D'  },
  { axis: 'col-depth-', label: 'R-D'  },
  { axis: 'row-depth',  label: 'C+D'  },
  { axis: 'row-depth-', label: 'C-D'  },
];

export class ToolPalette {
  private el: HTMLElement;
  private config: ToolPaletteConfig;

  private viewButtons: Map<ViewMode, HTMLButtonElement> = new Map();
  private depthButtons: Map<number, HTMLButtonElement> = new Map();
  private axisButtons: Map<PlacementAxis, HTMLButtonElement> = new Map();

  constructor(config: ToolPaletteConfig) {
    this.config = config;
    this.el = document.createElement('div');
    this.el.className = 'tool-palette';
    this.build();
  }

  private build(): void {
    // -- VIEW row --
    const viewRow = this.makeRow();
    viewRow.appendChild(this.makeLabel('VIEW'));
    for (const def of VIEW_BUTTONS) {
      const btn = this.makeBtn(def.label);
      btn.dataset.mode = def.mode;
      btn.addEventListener('click', () => {
        this.setActiveViewMode(def.mode);
        this.config.onViewModeChange(def.mode);
      });
      this.viewButtons.set(def.mode, btn);
      viewRow.appendChild(btn);
    }
    this.el.appendChild(viewRow);

    // -- separator --
    this.el.appendChild(this.makeSeparator());

    // -- DEPTH row --
    const depthRow = this.makeRow();
    depthRow.appendChild(this.makeLabel('DEPTH'));

    // ALL button: data-depth = -1
    const allBtn = this.makeBtn('ALL');
    allBtn.dataset.depth = '-1';
    allBtn.addEventListener('click', () => {
      this.setActiveDepth(null);
      this.config.onDepthChange(-1);
    });
    this.depthButtons.set(-1, allBtn);
    depthRow.appendChild(allBtn);

    // Numbered depth buttons: 1..GRID_SIZE displayed, data-depth = 0-based index
    for (let i = 0; i < GRID_SIZE; i++) {
      const btn = this.makeBtn(String(i + 1));
      btn.dataset.depth = String(i);
      const depth = i;
      btn.addEventListener('click', () => {
        this.setActiveDepth(depth);
        this.config.onDepthChange(depth);
      });
      this.depthButtons.set(i, btn);
      depthRow.appendChild(btn);
    }
    this.el.appendChild(depthRow);

    // -- AXIS section (conditional) --
    if (this.config.showAxis) {
      this.el.appendChild(this.makeSeparator());

      const axisRow = this.makeRow();
      axisRow.classList.add('tool-palette__row--wrap');
      axisRow.appendChild(this.makeLabel('AXIS'));

      for (const def of AXIS_BUTTONS) {
        const btn = this.makeBtn(def.label);
        btn.dataset.axis = def.axis;
        btn.addEventListener('click', () => {
          this.setActiveAxis(def.axis);
          if (this.config.onAxisChange) {
            this.config.onAxisChange(def.axis);
          }
        });
        this.axisButtons.set(def.axis, btn);
        axisRow.appendChild(btn);
      }
      this.el.appendChild(axisRow);
    }

    // Apply initial active states
    this.setActiveViewMode(this.config.initialViewMode);
    this.setActiveDepth(this.config.initialDepth);
    if (this.config.showAxis && this.config.initialAxis !== undefined) {
      this.setActiveAxis(this.config.initialAxis);
    }
  }

  // -- Element factories --

  private makeRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tool-palette__row';
    return row;
  }

  private makeLabel(text: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'tool-palette__label';
    span.textContent = text;
    return span;
  }

  private makeSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'tool-palette__separator';
    return sep;
  }

  private makeBtn(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'tool-palette__btn';
    btn.textContent = label;
    return btn;
  }

  // -- Public API --

  getElement(): HTMLElement {
    return this.el;
  }

  setActiveViewMode(mode: ViewMode): void {
    for (const [key, btn] of this.viewButtons) {
      btn.classList.toggle('tool-palette__btn--active', key === mode);
    }
  }

  setActiveDepth(depth: number | null): void {
    // null means ALL, which is stored under key -1
    const key = depth === null ? -1 : depth;
    for (const [k, btn] of this.depthButtons) {
      btn.classList.toggle('tool-palette__btn--active', k === key);
    }
  }

  setActiveAxis(axis: PlacementAxis): void {
    for (const [key, btn] of this.axisButtons) {
      btn.classList.toggle('tool-palette__btn--active', key === axis);
    }
  }

  setDisabled(disabled: boolean): void {
    this.el.classList.toggle('tool-palette--disabled', disabled);
  }

  destroy(): void {
    this.el.remove();
  }
}
