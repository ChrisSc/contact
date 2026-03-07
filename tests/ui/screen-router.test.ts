// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenRouter } from '../../src/ui/screen-router';
import type { ScreenContext, ScreenCleanup } from '../../src/ui/screen-router';
import { GameController } from '../../src/engine/game';
import { initLogger } from '../../src/observability/logger';

describe('ScreenRouter', () => {
  let container: HTMLElement;
  let game: GameController;

  beforeEach(() => {
    initLogger('test');
    container = document.createElement('div');
    container.id = 'app';
    document.body.innerHTML = '';
    document.body.appendChild(container);
    game = new GameController('test');
  });

  it('creates CRT overlay and screen container', () => {
    const router = new ScreenRouter(container, game);
    expect(container.querySelector('.crt-overlay')).toBeTruthy();
    expect(container.querySelector('.screen-container')).toBeTruthy();
  });

  it('navigates to a registered screen', () => {
    const router = new ScreenRouter(container, game);
    const unmountSpy = vi.fn();

    router.register('setup', (el, ctx) => {
      const div = document.createElement('div');
      div.id = 'test-setup';
      el.appendChild(div);
      return { unmount: unmountSpy };
    });

    router.navigate('setup');
    expect(router.getCurrentScreen()).toBe('setup');
    expect(container.querySelector('#test-setup')).toBeTruthy();
  });

  it('unmounts previous screen on navigation', () => {
    const router = new ScreenRouter(container, game);
    const unmountA = vi.fn();
    const unmountB = vi.fn();

    router.register('setup', (el) => {
      el.appendChild(document.createElement('div'));
      return { unmount: unmountA };
    });

    router.register('handoff', (el) => {
      el.appendChild(document.createElement('div'));
      return { unmount: unmountB };
    });

    router.navigate('setup');
    expect(unmountA).not.toHaveBeenCalled();

    router.navigate('handoff');
    expect(unmountA).toHaveBeenCalledOnce();
    expect(router.getCurrentScreen()).toBe('handoff');
  });

  it('passes correct context to screen mount function', () => {
    const router = new ScreenRouter(container, game);
    let receivedContext: ScreenContext | null = null;

    router.register('setup', (el, ctx) => {
      receivedContext = ctx;
      return { unmount: () => {} };
    });

    router.navigate('setup');
    expect(receivedContext).toBeTruthy();
    expect(receivedContext!.game).toBe(game);
    expect(receivedContext!.router).toBe(router);
  });
});
