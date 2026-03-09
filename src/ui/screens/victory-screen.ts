import type { ScreenContext, ScreenCleanup } from '../screen-router';
import { PLAYER_DESIGNATIONS } from '../../types/game';
import { GameController } from '../../engine/game';
import { exportSession } from '../../observability/export';

export function mountVictoryScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;
  const state = game.getState();

  const winner = state.winner ?? 0;
  const player = state.players[winner];

  const hitRate =
    player.shotsFired > 0
      ? (player.shotsHit / player.shotsFired * 100).toFixed(0) + '%'
      : '0%';

  const el = document.createElement('div');
  el.className = 'victory-screen';

  // Label
  const label = document.createElement('div');
  label.className = 'victory-screen__label';
  label.textContent = 'ENGAGEMENT COMPLETE';
  el.appendChild(label);

  // Winner
  const winnerEl = document.createElement('div');
  winnerEl.className = 'victory-screen__winner';
  winnerEl.textContent = PLAYER_DESIGNATIONS[winner] + ' WINS';
  el.appendChild(winnerEl);

  // Stats container
  const statsEl = document.createElement('div');
  statsEl.className = 'victory-screen__stats';

  const statDefs: [string, string][] = [
    ['TURNS', String(state.turnCount)],
    ['SHOTS FIRED', String(player.shotsFired)],
    ['HIT RATE', hitRate],
    ['ABILITIES USED', String(player.perksUsed)],
  ];

  for (const [key, value] of statDefs) {
    const statEl = document.createElement('div');
    statEl.className = 'victory-screen__stat';
    statEl.textContent = `${key}: ${value}`;
    statsEl.appendChild(statEl);
  }

  el.appendChild(statsEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.className = 'victory-screen__actions';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'crt-button';
  exportBtn.textContent = 'EXPORT SESSION LOG';
  exportBtn.addEventListener('click', () => {
    exportSession();
  });
  actionsEl.appendChild(exportBtn);

  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'crt-button';
  newGameBtn.textContent = 'NEW ENGAGEMENT';
  newGameBtn.addEventListener('click', () => {
    const newGame = new GameController();
    router.setGame(newGame);
    router.navigate('title');
  });
  actionsEl.appendChild(newGameBtn);

  el.appendChild(actionsEl);

  container.appendChild(el);

  return {
    unmount(): void {
      el.remove();
    },
  };
}
