import type { ScreenContext, ScreenCleanup } from '../screen-router';
import { GamePhase, PLAYER_DESIGNATIONS } from '../../types/game';
import { initAudioContext } from '../../audio/audio-manager';

export function mountHandoffScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { game, router } = context;
  const state = game.getState();

  // Determine next player designation
  const designation = PLAYER_DESIGNATIONS[state.currentPlayer];

  // Determine what happens on READY
  const isSetup = state.phase === GamePhase.SetupP1 || state.phase === GamePhase.SetupP2;
  const nextScreen = isSetup ? 'setup' : 'combat';

  const el = document.createElement('div');
  el.className = 'handoff-screen';

  const label = document.createElement('div');
  label.className = 'handoff-screen__label';
  label.textContent = 'PASS DEVICE TO';
  el.appendChild(label);

  const playerEl = document.createElement('div');
  playerEl.className = 'handoff-screen__player';
  playerEl.textContent = designation;
  el.appendChild(playerEl);

  const instruction = document.createElement('div');
  instruction.className = 'handoff-screen__instruction';
  instruction.textContent = isSetup ? 'DEPLOY YOUR FLEET' : 'COMMENCE COMBAT';
  el.appendChild(instruction);

  const btn = document.createElement('button');
  btn.className = 'crt-button';
  btn.textContent = 'READY';
  btn.addEventListener('click', () => {
    initAudioContext();
    router.navigate(nextScreen);
  });
  el.appendChild(btn);

  container.appendChild(el);

  return {
    unmount(): void {
      el.remove();
    },
  };
}
