import type { FleetRosterEntry } from '../../types/fleet';
import { FLEET_ROSTER } from '../../types/fleet';
import type { Ship } from '../../types/fleet';

export const DECOY_ID = 'decoy';

export interface ShipRosterOptions {
  onShipSelect: (entry: FleetRosterEntry) => void;
  onShipRemove: (shipId: string) => void;
  onDecoySelect: () => void;
}

export class ShipRoster {
  private el: HTMLElement;
  private selectedId: string | null = null;
  private placedIds: Set<string> = new Set();
  private decoyPlaced = false;
  private decoyEnabled = false;
  private onShipSelect: (entry: FleetRosterEntry) => void;
  private onShipRemove: (shipId: string) => void;
  private onDecoySelect: () => void;
  private entryEls: Map<string, HTMLElement> = new Map();
  private decoyEl: HTMLElement | null = null;
  private handleClick!: (e: MouseEvent) => void;

  constructor(options: ShipRosterOptions) {
    this.onShipSelect = options.onShipSelect;
    this.onShipRemove = options.onShipRemove;
    this.onDecoySelect = options.onDecoySelect;
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

    // Decoy entry — visually distinct
    const decoyRow = document.createElement('div');
    decoyRow.className = 'ship-roster__entry ship-roster__entry--decoy ship-roster__entry--decoy-disabled';
    decoyRow.dataset.shipId = DECOY_ID;
    decoyRow.innerHTML = `
      <span class="ship-roster__name">Decoy</span>
      <span class="ship-roster__size">[1]</span>
      <span class="ship-roster__status"></span>
    `;
    this.decoyEl = decoyRow;
    this.el.appendChild(decoyRow);

    this.handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-ship-id]') as HTMLElement | null;
      if (!target) return;
      const shipId = target.dataset.shipId!;

      if (shipId === DECOY_ID) {
        if (this.decoyEnabled && !this.decoyPlaced) {
          this.onDecoySelect();
        }
        return;
      }

      const entry = FLEET_ROSTER.find((r) => r.id === shipId);
      if (!entry) return;

      if (this.placedIds.has(shipId)) {
        this.onShipRemove(shipId);
      } else {
        this.onShipSelect(entry);
      }
    };
    this.el.addEventListener('click', this.handleClick);
  }

  setSelected(shipId: string | null): void {
    this.selectedId = shipId;
    this.refreshClasses();
  }

  updatePlaced(ships: Ship[]): void {
    this.placedIds = new Set(ships.map((s) => s.id));
    this.refreshClasses();
  }

  setDecoyState(enabled: boolean, placed: boolean): void {
    this.decoyEnabled = enabled;
    this.decoyPlaced = placed;
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

    // Decoy entry
    if (this.decoyEl) {
      const selected = this.selectedId === DECOY_ID;
      this.decoyEl.classList.toggle('ship-roster__entry--decoy-disabled', !this.decoyEnabled);
      this.decoyEl.classList.toggle('ship-roster__entry--decoy-selected', selected && !this.decoyPlaced);
      this.decoyEl.classList.toggle('ship-roster__entry--decoy-placed', this.decoyPlaced);

      const status = this.decoyEl.querySelector('.ship-roster__status') as HTMLElement;
      if (this.decoyPlaced) {
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
    this.el.removeEventListener('click', this.handleClick);
    this.el.remove();
  }
}
