import {
  BaseAgent,
  BasePlugin,
  Context,
  Event,
  FunctionTool,
  InvocationContext,
  LlmAgent,
} from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../channel/channel.service.js';
import { MODEL } from '../constants.js';
import { createAskChoiceTool } from './ask-choice.tool.js';
import { PocLog } from './poc-log.js';

const STATIC_PREFIX =
  'You are the customer agent. Never invent a button click.';

export function customerInstruction(context: {
  sessionId: string;
}): string {
  return `${STATIC_PREFIX} sessionId=${context.sessionId}. Today is ${new Date().toISOString().slice(0, 10)}. When the user asks to choose, call ask_choice once and stop.`;
}

export function createQualifierAgent(): LlmAgent {
  return new LlmAgent({
    name: 'qualifier',
    model: MODEL,
    description: 'Silent intent tag. No channel, no tools.',
    instruction:
      'Reply with JSON only: {"intent":"choice"} or {"intent":"other"}. No prose.',
    outputSchema: z.object({
      intent: z.enum(['choice', 'other']),
    }),
  });
}

export function createCustomerAgent(channel: ChannelService, log: PocLog) {
  return new LlmAgent({
    name: 'customer',
    model: MODEL,
    description: 'Talks to the user and may pause on ask_choice.',
    instruction: (context) => customerInstruction(context),
    tools: [createAskChoiceTool(channel, log)],
    generateContentConfig: {
      thinkingConfig: { includeThoughts: true, thinkingBudget: 512 },
    },
  });
}

export class EveOrchestrator extends BaseAgent {
  constructor(qualifier: LlmAgent, customer: LlmAgent) {
    super({
      name: 'eve_orchestrator',
      description: 'Qualifier stays off the channel, then the customer agent runs.',
      subAgents: [qualifier, customer],
    });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    const [qualifier, customer] = this.subAgents;
    for await (const event of qualifier.runAsync(context)) {
      yield event;
    }
    yield* customer.runAsync(context);
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    throw new Error('live is out of scope');
  }
}

export class ToolErrorPlugin extends BasePlugin {
  readonly handled: string[] = [];

  constructor() {
    super('tool_error_plugin');
  }

  override async onToolErrorCallback({
    tool,
    error,
  }: {
    tool: { name: string };
    toolArgs: Record<string, unknown>;
    toolContext: Context;
    error: Error;
  }): Promise<Record<string, unknown> | undefined> {
    this.handled.push(tool.name);
    return { status: 'handled', tool: tool.name, message: error.message };
  }
}

export function createBoomTool() {
  return new FunctionTool({
    name: 'boom',
    description: 'Always throws. Used to probe onToolErrorCallback.',
    execute: () => {
      throw new Error('boom');
    },
  });
}
