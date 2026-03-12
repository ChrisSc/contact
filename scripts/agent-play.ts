#!/usr/bin/env npx tsx

/**
 * agent-play.ts — Claude vs Claude submarine warfare.
 *
 * Two Claude instances command opposing submarine fleets in a 7x7x7 volumetric
 * grid. Each agent receives a structured view of its game state and chooses
 * actions via tool use — no random heuristics, pure strategic reasoning.
 *
 * Usage:
 *   npx tsx scripts/agent-play.ts [--verbose] [--rank recruit|enlisted|officer] [--export] [--no-memory]
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { GameController } from '../src/engine/game';
import { GamePhase } from '../src/types/game';
import type { PlayerIndex, Rank } from '../src/types/game';
import { RANK_CONFIGS } from '../src/types/game';
import { getLogger } from '../src/observability/logger';
import { serializeSession } from '../src/observability/export';
import { gameTools, executeTool, forceEndTurn } from '../src/engine/ai/ai-tools';
import { SYSTEM_PROMPT, buildTurnBriefing } from '../src/engine/ai/ai-briefing';
import { placeFleetRandomly } from '../src/engine/ai/ai-placement';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const exportJsonl = args.includes('--export') || args.includes('-e');
const noMemory = args.includes('--no-memory');
let rank: Rank = 'officer';
const rankIdx = args.indexOf('--rank');
if (rankIdx !== -1 && args[rankIdx + 1]) {
  const val = args[rankIdx + 1] as string;
  if (val === 'recruit' || val === 'enlisted' || val === 'officer') rank = val;
  else { console.error(`Invalid rank: ${val}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Persistent memory
// ---------------------------------------------------------------------------

const MEMORY_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'memory');
const MEMORY_MAX_CHARS = 2000;

type PlayerKey = 'alpha' | 'bravo';

function memoryPath(playerKey: PlayerKey): string {
  return path.join(MEMORY_DIR, `agent-${playerKey}.md`);
}

function loadMemory(playerKey: PlayerKey): string | null {
  const fp = memoryPath(playerKey);
  try {
    const content = fs.readFileSync(fp, 'utf-8').trim();
    return content || null;
  } catch {
    return null;
  }
}

function saveMemory(playerKey: PlayerKey, content: string): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  let text = content;
  if (text.length > MEMORY_MAX_CHARS) {
    // Truncate at last complete line within limit
    text = text.slice(0, MEMORY_MAX_CHARS);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline > 0) text = text.slice(0, lastNewline);
  }
  fs.writeFileSync(memoryPath(playerKey), text, 'utf-8');
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

const client = new Anthropic();
// const MODEL = 'claude-sonnet-4-6';
const MODEL = 'claude-haiku-4-5-20251001';


// ---------------------------------------------------------------------------
// Agent turn — one Claude API conversation for one player's turn
// ---------------------------------------------------------------------------

async function executeAgentTurn(
  gc: GameController,
  turnMessages: Array<{ alpha: Anthropic.MessageParam[]; bravo: Anthropic.MessageParam[] }>,
  systemPrompt: string,
  stalemateBonusAwarded: boolean = false,
): Promise<void> {
  const state = gc.getState();
  const playerIdx = state.currentPlayer;
  const designation = playerIdx === 0 ? 'ALPHA' : 'BRAVO';
  const msgKey = playerIdx === 0 ? 'alpha' : 'bravo';

  const briefing = buildTurnBriefing(gc, stalemateBonusAwarded);

  if (verbose) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  TURN ${state.turnCount} — COMMANDER ${designation}`);
    console.log(`${'─'.repeat(56)}`);
  }

  // Keep only last 3 turns of history per player to bound context size
  const recentHistory = turnMessages.slice(-3);
  const playerHistory = recentHistory.flatMap(t => t[msgKey]);

  const messages: Anthropic.MessageParam[] = [
    ...playerHistory,
    { role: 'user', content: briefing },
  ];

  let turnOver = false;
  let apiCalls = 0;
  const maxApiCalls = 8; // safety limit per turn

  while (!turnOver && apiCalls < maxApiCalls && gc.getState().phase === GamePhase.Combat) {
    apiCalls++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      tools: gameTools as Anthropic.Tool[],
      messages,
    });

    // Process response content
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Extract any text reasoning
    for (const block of assistantContent) {
      if (block.type === 'text' && verbose) {
        console.log(`  ${designation}: ${block.text}`);
      }
    }

    // Process tool calls
    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      // Claude didn't use any tools — might need prompting
      messages.push({ role: 'user', content: 'Act now. Use tools — do not narrate.' });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue;

      const result = executeTool(gc, toolUse.name, toolUse.input as Record<string, unknown>);

      if (verbose) {
        const icon = result.success ? '✓' : '✗';
        console.log(`  ${icon} ${toolUse.name}(${JSON.stringify(toolUse.input)}) → ${result.message}`);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.message,
        is_error: !result.success,
      });

      if (result.turnOver) turnOver = true;

      // Check for victory mid-turn
      if (gc.getState().phase === GamePhase.Victory) {
        turnOver = true;
        break;
      }
    }

    messages.push({ role: 'user', content: toolResults });

    // If turn ended or game over, break
    if (turnOver) break;
  }

  if (apiCalls >= maxApiCalls && !turnOver) {
    console.warn(`  ⚠ ${designation} hit API call limit (${maxApiCalls}). Force-ending turn.`);
    forceEndTurn(gc);
  }

  // Store a minimal turn summary for short-term continuity (not the full briefing)
  const lastActions = messages
    .filter(m => m.role === 'user' && Array.isArray(m.content))
    .flatMap(m => (m.content as Anthropic.ToolResultBlockParam[]))
    .filter(b => b.type === 'tool_result' && !b.is_error)
    .map(b => b.content)
    .join('; ');
  const turnRecord = { alpha: [] as Anthropic.MessageParam[], bravo: [] as Anthropic.MessageParam[] };
  turnRecord[msgKey] = [
    { role: 'user' as const, content: `[Turn ${state.turnCount} summary] ${lastActions || 'no actions'}` },
    { role: 'assistant' as const, content: 'Acknowledged.' },
  ];
  turnMessages.push(turnRecord);
}

// ---------------------------------------------------------------------------
// Post-game reflection — agents update their persistent memory
// ---------------------------------------------------------------------------

async function reflectAndUpdateMemory(
  playerKey: PlayerKey,
  designation: string,
  gameState: ReturnType<GameController['getState']>,
  existingMemory: string | null,
): Promise<void> {
  const pi = playerKey === 'alpha' ? 0 : 1;
  const opp = playerKey === 'alpha' ? 1 : 0;
  const p = gameState.players[pi]!;
  const o = gameState.players[opp]!;
  const won = gameState.winner === pi;
  const hitRate = p.shotsFired > 0 ? ((p.shotsHit / p.shotsFired) * 100).toFixed(1) : '0.0';
  const oppHitRate = o.shotsFired > 0 ? ((o.shotsHit / o.shotsFired) * 100).toFixed(1) : '0.0';

  const memoryContext = existingMemory
    ? `YOUR EXISTING STRATEGIC MEMORY (from previous games):\n${existingMemory}`
    : 'This is your FIRST game — you have no prior memory.';

  console.log(`  ${designation} reflection: outcome=${won ? 'WON' : 'LOST'} (winner=${gameState.winner}, pi=${pi})`);

  const reflectionPrompt = `You just finished a game of CONTACT (3D submarine warfare). Reflect on the game and produce a strategic memory document.

GAME RESULTS:
- Outcome: *** YOU ${won ? 'WON' : 'LOST'} ***
- Game ended on turn ${gameState.turnCount}
- Your stats: ${p.shotsFired} shots, ${p.shotsHit} hits (${hitRate}%), ${p.shipsSunk} ships sunk, ${p.perksUsed} perks used, ${p.credits} CR remaining
- Opponent stats: ${o.shotsFired} shots, ${o.shotsHit} hits (${oppHitRate}%), ${o.shipsSunk} ships sunk, ${o.perksUsed} perks used
- REMINDER: You ${won ? 'WON this game. Your strategy worked — analyze what went RIGHT and preserve those lessons.' : 'LOST this game. Analyze what went WRONG and how to improve.'}

${memoryContext}

Write a REPLACEMENT strategic memory document (not an append). This document will be loaded before your next game to help you play better.

RULES FOR THE DOCUMENT:
- Maximum 2000 characters — be concise
- Use second person: "You should...", "Avoid...", "Remember..."
- Focus on ACTIONABLE tactical advice, not game narration
- Include insights about: opening strategy, credit management, recon vs attack balance, defensive perk timing, ship hunting patterns, common mistakes to avoid
- If you have existing memory, integrate what still seems valid and update/remove what doesn't
- Prioritize lessons that changed your understanding over obvious advice`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: reflectionPrompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('\n');

  saveMemory(playerKey, text);
  console.log(`  ${designation} memory updated (${Math.min(text.length, MEMORY_MAX_CHARS)} chars)`);
}

// ---------------------------------------------------------------------------
// Game runner
// ---------------------------------------------------------------------------

async function runGame(): Promise<void> {
  const rankLabel = RANK_CONFIGS[rank].label;
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  CONTACT — CLAUDE vs CLAUDE                           ║`);
  console.log(`║  Rank: ${rankLabel.padEnd(47)}║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  const gc = new GameController(undefined, rank);

  // Setup both fleets (random placement for now)
  console.log('Setting up ALPHA fleet...');
  placeFleetRandomly(gc);
  gc.confirmSetup();

  console.log('Setting up BRAVO fleet...');
  placeFleetRandomly(gc);
  gc.confirmSetup();

  console.log(`\nCombat begins. 7 ships each, 343 cells. Fight!\n`);

  // Load persistent memory and build per-agent system prompts
  const alphaMemory = noMemory ? null : loadMemory('alpha');
  const bravoMemory = noMemory ? null : loadMemory('bravo');

  function buildSystemPrompt(memory: string | null): string {
    if (!memory) return SYSTEM_PROMPT;
    return `${SYSTEM_PROMPT}\n\n═══════════════════════════════════════════════════\nSTRATEGIC MEMORY — LESSONS FROM PREVIOUS GAMES\n═══════════════════════════════════════════════════\n${memory}`;
  }

  const alphaSystemPrompt = buildSystemPrompt(alphaMemory);
  const bravoSystemPrompt = buildSystemPrompt(bravoMemory);

  if (!noMemory) {
    console.log(`Memory: ALPHA ${alphaMemory ? `(${alphaMemory.length} chars)` : '(none)'}, BRAVO ${bravoMemory ? `(${bravoMemory.length} chars)` : '(none)'}`);
  }

  const turnMessages: Array<{ alpha: Anthropic.MessageParam[]; bravo: Anthropic.MessageParam[] }> = [];
  let safety = 0;
  let nextTurnStalemateBonus = false;

  while (gc.getState().phase === GamePhase.Combat && safety < 200) {
    const currentSystemPrompt = gc.getState().currentPlayer === 0 ? alphaSystemPrompt : bravoSystemPrompt;
    await executeAgentTurn(gc, turnMessages, currentSystemPrompt, nextTurnStalemateBonus);

    // Check rank bonus — if awarded, the NEXT player's turn should be informed
    const bonus = gc.getLastRankBonus();
    if (bonus) {
      nextTurnStalemateBonus = true;
      if (verbose) {
        const p = bonus.player === 0 ? 'ALPHA' : 'BRAVO';
        console.log(`  ⤷ STALEMATE BONUS: ${p} +${bonus.amount} CR`);
      }
    } else {
      nextTurnStalemateBonus = false;
    }

    safety++;
  }

  // Results
  const state = gc.getState();
  const winner = state.winner;
  const winnerName = winner === 0 ? 'ALPHA' : 'BRAVO';

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  VICTORY: COMMANDER ${winnerName.padEnd(35)}║`);
  console.log(`║  Game ended on turn ${String(state.turnCount).padEnd(34)}║`);
  console.log(`╠════════════════════════════════════════════════════════╣`);

  for (const pi of [0, 1] as PlayerIndex[]) {
    const p = state.players[pi];
    const name = pi === 0 ? 'ALPHA' : 'BRAVO';
    const hitRate = p.shotsFired > 0 ? ((p.shotsHit / p.shotsFired) * 100).toFixed(1) : '0.0';
    console.log(`║  ${name}: ${p.shotsFired} shots, ${p.shotsHit} hits (${hitRate}%), ${p.shipsSunk} sunk  ${' '.repeat(Math.max(0, 12 - hitRate.length))}║`);
    console.log(`║         Credits: ${p.credits} CR remaining, ${p.perksUsed} perks used${' '.repeat(Math.max(0, 16 - String(p.credits).length))}║`);
  }
  console.log(`╚════════════════════════════════════════════════════════╝`);

  // Post-game reflection — both agents update their memory in parallel
  if (!noMemory) {
    console.log('\nReflecting on game...');
    await Promise.all([
      reflectAndUpdateMemory('alpha', 'ALPHA', state, alphaMemory),
      reflectAndUpdateMemory('bravo', 'BRAVO', state, bravoMemory),
    ]);
  }

  // Export JSONL if requested
  if (exportJsonl) {
    const logger = getLogger();
    const jsonl = serializeSession(logger.getBuffer());
    const filename = `contact-agent-${logger.getSessionId()}.jsonl`;
    fs.writeFileSync(filename, jsonl + '\n');
    console.log(`\nExported ${logger.getBuffer().length} events → ${filename}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

runGame().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
