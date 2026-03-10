declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

import type { ScreenContext, ScreenCleanup } from '../screen-router';
import type { Rank } from '../../types/game';
import { RANK_CONFIGS } from '../../types/game';

export function mountTitleScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { router } = context;

  const el = document.createElement('div');
  el.className = 'title-screen';

  // "CLASSIFIED // SONAR COMMAND" label (dim green, letter-spaced)
  const label = document.createElement('div');
  label.className = 'title-screen__label';
  label.textContent = 'CLASSIFIED // SONAR COMMAND';
  el.appendChild(label);

  // "CONTACT" title (large, green glow)
  const title = document.createElement('div');
  title.className = 'title-screen__title';
  title.textContent = 'CONTACT';
  el.appendChild(title);

  // "3D NAVAL COMBAT" subtitle
  const subtitle = document.createElement('div');
  subtitle.className = 'title-screen__subtitle';
  subtitle.textContent = '3D NAVAL COMBAT';
  el.appendChild(subtitle);

  // Version line: v{version} | {date}
  const versionLine = document.createElement('div');
  versionLine.className = 'title-screen__version';
  versionLine.textContent = `v${__APP_VERSION__} | ${__BUILD_DATE__}`;
  el.appendChild(versionLine);

  // --- Rank Selector ---
  let selectedRank: Rank = 'officer';

  const rankSelector = document.createElement('div');
  rankSelector.className = 'title-screen__rank-selector';

  const rankLabel = document.createElement('div');
  rankLabel.className = 'title-screen__rank-label';
  rankLabel.textContent = 'SELECT RANK';
  rankSelector.appendChild(rankLabel);

  const rankBtnContainer = document.createElement('div');
  rankBtnContainer.className = 'title-screen__rank-buttons';

  const ranks: Rank[] = ['recruit', 'enlisted', 'officer'];
  for (const rank of ranks) {
    const btn = document.createElement('button');
    btn.className = 'title-screen__rank-btn';
    if (rank === selectedRank) {
      btn.classList.add('title-screen__rank-btn--active');
    }
    btn.textContent = RANK_CONFIGS[rank].label;
    btn.dataset.rank = rank;
    btn.addEventListener('click', () => {
      selectedRank = rank;
      const allBtns = rankBtnContainer.querySelectorAll('.title-screen__rank-btn');
      for (const b of allBtns) {
        (b as HTMLElement).classList.toggle('title-screen__rank-btn--active', (b as HTMLElement).dataset.rank === rank);
      }
    });
    rankBtnContainer.appendChild(btn);
  }

  rankSelector.appendChild(rankBtnContainer);
  el.appendChild(rankSelector);

  // Buttons container
  const actions = document.createElement('div');
  actions.className = 'title-screen__actions';

  const startBtn = document.createElement('button');
  startBtn.className = 'crt-button';
  startBtn.textContent = 'START';
  startBtn.addEventListener('click', () => {
    context.game.setRank(selectedRank);
    router.navigate('setup');
  });
  actions.appendChild(startBtn);

  const helpBtn = document.createElement('button');
  helpBtn.className = 'crt-button';
  helpBtn.textContent = 'HELP';
  helpBtn.addEventListener('click', () => {
    router.navigate('help');
  });
  actions.appendChild(helpBtn);

  el.appendChild(actions);
  container.appendChild(el);

  return {
    unmount(): void {
      el.remove();
    },
  };
}
