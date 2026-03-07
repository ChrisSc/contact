import type { FleetRosterEntry } from '../../types/fleet';
import { FLEET_ROSTER } from '../../types/fleet';
import type { Ship } from '../../types/fleet';

export interface ShipRosterOptions {
  onShipSelect: (entry: FleetRosterEntry) => void;
  onShipRemove: (shipId: string) => void;
}

export class ShipRoster {
  private el: HTMLElement;
  private selectedId: string | null = null;
  private placedIds: Set<string> = new Set();
  private onShipSelect: (entry: FleetRosterEntry) => void;
  private onShipRemove: (shipId: string) => void;
  private entryEls: Map<string, HTMLElement> = new Map();

  constructor(options: ShipRosterOptions) {
    this.onShipSelect = options.onShipSelect;
    this.onShipRemove = options.onShipRemove;
    this.el = document.createElement('div');
    this.el.className = 'ship-roster';
    this.buildRoster();
  }

  private buildRoster(): void {
    const title = document.createElement('div');
    title.className = 'ship-roster__title';
    title.textContent = 'FLEET ROSTER';
    this.el.appendChild(title);

    for (const entry of FLEET_ROSTER) {
      const row = document.createElement('div');
      row.className = 'ship-roster__entry';
      row.dataset.shipId = entry.id;
      row.innerHTML = `
        <span class="ship-roster__name">${entry.name}</span>
        <span class="ship-roster__size">[${entry.size}]</span>
        <span class="ship-roster__status"></span>
      `;
      this.entryEls.set(entry.id, row);
      this.el.appendChild(row);
    }

    this.el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-ship-id]') as HTMLElement | null;
      if (!target) return;
      const shipId = target.dataset.shipId!;
      const entry = FLEET_ROSTER.find((r) => r.id === shipId);
      if (!entry) return;

      if (this.placedIds.has(shipId)) {
        this.onShipRemove(shipId);
      } else {
        this.onShipSelect(entry);
      }
    });
  }

  setSelected(shipId: string | null): void {
    this.selectedId = shipId;
    this.refreshClasses();
  }

  updatePlaced(ships: Ship[]): void {
    this.placedIds = new Set(ships.map((s) => s.id));
    this.refreshClasses();
  }

  private refreshClasses(): void {
    for (const [id, el] of this.entryEls) {
      const placed = this.placedIds.has(id);
      const selected = this.selectedId === id;
      el.classList.toggle('ship-roster__entry--placed', placed);
      el.classList.toggle('ship-roster__entry--selected', selected && !placed);

      const status = el.querySelector('.ship-roster__status') as HTMLElement;
      if (placed) {
        status.textContent = 'SET';
      } else if (selected) {
        status.textContent = '...';
      } else {
        status.textContent = '';
      }
    }
  }

  render(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    this.el.remove();
  }
}
