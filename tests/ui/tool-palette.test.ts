// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { ToolPalette } from '../../src/ui/components/tool-palette';
import type { ToolPaletteConfig } from '../../src/ui/components/tool-palette';
import type { ViewMode } from '../../src/renderer/views';
import type { PlacementAxis } from '../../src/types/fleet';

function makeConfig(overrides: Partial<ToolPaletteConfig> = {}): ToolPaletteConfig {
  return {
    showAxis: false,
    initialViewMode: 'cube',
    initialDepth: null,
    onViewModeChange: vi.fn(),
    onDepthChange: vi.fn(),
    ...overrides,
  };
}

describe('ToolPalette', () => {
  // ---------- 1. Construction without axis row ----------
  describe('construction without axis row', () => {
    it('root has class tool-palette', () => {
      const palette = new ToolPalette(makeConfig({ showAxis: false }));
      const el = palette.getElement();
      expect(el.classList.contains('tool-palette')).toBe(true);
    });

    it('has 2 rows and 1 separator', () => {
      const palette = new ToolPalette(makeConfig({ showAxis: false }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const separators = el.querySelectorAll('.tool-palette__separator');
      expect(rows.length).toBe(2);
      expect(separators.length).toBe(1);
    });

    it('VIEW row has label "VIEW" and 3 buttons (CUBE, SLICE, X-RAY)', () => {
      const palette = new ToolPalette(makeConfig({ showAxis: false }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const viewRow = rows[0];
      const label = viewRow.querySelector('.tool-palette__label');
      expect(label!.textContent).toBe('VIEW');
      const buttons = viewRow.querySelectorAll('.tool-palette__btn');
      expect(buttons.length).toBe(3);
      expect(buttons[0].getAttribute('data-mode')).toBe('cube');
      expect(buttons[1].getAttribute('data-mode')).toBe('slice');
      expect(buttons[2].getAttribute('data-mode')).toBe('xray');
    });

    it('DEPTH row has label "DEPTH" and 8 buttons (ALL, 1-7)', () => {
      const palette = new ToolPalette(makeConfig({ showAxis: false }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const depthRow = rows[1];
      const label = depthRow.querySelector('.tool-palette__label');
      expect(label!.textContent).toBe('DEPTH');
      const buttons = depthRow.querySelectorAll('.tool-palette__btn');
      expect(buttons.length).toBe(8);
      expect(buttons[0].getAttribute('data-depth')).toBe('-1');
      for (let i = 1; i <= 7; i++) {
        expect(buttons[i].getAttribute('data-depth')).toBe(String(i - 1));
      }
    });

    it('initial active states match config', () => {
      const palette = new ToolPalette(makeConfig({
        showAxis: false,
        initialViewMode: 'cube',
        initialDepth: null,
      }));
      const el = palette.getElement();

      // CUBE button should be active
      const cubeBtn = el.querySelector('[data-mode="cube"]')!;
      expect(cubeBtn.classList.contains('tool-palette__btn--active')).toBe(true);
      const sliceBtn = el.querySelector('[data-mode="slice"]')!;
      expect(sliceBtn.classList.contains('tool-palette__btn--active')).toBe(false);

      // ALL depth button should be active (data-depth="-1")
      const allBtn = el.querySelector('[data-depth="-1"]')!;
      expect(allBtn.classList.contains('tool-palette__btn--active')).toBe(true);
      const depth0Btn = el.querySelector('[data-depth="0"]')!;
      expect(depth0Btn.classList.contains('tool-palette__btn--active')).toBe(false);
    });
  });

  // ---------- 2. Construction with axis row ----------
  describe('construction with axis row', () => {
    it('has 3 rows and 2 separators', () => {
      const palette = new ToolPalette(makeConfig({
        showAxis: true,
        initialAxis: 'col',
        onAxisChange: vi.fn(),
      }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const separators = el.querySelectorAll('.tool-palette__separator');
      expect(rows.length).toBe(3);
      expect(separators.length).toBe(2);
    });

    it('AXIS row has tool-palette__row--wrap class', () => {
      const palette = new ToolPalette(makeConfig({
        showAxis: true,
        initialAxis: 'col',
        onAxisChange: vi.fn(),
      }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const axisRow = rows[2];
      expect(axisRow.classList.contains('tool-palette__row--wrap')).toBe(true);
    });

    it('AXIS row has label "AXIS" and 8 buttons', () => {
      const palette = new ToolPalette(makeConfig({
        showAxis: true,
        initialAxis: 'col',
        onAxisChange: vi.fn(),
      }));
      const el = palette.getElement();
      const rows = el.querySelectorAll('.tool-palette__row');
      const axisRow = rows[2];
      const label = axisRow.querySelector('.tool-palette__label');
      expect(label!.textContent).toBe('AXIS');
      const buttons = axisRow.querySelectorAll('.tool-palette__btn');
      expect(buttons.length).toBe(8);
      // Each button should have a data-axis attribute
      buttons.forEach((btn) => {
        expect(btn.hasAttribute('data-axis')).toBe(true);
      });
    });

    it('initial axis matches config', () => {
      const palette = new ToolPalette(makeConfig({
        showAxis: true,
        initialAxis: 'row',
        onAxisChange: vi.fn(),
      }));
      const el = palette.getElement();
      const activeAxis = el.querySelector('[data-axis="row"]')!;
      expect(activeAxis.classList.contains('tool-palette__btn--active')).toBe(true);
      const colBtn = el.querySelector('[data-axis="col"]')!;
      expect(colBtn.classList.contains('tool-palette__btn--active')).toBe(false);
    });
  });

  // ---------- 3. View button click fires callback ----------
  it('view button click fires onViewModeChange callback', () => {
    const onViewModeChange = vi.fn();
    const palette = new ToolPalette(makeConfig({ onViewModeChange }));
    const el = palette.getElement();
    const sliceBtn = el.querySelector('[data-mode="slice"]') as HTMLElement;
    sliceBtn.click();
    expect(onViewModeChange).toHaveBeenCalledWith('slice');
  });

  // ---------- 4. Depth button click fires callback ----------
  it('depth button click fires onDepthChange callback', () => {
    const onDepthChange = vi.fn();
    const palette = new ToolPalette(makeConfig({ onDepthChange }));
    const el = palette.getElement();

    // Click depth index 2
    const depthBtn = el.querySelector('[data-depth="2"]') as HTMLElement;
    depthBtn.click();
    expect(onDepthChange).toHaveBeenCalledWith(2);

    // Click ALL
    const allBtn = el.querySelector('[data-depth="-1"]') as HTMLElement;
    allBtn.click();
    expect(onDepthChange).toHaveBeenCalledWith(-1);
  });

  // ---------- 5. Axis button click fires callback ----------
  it('axis button click fires onAxisChange callback', () => {
    const onAxisChange = vi.fn();
    const palette = new ToolPalette(makeConfig({
      showAxis: true,
      initialAxis: 'col',
      onAxisChange,
    }));
    const el = palette.getElement();
    const diagBtn = el.querySelector('[data-axis="diag+"]') as HTMLElement;
    diagBtn.click();
    expect(onAxisChange).toHaveBeenCalledWith('diag+');
  });

  // ---------- 6. setActiveViewMode toggles classes ----------
  it('setActiveViewMode toggles active class on view buttons', () => {
    const palette = new ToolPalette(makeConfig({ initialViewMode: 'cube' }));
    const el = palette.getElement();

    palette.setActiveViewMode('xray');

    const xrayBtn = el.querySelector('[data-mode="xray"]')!;
    const cubeBtn = el.querySelector('[data-mode="cube"]')!;
    const sliceBtn = el.querySelector('[data-mode="slice"]')!;
    expect(xrayBtn.classList.contains('tool-palette__btn--active')).toBe(true);
    expect(cubeBtn.classList.contains('tool-palette__btn--active')).toBe(false);
    expect(sliceBtn.classList.contains('tool-palette__btn--active')).toBe(false);
  });

  // ---------- 7. setActiveDepth toggles classes ----------
  it('setActiveDepth toggles active class on depth buttons', () => {
    const palette = new ToolPalette(makeConfig({ initialDepth: null }));
    const el = palette.getElement();

    palette.setActiveDepth(3);

    const depth3Btn = el.querySelector('[data-depth="3"]')!;
    const allBtn = el.querySelector('[data-depth="-1"]')!;
    expect(depth3Btn.classList.contains('tool-palette__btn--active')).toBe(true);
    expect(allBtn.classList.contains('tool-palette__btn--active')).toBe(false);

    palette.setActiveDepth(null);

    expect(allBtn.classList.contains('tool-palette__btn--active')).toBe(true);
    expect(depth3Btn.classList.contains('tool-palette__btn--active')).toBe(false);
  });

  // ---------- 8. setActiveAxis toggles classes ----------
  it('setActiveAxis toggles active class on axis buttons', () => {
    const palette = new ToolPalette(makeConfig({
      showAxis: true,
      initialAxis: 'col',
      onAxisChange: vi.fn(),
    }));
    const el = palette.getElement();

    palette.setActiveAxis('diag+');

    const diagBtn = el.querySelector('[data-axis="diag+"]')!;
    const colBtn = el.querySelector('[data-axis="col"]')!;
    expect(diagBtn.classList.contains('tool-palette__btn--active')).toBe(true);
    expect(colBtn.classList.contains('tool-palette__btn--active')).toBe(false);
  });

  // ---------- 9. setDisabled adds/removes class ----------
  it('setDisabled adds and removes tool-palette--disabled class', () => {
    const palette = new ToolPalette(makeConfig());
    const el = palette.getElement();

    palette.setDisabled(true);
    expect(el.classList.contains('tool-palette--disabled')).toBe(true);

    palette.setDisabled(false);
    expect(el.classList.contains('tool-palette--disabled')).toBe(false);
  });

  // ---------- 10. destroy removes element ----------
  it('destroy removes element from DOM', () => {
    const palette = new ToolPalette(makeConfig());
    const el = palette.getElement();
    document.body.appendChild(el);
    expect(document.body.contains(el)).toBe(true);

    palette.destroy();
    expect(document.body.contains(el)).toBe(false);
  });
});
