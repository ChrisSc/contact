#!/usr/bin/env npx tsx

/**
 * analyze-log.ts — Parse a CONTACT JSONL session log and produce a battle report.
 *
 * Usage:
 *   npx tsx scripts/analyze-log.ts <path-to-log.jsonl> [--json]
 *
 * Outputs a formatted battle breakdown with per-player and aggregate statistics.
 * Pass --json to get machine-readable JSON output instead.
 */

import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEvent {
  ts: string;
  seq: number;
  event: string;
  session: string;
  data: Record<string, unknown>;
}

interface PlayerReport {
  designation: string;
  shotsFired: number;
  torpedoHits: number;
  torpedoMisses: number;
  totalHits: number;
  hitRate: number;
  actionErrors: number;
  actionTotal: number;
  errorRate: number;
  shipsSunk: number;
  shipsLost: number;
  longestHitStreak: number;
  creditsEarned: number;
  creditsSpent: number;
  creditsFinal: number;
  perksBought: Record<string, number>;
  perksUsed: Record<string, number>;
  sunkOrder: Array<{ ship: string; turn: number; method: string }>;
  shipsLostOrder: Array<{ ship: string; turn: number; method: string }>;
  setupTime: number; // ms
  avgTurnTime: number; // ms
  depthChargeHits: number;
  depthChargeSinks: number;
  sonarPingsPositive: number;
  sonarPingsNegative: number;
  droneScansTotal: number;
  droneContactsFound: number;
}

interface TurnEvent {
  player: number;
  turn: number;
  startTs: string;
  endTs: string;
  action: string;
  result: string;
  perksUsed: string[];
  perksBought: string[];
  creditsGained: number;
  creditsSpent: number;
}

interface BattleReport {
  session: string;
  version: string;
  rank: string;
  mode: string;
  aiModel: string | null;
  date: string;
  duration: { total: number; setup: number; combat: number };
  totalTurns: number;
  winner: { player: number; designation: string };
  players: [PlayerReport, PlayerReport];
  timeline: TimelineEntry[];
  turnBreakdown: TurnEvent[];
  momentum: MomentumSnapshot[];
  shipSurvival: ShipSurvival[];
}

interface TimelineEntry {
  turn: number;
  player: number;
  event: string;
  detail: string;
}

interface MomentumSnapshot {
  turn: number;
  alphaShipsSunk: number;
  bravoShipsSunk: number;
  alphaCredits: number;
  bravoCredits: number;
}

interface ShipSurvival {
  ship: string;
  size: number;
  alphaFate: string;
  bravoFate: string;
  alphaTurnSunk: number | null;
  bravoTurnSunk: number | null;
}

// ---------------------------------------------------------------------------
// Ship metadata
// ---------------------------------------------------------------------------

const SHIPS: Record<string, { name: string; size: number }> = {
  typhoon: { name: 'Typhoon', size: 5 },
  akula: { name: 'Akula', size: 4 },
  seawolf: { name: 'Seawolf', size: 3 },
  virginia: { name: 'Virginia', size: 3 },
  narwhal: { name: 'Narwhal', size: 3 },
  midget: { name: 'Midget Sub', size: 2 },
  piranha: { name: 'Piranha', size: 2 },
};

const PERK_NAMES: Record<string, string> = {
  sonar_ping: 'Sonar Ping',
  recon_drone: 'Recon Drone',
  depth_charge: 'Depth Charge',
  g_sonar: 'G-SONAR',
  radar_jammer: 'Radar Jammer',
  silent_running: 'Silent Running',
  acoustic_cloak: 'Acoustic Cloak',
};

