import type { TurnSlots } from '../../types/game';

export interface ActionSlotsOptions {}

type SlotState = 'available' | 'used' | 'unavailable';

interface SlotConfig {
  key: 'ping' | 'attack' | 'defend';
  label: string;
}

const SLOT_CONFIGS: readonly SlotConfig[] = [
  { key: 'ping', label: 'PING' },
  { key: 'attack', label: 'ATTACK' },
  { key: 'defend', label: 'DEFEND' },
];

export class ActionSlots {
  private el: HTMLElement;
  private slotEls: Map<string, HTMLElement> = new Map();

  constructor(_options: ActionSlotsOptions = {}) {
    this.el = document.createElement('div');
    this.el.className = 'action-slots';
    this.build();
  }

  private build(): void {
    for (const config of SLOT_CONFIGS) {
      const slot = document.createElement('div');
      slot.className = 'action-slots__slot action-slots__slot--unavailable';
      slot.dataset.slot = config.key;
      slot.textContent = config.label;
      this.slotEls.set(config.key, slot);
      this.el.appendChild(slot);
    }
  }

  update(
    turnSlots: TurnSlots,
    hasInventory: { ping: boolean; attack: boolean; defend: boolean },
  ): void {
    const slotUsed: Record<string, boolean> = {
      ping: turnSlots.pingUsed,
      attack: turnSlots.attackUsed,
      defend: turnSlots.defendUsed,
    };

    const slotHas: Record<string, boolean> = {
      ping: hasInventory.ping,
      attack: hasInventory.attack,
      defend: hasInventory.defend,
    };

    for (const config of SLOT_CONFIGS) {
      const el = this.slotEls.get(config.key);
      if (!el) continue;

      let state: SlotState;
      if (slotUsed[config.key]) {
        state = 'used';
      } else if (!slotHas[config.key]) {
        state = 'unavailable';
      } else {
        state = 'available';
      }

      el.classList.remove(
        'action-slots__slot--available',
        'action-slots__slot--used',
        'action-slots__slot--unavailable',
      );
      el.classList.add(`action-slots__slot--${state}`);

      if (state === 'used') {
        el.textContent = `\u2713 ${config.label}`;
      } else {
        el.textContent = config.label;
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
