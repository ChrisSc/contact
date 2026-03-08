import { getLogger } from './observability/logger';
import { GameController } from './engine/game';
import { ScreenRouter } from './ui/screen-router';
import { mountSetupScreen } from './ui/screens/setup-screen';
import { mountHandoffScreen } from './ui/screens/handoff-screen';
import { mountCombatScreen } from './ui/screens/combat-screen';
import { mountVictoryScreen } from './ui/screens/victory-screen';
import { startFlicker } from './ui/flicker';
import { CRTNoise } from './ui/effects/crt-noise';
import { AbilityOverlayManager } from './ui/effects/ability-overlays';
import './styles/variables.css';
import './styles/crt.css';
import './styles/grid.css';
import './styles/ui.css';
import './styles/effects.css';

function initApp(): void {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Fatal: #app element not found');
  }

  const game = new GameController();
  const router = new ScreenRouter(app, game);

  // Register screens
  router.register('setup', mountSetupScreen);
  router.register('handoff', mountHandoffScreen);
  router.register('combat', mountCombatScreen);
  router.register('victory', mountVictoryScreen);

  // CRT flicker effect — returns FlickerController (singleton stored in module)
  const _flicker = startFlicker(app);
  void _flicker; // available via getFlickerController() from other modules

  // CRT noise grain overlay
  const noise = new CRTNoise();
  app.appendChild(noise.render());
  noise.start();

  // Wire noise into ability overlay cross-effects
  AbilityOverlayManager.setNoiseInstance(noise);

  // Navigate to first setup screen
  router.navigate('setup');

  getLogger().emit('system.init', {
    version: '0.3.0',
    screen: 'setup',
    userAgent: navigator.userAgent,
  });
}

window.addEventListener('error', (event) => {
  try {
    const logger = getLogger();
    logger.emit('system.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  } catch {
    // Logger not initialized yet, ignore
  }
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    const logger = getLogger();
    logger.emit('system.error', {
      message: String(event.reason),
    });
  } catch {
    // Logger not initialized yet, ignore
  }
});

initApp();
