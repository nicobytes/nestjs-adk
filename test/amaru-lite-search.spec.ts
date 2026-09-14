import {
  Event,
  InMemorySessionService,
  LlmAgent,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PocLog } from '../src/adk/poc-log.js';
import { stopTurnAfterOutboundIntent } from '../src/agents/amaru-lite/callbacks.js';
import {
  createSearchContextTool,
  SEARCH_CONTEXT,
} from '../src/agents/amaru-lite/tools/search-context.js';
import {
  createSendTextTool,
  SEND_TEXT,
} from '../src/agents/channel-tools.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { USER_ID } from '../src/constants.js';
import { ScriptedLlm } from './scripted-llm.js';

describe('amaru search_context fixture (A3)', () => {
  it('search_context fixture then send_text', async () => {
    const log = new PocLog();
    const channel = new ChannelService(log, []);
    const sessionId = randomUUID();
    channel.bind(sessionId, 'fake');

    const fakeModel = new ScriptedLlm([
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-search',
                name: SEARCH_CONTEXT,
                args: { query: 'planes Bogotá' },
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
                id: 'call-text',
                name: SEND_TEXT,
                args: {
                  body: 'Tenemos Caminata Bogotá Cerros Orientales y Camping Sabana.',
                },
              },
            },
          ],
        },
      }),
    ]);

    const agent = new LlmAgent({
      name: 'customer_search',
      model: fakeModel,
      instruction: 'Call search_context then send_text.',
      tools: [createSearchContextTool(log), createSendTextTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });

    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'search_probe',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'search_probe',
      agent,
      sessionService,
    });

    const events: Event[] = [];
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: 'qué planes para Bogotá' }],
      },
    })) {
      events.push(event);
    }

    const toolNames = events.flatMap((event) =>
      (event.content?.parts ?? [])
        .map((part) => part.functionCall?.name ?? part.functionResponse?.name)
        .filter(Boolean),
    );
    expect(toolNames).toContain(SEARCH_CONTEXT);
    expect(toolNames).toContain(SEND_TEXT);

    const msgs = channel.list(sessionId);
    expect(msgs.some((m) => m.kind === 'text')).toBe(true);

    const session = await sessionService.getSession({
      appName: 'search_probe',
      userId: USER_ID,
      sessionId,
    });
    const dumped = JSON.stringify(session?.events ?? []);
    // Fixture return is short; raw plan catalog dump should not be the channel payload.
    expect(msgs.every((m) => !JSON.stringify(m.payload).includes('artifact'))).toBe(
      true,
    );
    expect(dumped).not.toContain('messaging_product');
  });
});
