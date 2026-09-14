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
  createSendButtonsTool,
  SEND_BUTTONS,
} from '../src/agents/channel-tools.js';
import { createSendSedeLocationTool, SEND_SEDE_LOCATION } from '../src/agents/sofia-lite/tools/sede-location.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { USER_ID } from '../src/constants.js';
import { ScriptedLlm } from './scripted-llm.js';

describe('sofia-lite channel (B)', () => {
  it('sofia greeting is sede buttons only', async () => {
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
                id: 'call-sede',
                name: SEND_BUTTONS,
                args: {
                  prompt:
                    'Hola. Soy Sofía, asistente de Be Unique Clínica Estética.\n\n¿En cuál de nuestras sedes desea atenderse?',
                  options: [
                    { id: 'sede_sucre', title: 'Sucre' },
                    { id: 'sede_cochabamba', title: 'Cochabamba' },
                  ],
                },
              },
            },
          ],
        },
      }),
    ]);

    const agent = new LlmAgent({
      name: 'sofia_greet',
      model: fakeModel,
      instruction: 'Greeting must be send_buttons only.',
      tools: [createSendButtonsTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });

    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'sofia_greet',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'sofia_greet',
      agent,
      sessionService,
    });

    for await (const _ of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'hola' }] },
    })) {
      // drain
    }

    const msgs = channel.list(sessionId);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe('buttons');
    expect(msgs.some((m) => m.kind === 'text')).toBe(false);
    expect(msgs[0].payload.options).toEqual([
      { id: 'sede_sucre', title: 'Sucre' },
      { id: 'sede_cochabamba', title: 'Cochabamba' },
    ]);
  });

  it('sofia book sends sede pin', async () => {
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
                id: 'call-pin',
                name: SEND_SEDE_LOCATION,
                args: { sede: 'sucre' },
              },
            },
          ],
        },
      }),
    ]);

    const agent = new LlmAgent({
      name: 'sofia_book',
      model: fakeModel,
      instruction: 'After book call send_sede_location.',
      tools: [createSendSedeLocationTool(channel, log)],
      afterToolCallback: stopTurnAfterOutboundIntent,
    });

    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'sofia_book',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'sofia_book',
      agent,
      sessionService,
    });

    const events: Event[] = [];
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'reserva hecha' }] },
    })) {
      events.push(event);
    }

    const msgs = channel.list(sessionId);
    expect(msgs.some((m) => m.kind === 'location')).toBe(true);
    const pin = msgs.find((m) => m.kind === 'location');
    expect(pin?.payload).toMatchObject({
      name: 'Be Unique — Sucre',
      latitude: -19.0401406,
    });

    const fr = events.flatMap((e) =>
      (e.content?.parts ?? []).map((p) => p.functionResponse).filter(Boolean),
    );
    for (const item of fr) {
      const response = item?.response;
      if (response && typeof response === 'object') {
        expect(response).toMatchObject({ ok: true, sede: 'sucre' });
        expect(JSON.stringify(response)).not.toContain('latitude');
        expect(JSON.stringify(response)).not.toContain('-19.04');
      }
    }
  });
});
