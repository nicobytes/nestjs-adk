import {
  BasePlugin,
  Context,
  createEvent,
  Event,
  FunctionTool,
  InMemorySessionService,
  LlmAgent,
  LlmRequest,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PocLog } from '../src/adk/poc-log.js';
import {
  looksLikeBantJson,
  stopTurnAfterOutboundIntent,
  stripInternalBantContents,
} from '../src/agents/amaru-lite/callbacks.js';
import {
  createReplyWithTextTool,
  REPLY_WITH_TEXT,
} from '../src/agents/amaru-lite/reply.tool.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { USER_ID } from '../src/constants.js';
import { ScriptedLlm } from './scripted-llm.js';

class RecoverToolErrorPlugin extends BasePlugin {
  constructor() {
    super('amaru_lite_tool_error');
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
    return {
      error_code: tool.name === 'missing_tool' ? 'TOOL_NOT_FOUND' : 'TOOL_ERROR',
      message: error.message,
    };
  }
}

describe('amaru-lite callbacks', () => {
  it('strips bant json from contents before the next model call', () => {
    const bant = JSON.stringify({
      interest_level: 'High',
      budget_status: 'Aligned',
      purchase_urgency: 'Immediate',
      has_decision_authority: true,
      explicit_human_request: false,
      plan_and_date_confirmed: true,
      custom_group_accepted: false,
      disability_access_inquiry: false,
    });
    expect(looksLikeBantJson(bant)).toBe(true);

    const request = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'hola' }],
        },
        {
          role: 'model',
          parts: [{ text: bant }],
        },
        {
          role: 'user',
          parts: [{ text: 'qué planes hay' }],
        },
      ],
      toolsDict: {},
      liveConnectConfig: {},
    } as LlmRequest;

    stripInternalBantContents({
      context: {} as Context,
      request,
    });

    const texts = request.contents.flatMap((content) =>
      (content.parts ?? [])
        .map((part) => part.text)
        .filter((text): text is string => typeof text === 'string'),
    );
    expect(texts.some((text) => looksLikeBantJson(text))).toBe(false);
    expect(texts).toContain('hola');
    expect(texts).toContain('qué planes hay');
  });

  it('stops the turn after outbound intent tool', async () => {
    const channel = new ChannelService(new PocLog(), []);
    const fakeModel = new ScriptedLlm([
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: REPLY_WITH_TEXT,
                args: { body: 'hola desde tool' },
              },
            },
          ],
        },
      }),
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-2',
                name: REPLY_WITH_TEXT,
                args: { body: 'second call must not happen' },
              },
            },
          ],
        },
      }),
    ]);

    const agent = new LlmAgent({
      name: 'customer_stop_probe',
      model: fakeModel,
      instruction: 'Call reply_with_text once then stop.',
      tools: [createReplyWithTextTool(channel, new PocLog())],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });

    const sessionService = new InMemorySessionService();
    const sessionId = randomUUID();
    await sessionService.createSession({
      appName: 'stop_probe',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'stop_probe',
      agent,
      sessionService,
    });

    const events: Event[] = [];
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'hola' }] },
    })) {
      events.push(event);
    }

    const functionCalls = events.flatMap((event) =>
      (event.content?.parts ?? [])
        .map((part) => part.functionCall?.name)
        .filter(Boolean),
    );
    expect(functionCalls).toEqual([REPLY_WITH_TEXT]);
    expect(fakeModel.calls).toBe(1);
    expect(channel.list(sessionId).some((m) => m.kind === 'text')).toBe(true);
  });

  it('unknown tool error is recoverable not a crash', async () => {
    const plugin = new RecoverToolErrorPlugin();
    const handled = await plugin.onToolErrorCallback({
      tool: { name: 'missing_tool' },
      toolArgs: {},
      toolContext: {} as Context,
      error: new Error('no such tool'),
    });
    expect(handled?.error_code).toBe('TOOL_NOT_FOUND');

    const boom = new FunctionTool({
      name: 'boom',
      description: 'always throws',
      execute: () => {
        throw new Error('boom');
      },
    });
    const boomHandled = await plugin.onToolErrorCallback({
      tool: boom,
      toolArgs: {},
      toolContext: {} as Context,
      error: new Error('boom'),
    });
    expect(boomHandled?.error_code).toBe('TOOL_ERROR');

    // Process stays alive: createEvent still works after recovery payload.
    const alive = createEvent({
      author: 'customer',
      content: {
        role: 'model',
        parts: [
          {
            functionResponse: {
              id: 'x',
              name: 'boom',
              response: boomHandled,
            },
          },
        ],
      },
    });
    expect(alive.content?.parts?.[0]?.functionResponse?.response).toMatchObject(
      { error_code: 'TOOL_ERROR' },
    );
  });
});
