import type { GameController } from '../engine/game';
import { getLogger } from '../observability/logger';

export type ScreenId = 'title' | 'setup' | 'handoff' | 'combat' | 'victory';

export interface ScreenContext {
  game: GameController;
  router: ScreenRouter;
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

    this.context = { game, router: this };
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
      this.currentCleanup = mount(this.screenContainer, this.context);
    }

    getLogger().emit('view.change', { screen });
  }

  setGame(game: GameController): void {
    this.context.game = game;
  }

  getCurrentScreen(): ScreenId | null {
    return this.currentScreen;
  }
}
