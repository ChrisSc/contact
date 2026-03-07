import { initLogger, getLogger } from './observability/logger';
import './styles/variables.css';
import './styles/crt.css';
import './styles/grid.css';
import './styles/ui.css';

type Screen = 'title' | 'setup' | 'handoff' | 'combat' | 'victory';

let currentScreen: Screen = 'title';

function renderPlaceholder(app: HTMLElement): void {
  app.innerHTML = `
    <div class="crt-overlay"></div>
    <div class="screen-container">
      <h1 class="title-text">CONTACT</h1>
      <p class="subtitle-text">3D NAVAL COMBAT</p>
      <p class="status-text">SYSTEM INITIALIZING...</p>
      <p class="version-text">v0.1.0 // SPRINT 1.0</p>
    </div>
  `;
}

function setScreen(_screen: Screen): void {
  currentScreen = _screen;
}

function initApp(): void {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Fatal: #app element not found');
  }

  const logger = initLogger();
  renderPlaceholder(app);

  logger.emit('system.init', {
    version: '0.1.0',
    screen: currentScreen,
    userAgent: navigator.userAgent,
  });

  // Expose for future screen routing
  void setScreen;
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
