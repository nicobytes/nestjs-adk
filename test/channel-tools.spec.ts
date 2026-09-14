import {
  Event,
  InMemorySessionService,
  LlmAgent,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PocLog } from '../src/adk/poc-log.js';
import {
  stopTurnAfterOutboundIntent,
} from '../src/agents/amaru-lite/callbacks.js';
import {
  createSendButtonsTool,
  createSendListTool,
  createSendTextTool,
  SEND_BUTTONS,
  SEND_LIST,
  SEND_TEXT,
} from '../src/agents/channel-tools.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { USER_ID } from '../src/constants.js';
import { ScriptedLlm } from './scripted-llm.js';

describe('channel tools gist (A1)', () => {
  it('send_text writes channel gist not graph', async () => {
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
                id: 'call-1',
                name: SEND_TEXT,
                args: { body: 'hola canal' },
              },
            },
          ],
        },
      }),
    ]);
    const agent = new LlmAgent({
      name: 'channel_probe',
      model: fakeModel,
      instruction: 'Call send_text once.',
      tools: [createSendTextTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });
    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'channel_probe',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'channel_probe',
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

    const msgs = channel.list(sessionId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe('text');
    expect(msgs[0].payload).toMatchObject({ text: 'hola canal' });

    const functionResponses = events.flatMap((event) =>
      (event.content?.parts ?? [])
        .map((part) => part.functionResponse)
        .filter(Boolean),
    );
    expect(functionResponses.length).toBeGreaterThanOrEqual(1);
    for (const fr of functionResponses) {
      const response = fr?.response;
      if (response && typeof response === 'object') {
        expect(JSON.stringify(response)).not.toContain('messaging_product');
        expect(JSON.stringify(response)).not.toContain('hola canal');
      }
    }
  });

  it('send_buttons writes options to channel', async () => {
    const log = new PocLog();
    const channel = new ChannelService(log, []);
    const sessionId = randomUUID();
    channel.bind(sessionId, 'fake');
    const options = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    const fakeModel = new ScriptedLlm([
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-2',
                name: SEND_BUTTONS,
                args: { prompt: 'Elige', options },
              },
            },
          ],
        },
      }),
    ]);
    const agent = new LlmAgent({
      name: 'channel_probe_btn',
      model: fakeModel,
      instruction: 'Call send_buttons once.',
      tools: [createSendButtonsTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });
    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'channel_probe_btn',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'channel_probe_btn',
      agent,
      sessionService,
    });
    for await (const _ of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'elige' }] },
    })) {
      // drain
    }
    const msgs = channel.list(sessionId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe('buttons');
    expect(msgs[0].payload).toMatchObject({ prompt: 'Elige', options });
  });

  it('send_list is a channel kind not session json', async () => {
    const log = new PocLog();
    const channel = new ChannelService(log, []);
    const sessionId = randomUUID();
    channel.bind(sessionId, 'fake');
    const sections = [
      {
        title: 'Horas',
        rows: [
          { id: 'h1', title: '09:00' },
          { id: 'h2', title: '10:00' },
          { id: 'h3', title: '11:00' },
          { id: 'h4', title: '14:00' },
        ],
      },
    ];
    const fakeModel = new ScriptedLlm([
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-3',
                name: SEND_LIST,
                args: {
                  prompt: 'Elige hora',
                  buttonLabel: 'Elegir hora',
                  sections,
                },
              },
            },
          ],
        },
      }),
    ]);
    const agent = new LlmAgent({
      name: 'channel_probe_list',
      model: fakeModel,
      instruction: 'Call send_list once.',
      tools: [createSendListTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });
    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'channel_probe_list',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'channel_probe_list',
      agent,
      sessionService,
    });
    const events: Event[] = [];
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'horas' }] },
    })) {
      events.push(event);
    }
    const msgs = channel.list(sessionId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe('list');
    expect(msgs[0].payload.sections).toEqual(sections);

    const fr = events.flatMap((e) =>
      (e.content?.parts ?? []).map((p) => p.functionResponse).filter(Boolean),
    );
    for (const item of fr) {
      if (item?.response && typeof item.response === 'object') {
        expect(JSON.stringify(item.response)).not.toContain('09:00');
      }
    }
  });
});
