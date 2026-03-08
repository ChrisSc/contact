import type { PerkId, PerkDefinition } from '../../types/abilities';
import { PERK_CATALOG } from '../../types/abilities';

export interface PerkStoreOptions {
  onPurchase: (perkId: PerkId) => void;
  onClose: () => void;
}

export class PerkStore {
  private el: HTMLElement;
  private onPurchase: (perkId: PerkId) => void;
  private onClose: () => void;
  private buyBtns: Map<PerkId, HTMLButtonElement> = new Map();

  constructor(options: PerkStoreOptions) {
    this.onPurchase = options.onPurchase;
    this.onClose = options.onClose;
    this.el = document.createElement('div');
    this.el.className = 'perk-store';
    this.build();
  }

  private build(): void {
    // Title row
    const title = document.createElement('div');
    title.className = 'perk-store__title';
    title.textContent = 'PERK STORE';
    this.el.appendChild(title);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'perk-store__close';
    closeBtn.textContent = '[X]';
    closeBtn.addEventListener('click', () => {
      this.onClose();
    });
    this.el.appendChild(closeBtn);

    // Offensive section
    const offensiveLabel = document.createElement('div');
    offensiveLabel.className = 'perk-store__section-label perk-store__section-label--offensive';
    offensiveLabel.textContent = 'OFFENSIVE';
    this.el.appendChild(offensiveLabel);

    const offensiveSection = document.createElement('div');
    offensiveSection.className = 'perk-store__section';
    const offensivePerks = PERK_CATALOG.filter((p) => p.type === 'offensive');
    for (const perk of offensivePerks) {
      offensiveSection.appendChild(this.buildItem(perk));
    }
    this.el.appendChild(offensiveSection);

    // Defensive section
    const defensiveLabel = document.createElement('div');
    defensiveLabel.className = 'perk-store__section-label perk-store__section-label--defensive';
    defensiveLabel.textContent = 'DEFENSIVE';
    this.el.appendChild(defensiveLabel);

    const defensiveSection = document.createElement('div');
    defensiveSection.className = 'perk-store__section';
    const defensivePerks = PERK_CATALOG.filter((p) => p.type === 'defensive');
    for (const perk of defensivePerks) {
      defensiveSection.appendChild(this.buildItem(perk));
    }
    this.el.appendChild(defensiveSection);
  }

  private buildItem(perk: PerkDefinition): HTMLElement {
    const item = document.createElement('div');
    item.className = `perk-store__item perk-store__item--${perk.type}`;
    item.dataset.perkId = perk.id;

    const header = document.createElement('div');
    header.className = 'perk-store__item-header';

    const name = document.createElement('span');
    name.className = 'perk-store__name';
    name.textContent = perk.name.toUpperCase();

    const cost = document.createElement('span');
    cost.className = 'perk-store__cost';
    cost.textContent = `${perk.cost}CR`;

    header.appendChild(name);
    header.appendChild(cost);

    const desc = document.createElement('div');
    desc.className = 'perk-store__desc';
    desc.textContent = perk.description;

    const buyBtn = document.createElement('button');
    buyBtn.className = 'perk-store__buy-btn';
    buyBtn.textContent = 'BUY';
    buyBtn.disabled = true;
    buyBtn.addEventListener('click', () => {
      this.onPurchase(perk.id);
    });

    this.buyBtns.set(perk.id, buyBtn);

    item.appendChild(header);
    item.appendChild(desc);
    item.appendChild(buyBtn);

    return item;
  }

  update(credits: number): void {
    for (const [perkId, btn] of this.buyBtns) {
      const def = PERK_CATALOG.find((p) => p.id === perkId);
      if (!def) continue;
      const canAfford = credits >= def.cost;
      btn.disabled = !canAfford;
      const item = this.el.querySelector(`[data-perk-id="${perkId}"]`);
      if (item) {
        item.classList.toggle('perk-store__item--disabled', !canAfford);
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