const PERK_COSTS: Record<string, number> = {
  sonar_ping: 3, recon_drone: 10, depth_charge: 25, g_sonar: 18,
  radar_jammer: 5, silent_running: 10, acoustic_cloak: 6,
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseLog(path: string): LogEvent[] {
  const raw = fs.readFileSync(path, 'utf-8');
  return raw.trim().split('\n').map(line => JSON.parse(line) as LogEvent);
}

function tsMs(ts: string): number {
  return new Date(ts).getTime();
}

function pname(p: number): string {
  return p === 0 ? 'ALPHA' : 'BRAVO';
}

// ---------------------------------------------------------------------------
// Normalize combat.sunk events (handle legacy logs without enemy/method)
// ---------------------------------------------------------------------------

interface NormalizedSunk {
  seq: number;
  attacker: number;  // player who landed the kill
  enemy: number;     // player who lost the ship
  ship: string;
  method: string;
}

function normalizeSunkEvents(events: LogEvent[]): NormalizedSunk[] {
  const sunkEvents = events.filter(e => e.event === 'combat.sunk');
  const turnStarts = events.filter(e => e.event === 'game.turn_start');

  return sunkEvents.map(e => {
    const player = e.data.player as number;

    if (e.data.enemy !== undefined) {
      // New format: player=attacker, enemy=defender
      return {
        seq: e.seq,
        attacker: player,
        enemy: e.data.enemy as number,
        ship: e.data.ship as string,
        method: (e.data.method as string) ?? 'torpedo',
      };
    }

    // Legacy format: player was attacker, derive enemy from whose turn it is
    // Find the most recent turn_start before this sunk event
    const nearestTurn = turnStarts.filter(t => t.seq <= e.seq).pop();
    const currentTurnPlayer = nearestTurn ? (nearestTurn.data.player as number) : 0;

    // The attacker is whoever's turn it is; the enemy is the other player
    return {
      seq: e.seq,
      attacker: currentTurnPlayer,
      enemy: currentTurnPlayer === 0 ? 1 : 0,
      ship: e.data.ship as string,
      method: (e.data.method as string) ?? 'torpedo',
    };
  });
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyze(events: LogEvent[]): BattleReport {
  const session = events[0]?.session ?? 'unknown';
  const sysInit = events.find(e => e.event === 'system.init');
  const version = (sysInit?.data.version as string) ?? 'unknown';
  const gameStartEvents = events.filter(e => e.event === 'game.start');
  const rank = (gameStartEvents[gameStartEvents.length - 1]?.data.rank as string) ?? 'unknown';
  // Mode: from game.start data, or infer from ai.turn_start presence
  const lastGameStart = gameStartEvents[gameStartEvents.length - 1];
  const hasAiTurns = events.some(e => e.event === 'ai.turn_start');
  const mode = (lastGameStart?.data.mode as string) ?? (hasAiTurns ? 'ai' : 'local');
  // AI model: from ai.turn_start data
  const firstAiTurn = events.find(e => e.event === 'ai.turn_start');
  const aiModel = (firstAiTurn?.data.model as string) ?? (hasAiTurns ? 'unknown' : null);
  const gameStart = events[0]!.ts;
  const gameEnd = events[events.length - 1]!.ts;
  const date = gameStart.split('T')[0]!;

  // Phase timing
  const phaseChanges = events.filter(e => e.event === 'game.phase_change');
  const combatStart = phaseChanges.find(e => e.data.to === 'combat')?.ts ?? gameStart;
  const setupDuration = tsMs(combatStart) - tsMs(gameStart);
  const combatDuration = tsMs(gameEnd) - tsMs(combatStart);
  const totalDuration = tsMs(gameEnd) - tsMs(gameStart);

  // Victory
  const victory = events.find(e => e.event === 'game.victory');
  const winner = {
    player: (victory?.data.winner as number) ?? -1,
    designation: (victory?.data.designation as string) ?? 'UNKNOWN',
  };
  const totalTurns = (victory?.data.turnCount as number) ?? 0;

  // Per-player setup timing
  const p1ConfirmTs = phaseChanges.find(e => e.data.from === 'setup_p1')?.ts ?? combatStart;
  const p2ConfirmTs = phaseChanges.find(e => e.data.from === 'setup_p2')?.ts ?? combatStart;
  const p1SetupMs = tsMs(p1ConfirmTs) - tsMs(gameStart);
  const p2SetupMs = tsMs(p2ConfirmTs) - tsMs(p1ConfirmTs);

  // Build turn timeline from turn_start/turn_end pairs
  const turnStarts = events.filter(e => e.event === 'game.turn_start');
  const turnEnds = events.filter(e => e.event === 'game.turn_end');

  // Per-turn event grouping
  const turnEvents: TurnEvent[] = [];
  for (let i = 0; i < turnEnds.length; i++) {
    const te = turnEnds[i]!;
    const ts = turnStarts[i]; // matching start
    const nextTs = turnStarts[i + 1];
    const turn = te.data.turn as number;
    const player = te.data.player as number;

    // Find events in this turn window
    const startSeq = ts?.seq ?? 0;
    const endSeq = nextTs?.seq ?? events[events.length - 1]!.seq + 1;
    const turnWindow = events.filter(e => e.seq >= startSeq && e.seq < endSeq);

    const fires = turnWindow.filter(e => e.event === 'combat.fire' && e.data.player === player);
    const perksUsed = turnWindow.filter(e => e.event === 'perk.use' && e.data.player === player);
    const purchases = turnWindow.filter(e => e.event === 'economy.purchase' && e.data.player === player);
    const credits = turnWindow.filter(e => e.event === 'economy.credit' && e.data.player === player);

    let action = 'torpedo';
    let result = '';
    if (perksUsed.length > 0) {
      const attackPerk = perksUsed.find(e =>
        ['recon_drone', 'depth_charge', 'g_sonar'].includes(e.data.perkId as string));
      if (attackPerk) {
        action = attackPerk.data.perkId as string;
        result = attackPerk.data.result as string;
      }
    }
    if (fires.length > 0) {
      action = 'torpedo';
      result = fires[0]!.data.result as string;
      if (result === 'hit' && fires[0]!.data.ship) {
        result = `hit (${fires[0]!.data.ship})`;
      }
    }

    turnEvents.push({
      player,
      turn,
      startTs: ts?.ts ?? '',
      endTs: te.ts,
      action,
      result,
      perksUsed: perksUsed.map(e => e.data.perkId as string),
      perksBought: purchases.map(e => e.data.perkId as string),
      creditsGained: credits.reduce((sum, e) => sum + (e.data.amount as number), 0),
      creditsSpent: purchases.reduce((sum, e) => sum + (e.data.cost as number), 0),
    });
  }

  // Also handle the final turn if game ended without turn_end (victory mid-turn)
  if (turnStarts.length > turnEnds.length) {
    const lastStart = turnStarts[turnStarts.length - 1]!;
    const turn = lastStart.data.turn as number;
    const player = lastStart.data.player as number;
    const startSeq = lastStart.seq;
    const turnWindow = events.filter(e => e.seq >= startSeq);

    const fires = turnWindow.filter(e => e.event === 'combat.fire' && e.data.player === player);
    const perksUsed = turnWindow.filter(e => e.event === 'perk.use' && e.data.player === player);
    const purchases = turnWindow.filter(e => e.event === 'economy.purchase' && e.data.player === player);
    const credits = turnWindow.filter(e => e.event === 'economy.credit' && e.data.player === player);

    let action = 'torpedo';
    let result = '';
    if (fires.length > 0) {
      action = 'torpedo';
      result = fires[0]!.data.result as string;
    }

    turnEvents.push({
      player,
      turn,
      startTs: lastStart.ts,
      endTs: gameEnd,
      action,
      result,
      perksUsed: perksUsed.map(e => e.data.perkId as string),
      perksBought: purchases.map(e => e.data.perkId as string),
      creditsGained: credits.reduce((sum, e) => sum + (e.data.amount as number), 0),
      creditsSpent: purchases.reduce((sum, e) => sum + (e.data.cost as number), 0),
    });
  }

  // Normalize sunk events (handles legacy + new format)
  const sunkData = normalizeSunkEvents(events);

  // Build player reports
  const players: [PlayerReport, PlayerReport] = [buildPlayerReport(0, events, sunkData, turnEvents, p1SetupMs), buildPlayerReport(1, events, sunkData, turnEvents, p2SetupMs)];

  // Timeline — key moments
  const timeline: TimelineEntry[] = [];
  for (const s of sunkData) {
    const shipName = SHIPS[s.ship]?.name ?? s.ship;
    const nearestTurnStart = turnStarts.filter(t => t.seq < s.seq).pop();
    const turn = (nearestTurnStart?.data.turn as number) ?? 0;
    timeline.push({
      turn,
      player: s.attacker,
      event: 'SUNK',
      detail: `${pname(s.attacker)} sank ${shipName} via ${s.method}`,
    });
  }

  // Perk deployments
  const perkEffects = events.filter(e => e.event === 'perk.effect');
  for (const e of perkEffects) {
    const player = e.data.player as number;
    const perkId = e.data.perkId as string;
    const nearestTurnStart = turnStarts.filter(t => t.seq < e.seq).pop();
    const turn = (nearestTurnStart?.data.turn as number) ?? 0;
    const perkName = PERK_NAMES[perkId] ?? perkId;
    let detail = `${pname(player)} deployed ${perkName}`;
    if (e.data.shipId) detail += ` on ${SHIPS[e.data.shipId as string]?.name ?? e.data.shipId}`;
    timeline.push({ turn, player, event: 'PERK', detail });
  }

  // Depth charges
  const dcEvents = events.filter(e => e.event === 'perk.use' && e.data.perkId === 'depth_charge');
  for (const e of dcEvents) {
    const player = e.data.player as number;
    const nearestTurnStart = turnStarts.filter(t => t.seq < e.seq).pop();
    const turn = (nearestTurnStart?.data.turn as number) ?? 0;
    timeline.push({
      turn,
      player,
      event: 'DEPTH_CHARGE',
      detail: `${pname(player)} depth charge at ${e.data.target}: ${e.data.result}`,
    });
  }

  timeline.sort((a, b) => a.turn - b.turn);

  // Momentum snapshots (every 5 turns)
  const momentum: MomentumSnapshot[] = [];
  let alphaCredits = 5, bravoCredits = 5; // starting credits

  // Build running sunk totals keyed by turn
  const sunkByTurn: Array<{ turn: number; attacker: number }> = sunkData.map(s => {
    const nearestTurnStart = turnStarts.filter(t => t.seq < s.seq).pop();
    return { turn: (nearestTurnStart?.data.turn as number) ?? 0, attacker: s.attacker };
  });

  // Build running credit balance keyed by turn
  const creditByTurn: Array<{ turn: number; player: number; balance: number }> = [];
  for (const e of events) {
    if (e.event === 'economy.credit' || e.event === 'economy.purchase') {
      const nearestTurnStart = turnStarts.filter(t => t.seq <= e.seq).pop();
      creditByTurn.push({
        turn: (nearestTurnStart?.data.turn as number) ?? 0,
        player: e.data.player as number,
        balance: e.data.balance as number,
      });
    }
  }

  // Walk through turns building running totals
  let runAlphaSunk = 0, runBravoSunk = 0;
  let runAlphaCr = 5, runBravoCr = 5;
  for (let t = 1; t <= totalTurns; t++) {
    for (const s of sunkByTurn) {
      if (s.turn === t) {
        if (s.attacker === 0) runAlphaSunk++;
        else runBravoSunk++;
      }
    }
    for (const c of creditByTurn) {
      if (c.turn === t) {
        if (c.player === 0) runAlphaCr = c.balance;
        else runBravoCr = c.balance;
      }
    }
    // Scale snapshot interval: every 5 turns for short games, wider for long ones
    const interval = totalTurns <= 50 ? 5 : totalTurns <= 150 ? 10 : Math.ceil(totalTurns / 20);
    if (t % interval === 0 || t === totalTurns) {
      momentum.push({
        turn: t,
        alphaShipsSunk: runAlphaSunk,
        bravoShipsSunk: runBravoSunk,
        alphaCredits: runAlphaCr,
        bravoCredits: runBravoCr,
      });
    }
  }

  // Ship survival table
  const shipSurvival: ShipSurvival[] = [];
  for (const [id, info] of Object.entries(SHIPS)) {
    const alphaLost = sunkData.find(s => s.ship === id && s.enemy === 0);
    const bravoLost = sunkData.find(s => s.ship === id && s.enemy === 1);
    const alphaTurn = alphaLost
      ? (turnStarts.filter(t => t.seq < alphaLost.seq).pop()?.data.turn as number) ?? null
      : null;
    const bravoTurn = bravoLost
      ? (turnStarts.filter(t => t.seq < bravoLost.seq).pop()?.data.turn as number) ?? null
      : null;

    shipSurvival.push({
      ship: info.name,
      size: info.size,
      alphaFate: alphaLost ? `T${alphaTurn} ${alphaLost.method}` : 'SURVIVED',
      bravoFate: bravoLost ? `T${bravoTurn} ${bravoLost.method}` : 'SURVIVED',
      alphaTurnSunk: alphaTurn,
      bravoTurnSunk: bravoTurn,
    });
  }
  shipSurvival.sort((a, b) => a.size - b.size);

  return {
    session,
    version,
    rank,
    mode,
    aiModel,
    date,
    duration: { total: totalDuration, setup: setupDuration, combat: combatDuration },
    totalTurns,
    winner,
    players,
    timeline,
    turnBreakdown: turnEvents,
    momentum,
    shipSurvival,
  };
}

function buildPlayerReport(
  playerIdx: number,
  events: LogEvent[],
  sunkData: NormalizedSunk[],
  turnEvents: TurnEvent[],
  setupMs: number,
): PlayerReport {
  const fires = events.filter(e => e.event === 'combat.fire' && e.data.player === playerIdx);
  const torpedoHits = fires.filter(e => e.data.result === 'hit').length;
  const torpedoMisses = fires.filter(e => e.data.result === 'miss').length;

  // Depth charges count as shots fired; each cell hit counts as a hit
  const dcUseEvents = events.filter(e => e.event === 'perk.use' && e.data.player === playerIdx && e.data.perkId === 'depth_charge');
  let dcHitCount = 0;
  for (const e of dcUseEvents) {
    const result = e.data.result as string;
    const match = result.match(/(\d+) hits?/);
    if (match) dcHitCount += parseInt(match[1]!, 10);
  }
  const shotsFired = fires.length + dcUseEvents.length;
  const totalHits = torpedoHits + dcHitCount;

  // Hit streak
  let maxStreak = 0, streak = 0;
  for (const f of fires) {
    if (f.data.result === 'hit') { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  // Sunk tracking (using normalized data)
  const killsByPlayer = sunkData.filter(s => s.attacker === playerIdx);
  const lostByPlayer = sunkData.filter(s => s.enemy === playerIdx);
  const turnStarts = events.filter(e => e.event === 'game.turn_start');

  const sunkOrder = killsByPlayer.map(s => {
    const nearestTurn = turnStarts.filter(t => t.seq < s.seq).pop();
    return {
      ship: SHIPS[s.ship]?.name ?? s.ship,
      turn: (nearestTurn?.data.turn as number) ?? 0,
      method: s.method,
    };
  });

  const shipsLostOrder = lostByPlayer.map(s => {
    const nearestTurn = turnStarts.filter(t => t.seq < s.seq).pop();
    return {
      ship: SHIPS[s.ship]?.name ?? s.ship,
      turn: (nearestTurn?.data.turn as number) ?? 0,
      method: s.method,
    };
  });

  // Credits
  const creditEvents = events.filter(e => e.event === 'economy.credit' && e.data.player === playerIdx);
  const purchaseEvents = events.filter(e => e.event === 'economy.purchase' && e.data.player === playerIdx);
  const creditsEarned = creditEvents.reduce((sum, e) => sum + (e.data.amount as number), 0);
  const creditsSpent = purchaseEvents.reduce((sum, e) => sum + (e.data.cost as number), 0);

  // Final balance from last credit or purchase event
  const allEcon = events.filter(e =>
    (e.event === 'economy.credit' || e.event === 'economy.purchase') && e.data.player === playerIdx);
  const creditsFinal = allEcon.length > 0
    ? (allEcon[allEcon.length - 1]!.data.balance as number)
    : 5; // starting credits if never earned/spent

  // Perks bought
  const perksBought: Record<string, number> = {};
  for (const e of purchaseEvents) {
    const id = e.data.perkId as string;
    perksBought[id] = (perksBought[id] ?? 0) + 1;
  }

  // Perks used
  const perkUseEvents = events.filter(e => e.event === 'perk.use' && e.data.player === playerIdx);
  const perksUsed: Record<string, number> = {};
  for (const e of perkUseEvents) {
    const id = e.data.perkId as string;
    perksUsed[id] = (perksUsed[id] ?? 0) + 1;
  }

  // Depth charge stats
  const dcUses = perkUseEvents.filter(e => e.data.perkId === 'depth_charge');
  let dcHits = 0, dcSinks = 0;
  for (const e of dcUses) {
    const result = e.data.result as string;
    const match = result.match(/(\d+) hits?, (\d+) sunk/);
    if (match) {
      dcHits += parseInt(match[1]!, 10);
      dcSinks += parseInt(match[2]!, 10);
    }
  }

  // Sonar ping stats
  const pingUses = perkUseEvents.filter(e => e.data.perkId === 'sonar_ping');
  let sonarPos = 0, sonarNeg = 0;
  for (const e of pingUses) {
    const result = e.data.result as string;
    const match = result.match(/(\d+) contacts/);
    const contacts = match ? parseInt(match[1]!, 10) : 0;
    if (contacts > 0) sonarPos++;
    else sonarNeg++;
  }

  // Drone stats
  const droneUses = perkUseEvents.filter(e => e.data.perkId === 'recon_drone');
  let droneContacts = 0;
  for (const e of droneUses) {
    const result = e.data.result as string;
    const match = result.match(/(\d+) contacts/);
    if (match) droneContacts += parseInt(match[1]!, 10);
  }

  // Action errors — ai.action events within ai.turn_start/ai.turn_end windows for this player
  const allAiStarts = events.filter(e => e.event === 'ai.turn_start');
  const allAiEnds = events.filter(e => e.event === 'ai.turn_end');
  let actionErrors = 0;
  let actionTotal = 0;
  for (let i = 0; i < allAiStarts.length; i++) {
    const aiStart = allAiStarts[i]!;
    if ((aiStart.data.player as number) !== playerIdx) continue;
    const startSeq = aiStart.seq;
    const endSeq = allAiEnds[i]?.seq ?? events[events.length - 1]!.seq + 1;
    for (const e of events) {
      if (e.seq >= startSeq && e.seq <= endSeq && e.event === 'ai.action') {
        actionTotal++;
        if (e.data.success === false) actionErrors++;
      }
    }
  }

  // Turn timing
  const playerTurns = turnEvents.filter(t => t.player === playerIdx);
  let totalTurnMs = 0;
  let measuredTurns = 0;
  for (const t of playerTurns) {
    if (t.startTs && t.endTs) {
      totalTurnMs += tsMs(t.endTs) - tsMs(t.startTs);
      measuredTurns++;
    }
  }

  return {
    designation: pname(playerIdx),
    shotsFired,
    torpedoHits,
    torpedoMisses,
    totalHits,
    hitRate: shotsFired > 0 ? totalHits / shotsFired : 0,
    actionErrors,
    actionTotal: actionTotal,
    errorRate: actionTotal > 0 ? actionErrors / actionTotal : 0,
    shipsSunk: killsByPlayer.length,
    shipsLost: lostByPlayer.length,
    longestHitStreak: maxStreak,
    creditsEarned,
    creditsSpent,
    creditsFinal,
    perksBought,
    perksUsed,
    sunkOrder,
    shipsLostOrder,
    setupTime: setupMs,
    avgTurnTime: measuredTurns > 0 ? totalTurnMs / measuredTurns : 0,
    depthChargeHits: dcHits,
    depthChargeSinks: dcSinks,
    sonarPingsPositive: sonarPos,
    sonarPingsNegative: sonarNeg,
    droneScansTotal: droneUses.length,
    droneContactsFound: droneContacts,
  };
}

// ---------------------------------------------------------------------------
// Formatted output
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

function bar(filled: number, total: number, width: number = 20): string {
  const n = Math.round((filled / Math.max(total, 1)) * width);
  return '\u2588'.repeat(n) + '\u2591'.repeat(width - n);
}

function printReport(r: BattleReport): void {
  const W = 62;
  const line = '\u2550'.repeat(W);
  const thin = '\u2500'.repeat(W - 4);

  /** Pad or truncate content to exactly W characters (fits between ║…║) */
  function L(s: string): string {
    if (s.length >= W) return s.slice(0, W);
    return s + ' '.repeat(W - s.length);
  }

  /** Section divider using thin line with 2-char margins */
  function divider(): void {
    console.log(`\u2551  ${thin}  \u2551`);
  }

  /** Section header */
  function header(title: string): void {
    console.log(`\u2551${L(`  ${title}`)}\u2551`);
  }

  /** Side-by-side comparison row */
  function row(label: string, av: string, bv: string): void {
    console.log(`\u2551${L(`  ${av.padStart(12)}  ${label.padStart(15).padEnd(30)}  ${bv.padEnd(12)}`)}\u2551`);
  }

  console.log();
  console.log(`\u2554${line}\u2557`);
  console.log(`\u2551${L('  CONTACT \u2014 AFTER ACTION REPORT')}\u2551`);
  console.log(`\u2560${line}\u2563`);
  console.log(`\u2551${L(`  Session:  ${r.session}`)}\u2551`);
  console.log(`\u2551${L(`  Date:     ${r.date}`)}\u2551`);
  console.log(`\u2551${L(`  Version:  ${r.version}`)}\u2551`);
  console.log(`\u2551${L(`  Rank:     ${r.rank.toUpperCase()}`)}\u2551`);
  console.log(`\u2551${L(`  Mode:     ${r.mode.toUpperCase()}`)}\u2551`);
  if (r.mode === 'ai') {
    console.log(`\u2551${L(`  ALPHA:    Human`)}\u2551`);
    console.log(`\u2551${L(`  BRAVO:    ${r.aiModel ?? 'unknown'}`)}\u2551`);
  }
  const dur = `  Duration: ${formatDuration(r.duration.total)} (setup: ${formatDuration(r.duration.setup)}, combat: ${formatDuration(r.duration.combat)})`;
  console.log(`\u2551${L(dur)}\u2551`);
  console.log(`\u2551${L(`  Turns:    ${r.totalTurns}`)}\u2551`);
  console.log(`\u2560${line}\u2563`);

  // Winner banner
  const winBanner = `\u2605 WINNER: ${r.winner.designation} \u2605`;
  const winPad = Math.max(0, Math.floor((W - winBanner.length) / 2));
  console.log(`\u2551${L(' '.repeat(winPad) + winBanner)}\u2551`);
  console.log(`\u2560${line}\u2563`);

  // Side-by-side comparison
  const a = r.players[0];
  const b = r.players[1];

  header('COMBAT STATISTICS');
  divider();
  row('', 'ALPHA', 'BRAVO');
  divider();
  row('Shots Fired', String(a.shotsFired), String(b.shotsFired));
  row('Total Hits', String(a.totalHits), String(b.totalHits));
  row('Torpedo Misses', String(a.torpedoMisses), String(b.torpedoMisses));
  row('Hit Rate', `${(a.hitRate * 100).toFixed(1)}%`, `${(b.hitRate * 100).toFixed(1)}%`);
  row('Error Rate', `${(a.errorRate * 100).toFixed(1)}%`, `${(b.errorRate * 100).toFixed(1)}%`);
  row('Hit Streak', String(a.longestHitStreak), String(b.longestHitStreak));
  row('Ships Sunk', String(a.shipsSunk), String(b.shipsSunk));
  row('Ships Lost', String(a.shipsLost), String(b.shipsLost));

  divider();
  header('ECONOMY');
  divider();
  row('CR Earned', String(a.creditsEarned), String(b.creditsEarned));
  row('CR Spent', String(a.creditsSpent), String(b.creditsSpent));
  row('CR Remaining', String(a.creditsFinal), String(b.creditsFinal));

  divider();
  header('PERK USAGE');
  divider();

  const allPerks = new Set([...Object.keys(a.perksUsed), ...Object.keys(b.perksUsed)]);
  const perkOrder = ['sonar_ping', 'recon_drone', 'depth_charge', 'g_sonar', 'radar_jammer', 'silent_running', 'acoustic_cloak'];
  for (const perk of perkOrder) {
    if (!allPerks.has(perk) && !(a.perksBought[perk]) && !(b.perksBought[perk])) continue;
    const name = PERK_NAMES[perk] ?? perk;
    const aBought = a.perksBought[perk] ?? 0;
    const bBought = b.perksBought[perk] ?? 0;
    const aUsed = a.perksUsed[perk] ?? 0;
    const bUsed = b.perksUsed[perk] ?? 0;
    row(name, `${aBought}b/${aUsed}u`, `${bBought}b/${bUsed}u`);
  }

  // Recon details
  if (a.sonarPingsPositive + a.sonarPingsNegative + b.sonarPingsPositive + b.sonarPingsNegative > 0) {
    divider();
    header('RECON INTEL');
    divider();
    row('Sonar +/-', `${a.sonarPingsPositive}/${a.sonarPingsNegative}`, `${b.sonarPingsPositive}/${b.sonarPingsNegative}`);
    row('Drone Scans', String(a.droneScansTotal), String(b.droneScansTotal));
    row('Drone Contacts', String(a.droneContactsFound), String(b.droneContactsFound));
    if (a.depthChargeHits + b.depthChargeHits > 0) {
      row('DC Hits/Sinks', `${a.depthChargeHits}/${a.depthChargeSinks}`, `${b.depthChargeHits}/${b.depthChargeSinks}`);
    }
  }

  // Timing
  divider();
  header('TIMING');
  divider();
  row('Setup Time', formatDuration(a.setupTime), formatDuration(b.setupTime));
  row('Avg Turn', formatDuration(a.avgTurnTime), formatDuration(b.avgTurnTime));

  console.log(`\u2560${line}\u2563`);

  // Ship survival table
  header('SHIP SURVIVAL');
  divider();
  console.log(`\u2551${L(`  ${'Ship'.padEnd(12)}${'Size'.padStart(4)}  ${'ALPHA'.padEnd(20)}${'BRAVO'.padEnd(20)}`)}\u2551`);
  divider();

  for (const s of r.shipSurvival) {
    const aFate = s.alphaFate.length > 18 ? s.alphaFate.slice(0, 18) : s.alphaFate;
    const bFate = s.bravoFate.length > 18 ? s.bravoFate.slice(0, 18) : s.bravoFate;
    console.log(`\u2551${L(`  ${s.ship.padEnd(12)}${String(s.size).padStart(4)}  ${aFate.padEnd(20)}${bFate.padEnd(20)}`)}\u2551`);
  }

  console.log(`\u2560${line}\u2563`);

  // Kill order
  header('KILL ORDER');
  divider();

  // Merge and sort by turn
  const allKills = [
    ...a.sunkOrder.map(k => ({ ...k, by: 'ALPHA' })),
    ...b.sunkOrder.map(k => ({ ...k, by: 'BRAVO' })),
  ].sort((x, y) => x.turn - y.turn);

  for (const kill of allKills) {
    const killLine = `  T${String(kill.turn).padStart(3)}  ${kill.by.padEnd(6)} sank ${kill.ship.padEnd(12)} (${kill.method})`;
    console.log(`\u2551${L(killLine)}\u2551`);
  }

  console.log(`\u2560${line}\u2563`);

  // Momentum chart
  header('MOMENTUM (ships sunk over time)');
  divider();

  for (const snap of r.momentum) {
    const aBar = bar(snap.alphaShipsSunk, 7, 7);
    const bBar = bar(snap.bravoShipsSunk, 7, 7);
    const turnStr = `T${String(snap.turn).padStart(3)}`;
    const momLine = `  ${turnStr}  A ${aBar} ${String(snap.alphaShipsSunk).padStart(1)}/7  B ${bBar} ${String(snap.bravoShipsSunk).padStart(1)}/7  CR:${String(snap.alphaCredits).padStart(3)}/${String(snap.bravoCredits).padStart(3)}`;
    console.log(`\u2551${L(momLine)}\u2551`);
  }

  // Key events timeline
  console.log(`\u2560${line}\u2563`);
  header('KEY EVENTS');
  divider();

  for (const te of r.timeline) {
    const turnStr = `T${String(te.turn).padStart(3)}`;
    const maxDetail = W - 10;
    const detail = te.detail.length > maxDetail ? te.detail.slice(0, maxDetail - 3) + '...' : te.detail;
    console.log(`\u2551${L(`  ${turnStr}  ${detail}`)}\u2551`);
  }

  console.log(`\u255a${line}\u255d`);
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const filePath = args.find(a => !a.startsWith('-'));

if (!filePath) {
  console.error('Usage: npx tsx scripts/analyze-log.ts <path-to-log.jsonl> [--json]');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const events = parseLog(filePath);
const report = analyze(events);

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
