/**
 * ai-opponent.ts — Browser-side AI turn executor using the Anthropic API.
 *
 * Creates a Claude client with the user's API key and executes complete
 * AI turns by calling the game engine through tool use.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { GameController } from '../game';
import { GamePhase } from '../../types/game';
import { gameTools, executeTool, forceEndTurn } from './ai-tools';
import { buildTurnBriefing, SYSTEM_PROMPT } from './ai-briefing';
import { getLogger } from '../../observability/logger';

const MODEL = 'claude-sonnet-4-6';
const MAX_API_CALLS_PER_TURN = 8;

interface TurnRecord {
  messages: Anthropic.MessageParam[];
}

export class AIOpponent {
  private client: Anthropic;
  private turnHistory: TurnRecord[] = [];

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Execute a complete AI turn. Mutates the GameController directly.
   * Returns an error string if something went wrong, undefined on success.
   */
  async executeTurn(gc: GameController, stalemateBonusAwarded: boolean = false): Promise<{ error?: string }> {
    const state = gc.getState();
    const logger = getLogger();

    logger.emit('ai.turn_start', {
      turn: state.turnCount,
      player: state.currentPlayer,
    });

    const briefing = buildTurnBriefing(gc, stalemateBonusAwarded);

    // Keep only last 3 turns of history to bound context size
    const recentHistory = this.turnHistory.slice(-3);
    const historyMessages = recentHistory.flatMap(t => t.messages);

    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: briefing },
    ];

    let turnOver = false;
    let apiCalls = 0;

    try {
      while (!turnOver && apiCalls < MAX_API_CALLS_PER_TURN && gc.getState().phase === GamePhase.Combat) {
        apiCalls++;

        const response = await this.callAPI(messages);

        const assistantContent = response.content;
        messages.push({ role: 'assistant', content: assistantContent });

        // Process tool calls
        const toolUses = assistantContent.filter(b => b.type === 'tool_use');
        if (toolUses.length === 0) {
          messages.push({ role: 'user', content: 'Act now. Use tools — do not narrate.' });
          continue;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          if (toolUse.type !== 'tool_use') continue;

          const result = executeTool(gc, toolUse.name, toolUse.input as Record<string, unknown>);

          logger.emit('ai.action', {
            tool: toolUse.name,
            input: toolUse.input,
            success: result.success,
            message: result.message,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.message,
            is_error: !result.success,
          });

          if (result.turnOver) turnOver = true;
          if (gc.getState().phase === GamePhase.Victory) {
            turnOver = true;
            break;
          }
        }

        messages.push({ role: 'user', content: toolResults });
        if (turnOver) break;
      }

      // Safety: force-end if AI hit the limit
      if (apiCalls >= MAX_API_CALLS_PER_TURN && !turnOver) {
        logger.emit('ai.error', { reason: 'api_call_limit', apiCalls });
        forceEndTurn(gc);
      }

      // Store minimal turn summary for continuity
      const lastActions = messages
        .filter(m => m.role === 'user' && Array.isArray(m.content))
        .flatMap(m => (m.content as Anthropic.ToolResultBlockParam[]))
        .filter(b => b.type === 'tool_result' && !b.is_error)
        .map(b => b.content)
        .join('; ');
      this.turnHistory.push({
        messages: [
          { role: 'user' as const, content: `[Turn ${state.turnCount} summary] ${lastActions || 'no actions'}` },
          { role: 'assistant' as const, content: 'Acknowledged.' },
        ],
      });

      logger.emit('ai.turn_end', {
        turn: state.turnCount,
        apiCalls,
        phase: gc.getState().phase,
      });

      return {};
    } catch (err: unknown) {
      logger.emit('ai.error', {
        reason: 'api_error',
        message: err instanceof Error ? err.message : String(err),
      });

      // Try to salvage the turn
      try {
        if (gc.getState().phase === GamePhase.Combat) {
          forceEndTurn(gc);
        }
      } catch {
        // Nothing we can do
      }

      return { error: this.formatError(err) };
    }
  }

  private async callAPI(messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    return this.client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      tools: gameTools as Anthropic.Tool[],
      messages,
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof Anthropic.AuthenticationError) {
      return 'INVALID API KEY — Return to title screen to re-enter your key.';
    }
    if (err instanceof Anthropic.RateLimitError) {
      return 'COMMS INTERFERENCE — Rate limited. Try again in a moment.';
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return 'SIGNAL LOST — Network error. Check your connection.';
    }
    if (err instanceof Error) {
      return `SYSTEM MALFUNCTION — ${err.message}`;
    }
    return 'UNKNOWN ERROR — AI turn failed.';
  }

  dispose(): void {
    this.turnHistory = [];
  }
}
