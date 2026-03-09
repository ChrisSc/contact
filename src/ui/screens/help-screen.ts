import type { ScreenContext, ScreenCleanup } from '../screen-router';
import { getLogger } from '../../observability/logger';

// Helper: create a section with a title and content element
function createSection(title: string, contentEl: HTMLElement): HTMLElement {
  const section = document.createElement('div');

  const titleEl = document.createElement('div');
  titleEl.className = 'help-screen__section-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  section.appendChild(contentEl);
  return section;
}

// Helper: create a plain text paragraph
function createText(text: string): HTMLElement {
  const p = document.createElement('div');
  p.className = 'help-screen__text';
  p.textContent = text;
  return p;
}

// Helper: create a text element with multiple lines
function createLines(lines: string[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'help-screen__text';
  for (const line of lines) {
    const row = document.createElement('div');
    row.textContent = line;
    wrapper.appendChild(row);
  }
  return wrapper;
}

// Helper: create a table with headers and rows
function createTable(headers: string[], rows: string[][]): HTMLElement {
  const table = document.createElement('table');
  table.className = 'help-screen__table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const rowData of rows) {
    const tr = document.createElement('tr');
    for (const cell of rowData) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return table;
}

export function mountHelpScreen(container: HTMLElement, context: ScreenContext): ScreenCleanup {
  const { router } = context;

  const el = document.createElement('div');
  el.className = 'help-screen';

  // Header
  const header = document.createElement('div');
  header.className = 'help-screen__header';
  header.textContent = 'OPERATIONS MANUAL';
  el.appendChild(header);

  // Scrollable content
  const content = document.createElement('div');
  content.className = 'help-screen__content';

  // 1. OBJECTIVE
  content.appendChild(createSection(
    '01. OBJECTIVE',
    createText('Sink all 5 enemy submarines hidden in an 8x8x8 volumetric grid (512 cells). The first commander to destroy the entire enemy fleet wins.'),
  ));

  // 2. GAME FLOW
  content.appendChild(createSection(
    '02. GAME FLOW',
    createLines([
      'SETUP: Each player places their fleet in secret on a private grid.',
      'COMBAT: Players alternate turns. Each turn: fire a torpedo OR deploy a perk.',
      'VICTORY: The first player to sink all 5 enemy submarines wins.',
      'No passing allowed — you must take an action each turn.',
    ]),
  ));

  // 3. FLEET ROSTER
  content.appendChild(createSection(
    '03. FLEET ROSTER',
    createTable(
      ['VESSEL', 'SIZE', 'NOTES'],
      [
        ['Typhoon', '5', 'Largest target'],
        ['Akula', '4', ''],
        ['Seawolf', '3', ''],
        ['Virginia', '3', ''],
        ['Midget Sub', '2', 'Smallest target'],
        ['Decoy', '1', 'Single cell, triggers false positives'],
      ],
    ),
  ));

  // 4. COMBAT ACTIONS
  content.appendChild(createSection(
    '04. COMBAT ACTIONS',
    createLines([
      'FIRE TORPEDO: Target any cell in the enemy grid. Hit or miss is immediately resolved.',
      'DEPLOY PERK: Use a perk from your inventory (costs your attack slot for offensive perks).',
      'Each turn consumes your ATTACK slot. Defensive perks use the DEFEND slot.',
      'PING slot is separate — Sonar Ping does not consume your attack.',
    ]),
  ));

  // 5. CREDIT ECONOMY
  content.appendChild(createSection(
    '05. CREDIT ECONOMY',
    createLines([
      'Starting credits: 5cr',
      'Torpedo hit: +1cr',
      'Consecutive hit bonus: +8cr',
      'Enemy ship sunk: +15cr',
      'Use credits to purchase perks from the STORE.',
    ]),
  ));

  // 6. PERK STORE
  content.appendChild(createSection(
    '06. PERK STORE',
    createTable(
      ['PERK', 'COST', 'SLOT', 'DESCRIPTION'],
      [
        ['Sonar Ping', '3cr', 'PING', 'Scans a 2x2x2 volume (up to 8 cells) — does not consume attack slot'],
        ['Recon Drone', '10cr', 'ATK', 'Reveals contents of a 3x3x3 volume (up to 27 cells)'],
        ['Depth Charge', '25cr', 'ATK', 'Strikes all occupied cells in a 3x3x3 volume'],
        ['G-SONAR', '18cr', 'ATK', 'Scans an entire depth layer (64 cells)'],
        ['Radar Jammer', '5cr', 'DEF', 'Inverts next enemy Sonar Ping; returns all-false for Recon Drone'],
        ['Silent Running', '10cr', 'DEF', 'Masks a single ship from recon for 2 opponent turns'],
        ['Acoustic Cloak', '6cr', 'DEF', 'All ships masked from all recon for 2 opponent turns'],
      ],
    ),
  ));

  // 7. PERK INTERACTIONS
  content.appendChild(createSection(
    '07. PERK INTERACTIONS',
    createLines([
      'RADAR JAMMER vs SONAR PING: Per-cell results are inverted (yes becomes no, no becomes yes).',
      'RADAR JAMMER vs RECON DRONE: All cells in the scan return empty (all-false).',
      'ACOUSTIC CLOAK vs ANY SCAN: All ships are hidden from drone, sonar, and G-SONAR.',
      'SILENT RUNNING: Only the selected ship is masked; other ships are visible normally.',
      'DECOY: A single-cell object that triggers positive results on sonar and drone scans.',
      'Decoy does NOT count as a ship — sinking it does not progress the win condition.',
    ]),
  ));

  // 8. KEYBOARD SHORTCUTS
  content.appendChild(createSection(
    '08. KEYBOARD SHORTCUTS',
    createTable(
      ['KEY', 'CONTEXT', 'ACTION'],
      [
        ['R', 'Setup', 'Cycle placement axis (COL / ROW / DIAG / depth variants)'],
        ['F', 'Combat', 'Hold to reveal friendly fleet positions on the grid'],
        ['S', 'Combat', 'Toggle perk store panel open / closed'],
      ],
    ),
  ));

  // 9. VIEW MODES
  content.appendChild(createSection(
    '09. VIEW MODES',
    createLines([
      'CUBE: Full 3D volumetric view. Orbit with click-drag; zoom with scroll.',
      'SLICE: Single depth layer shown as a flat 2D grid. Use D1-D8 to change depth.',
      '       Adjacent layers are shown ghosted (±1 depth) for spatial context.',
      'X-RAY: Only non-empty cells (hits, misses, ships) are rendered; empty space hidden.',
    ]),
  ));

  el.appendChild(content);

  // Return button
  const returnBtn = document.createElement('button');
  returnBtn.className = 'crt-button help-screen__return';
  returnBtn.textContent = 'RETURN';
  returnBtn.addEventListener('click', () => {
    router.navigate('title');
  });
  el.appendChild(returnBtn);

  container.appendChild(el);
  getLogger().emit('view.change', { screen: 'help' });

  return {
    unmount(): void {
      el.remove();
    },
  };
}
