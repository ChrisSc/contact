import type { GameController } from '../engine/game';
import type { AIOpponent } from '../engine/ai/ai-opponent';
import { getLogger } from '../observability/logger';

export type ScreenId = 'title' | 'setup' | 'handoff' | 'combat' | 'victory' | 'help';

export interface ScreenContext {
  game: GameController;
  router: ScreenRouter;
  aiMode: boolean;
  aiOpponent: AIOpponent | null;
}

export interface ScreenCleanup {
  unmount(): void;
}

export type ScreenMountFn = (container: HTMLElement, context: ScreenContext) => ScreenCleanup;

export class ScreenRouter {
  private container: HTMLElement;
  private screenContainer: HTMLElement;
  private context: ScreenContext;
  private currentCleanup: ScreenCleanup | null = null;
  private currentScreen: ScreenId | null = null;
  private screens: Map<ScreenId, ScreenMountFn> = new Map();

  constructor(container: HTMLElement, game: GameController) {
    this.container = container;

    // Persistent CRT overlay
    const crtOverlay = document.createElement('div');
    crtOverlay.className = 'crt-overlay';
    this.container.appendChild(crtOverlay);

    // Screen content container
    this.screenContainer = document.createElement('div');
    this.screenContainer.className = 'screen-container';
    this.container.appendChild(this.screenContainer);

    this.context = { game, router: this, aiMode: false, aiOpponent: null };
  }

  register(id: ScreenId, mount: ScreenMountFn): void {
    this.screens.set(id, mount);
  }

  navigate(screen: ScreenId): void {
    if (this.currentCleanup) {
      this.currentCleanup.unmount();
      this.currentCleanup = null;
    }

    this.screenContainer.innerHTML = '';
    this.currentScreen = screen;

    const mount = this.screens.get(screen);
    if (mount) {
      try {
        this.currentCleanup = mount(this.screenContainer, this.context);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.screenContainer.innerHTML = `<div style="color:#ff3333;padding:2rem;font-family:monospace;">Screen mount failed: ${msg}</div>`;
        try {
          getLogger().emit('system.error', { message: `Screen mount failed: ${msg}`, screen });
        } catch { /* ignore */ }
      }
    }

    getLogger().emit('view.change', { screen });
  }

  setGame(game: GameController): void {
    this.context.game = game;
  }

  setAIMode(aiOpponent: AIOpponent): void {
    this.context.aiMode = true;
    this.context.aiOpponent = aiOpponent;
  }

  clearAIMode(): void {
    if (this.context.aiOpponent) {
      this.context.aiOpponent.dispose();
    }
    this.context.aiMode = false;
    this.context.aiOpponent = null;
  }

  getCurrentScreen(): ScreenId | null {
    return this.currentScreen;
  }
}
