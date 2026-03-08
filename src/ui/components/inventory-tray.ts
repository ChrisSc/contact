import type { PerkInstance, PerkId } from '../../types/abilities';
import { getPerkDefinition } from '../../engine/perks';

export interface InventoryTrayOptions {
  onSelect: (instance: PerkInstance) => void;
}

interface PerkGroup {
  perkId: PerkId;
  instances: PerkInstance[];
}

export class InventoryTray {
  private el: HTMLElement;
  private onSelect: (instance: PerkInstance) => void;
  private selectedPerkId: PerkId | null = null;
  private inventory: PerkInstance[] = [];

  constructor(options: InventoryTrayOptions) {
    this.onSelect = options.onSelect;
    this.el = document.createElement('div');
    this.el.className = 'inventory-tray';
    this.renderEmpty();
  }

  private groupInventory(): PerkGroup[] {
    const map = new Map<PerkId, PerkInstance[]>();
    for (const instance of this.inventory) {
      const list = map.get(instance.perkId);
      if (list) {
        list.push(instance);
      } else {
        map.set(instance.perkId, [instance]);
      }
    }
    const groups: PerkGroup[] = [];
    for (const [perkId, instances] of map) {
      groups.push({ perkId, instances });
    }
    return groups;
  }

  private renderEmpty(): void {
    this.el.innerHTML = '';
    const empty = document.createElement('span');
    empty.className = 'inventory-tray__empty';
    empty.textContent = 'NO PERKS';
    this.el.appendChild(empty);
  }

  private renderItems(): void {
    this.el.innerHTML = '';

    const groups = this.groupInventory();

    for (const group of groups) {
      const def = getPerkDefinition(group.perkId);
      const isSelected = this.selectedPerkId === group.perkId;

      const item = document.createElement('div');
      item.className = `inventory-tray__item inventory-tray__item--${def.type}`;
      if (isSelected) {
        item.classList.add('inventory-tray__item--selected');
      }
      item.dataset.perkId = group.perkId;

      const nameEl = document.createElement('span');
      nameEl.className = 'inventory-tray__item-name';
      nameEl.textContent = def.name.toUpperCase();

      const infoRow = document.createElement('div');
      infoRow.className = 'inventory-tray__item-info';

      const badge = document.createElement('span');
      badge.className = `inventory-tray__slot-badge inventory-tray__slot-badge--${def.slot}`;
      badge.textContent = def.slot.toUpperCase();
      infoRow.appendChild(badge);

      if (group.instances.length > 1) {
        const count = document.createElement('span');
        count.className = 'inventory-tray__count';
        count.textContent = `x${group.instances.length}`;
        infoRow.appendChild(count);
      }

      item.appendChild(nameEl);
      item.appendChild(infoRow);

      item.addEventListener('click', () => {
        this.selectedPerkId = group.perkId;
        // Select the first instance of this perk type
        this.onSelect(group.instances[0]!);
        this.refresh();
      });

      this.el.appendChild(item);
    }
  }

  private refresh(): void {
    if (this.inventory.length === 0) {
      this.renderEmpty();
    } else {
      this.renderItems();
    }
  }

  update(inventory: PerkInstance[]): void {
    this.inventory = inventory;
    if (this.selectedPerkId !== null) {
      const stillPresent = inventory.some((p) => p.perkId === this.selectedPerkId);
      if (!stillPresent) {
        this.selectedPerkId = null;
      }
    }
    this.refresh();
  }

  getSelected(): PerkInstance | null {
    if (this.selectedPerkId === null) return null;
    return this.inventory.find((p) => p.perkId === this.selectedPerkId) ?? null;
  }

  clearSelection(): void {
    this.selectedPerkId = null;
    this.refresh();
  }

  render(): HTMLElement {
    return this.el;
  }

  destroy(): void {
    this.el.remove();
  }
}
