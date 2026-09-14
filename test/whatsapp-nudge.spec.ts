import { randomUUID } from 'node:crypto';
import { createEvent } from '@google/adk';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { NUDGE_KIND, nudgeMessage } from '../src/adk/events.js';
import { WhatsAppAdapter } from '../src/adapters/whatsapp/whatsapp.adapter.js';
import { WhatsAppDirectory } from '../src/adapters/whatsapp/whatsapp.directory.js';
import { DEFAULT_AGENT_ID } from '../src/constants.js';
import { createPocApp } from './app-harness.js';

const sessionId = 'whatsapp:phone-id:5215512345678';

describe('whatsapp nudge', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/nudge-${randomUUID()}.sqlite`);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a model follow-up onto the existing whatsapp session', async () => {
    const host = app.get(AdkHostService);
    const agentId = whatsAppAgentId(app);
    await host.sessionService.createSession({
      appName: agentId,
      userId: sessionId,
      sessionId,
    });
    const run = vi
      .spyOn(host.runnerFor(agentId), 'runAsync')
      .mockImplementation(async function* () {
        yield createEvent({
          author: 'amaru',
          content: {
            role: 'model',
            parts: [{ text: 'Hey, cómo vas?' }],
          },
        });
      });
    const deliver = vi
      .spyOn(app.get(WhatsAppAdapter), 'deliver')
      .mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/whatsapp/nudge')
      .send({ sessionId, hint: 'te interesa' })
      .expect(201);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sessionId,
        sessionId,
        newMessage: nudgeMessage('te interesa'),
        customMetadata: { kind: NUDGE_KIND },
      }),
    );
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        channel: 'whatsapp',
        target: '5215512345678',
        kind: 'text',
        payload: { text: 'Hey, cómo vas?' },
      }),
    );
  });

  it('rejects a session id that is not a whatsapp thread', async () => {
    await request(app.getHttpServer())
      .post('/whatsapp/nudge')
      .send({ sessionId: randomUUID() })
      .expect(400);
  });

  it('returns 404 when the session does not exist', async () => {
    const host = app.get(AdkHostService);
    const run = vi.spyOn(host.runnerFor(whatsAppAgentId(app)), 'runAsync');

    await request(app.getHttpServer())
      .post('/whatsapp/nudge')
      .send({ sessionId: 'whatsapp:phone-id:5215500000000' })
      .expect(404);

    expect(run).not.toHaveBeenCalled();
  });

  it('returns 409 while ask_choice is paused', async () => {
    const host = app.get(AdkHostService);
    const agentId = whatsAppAgentId(app);
    const pausedId = 'whatsapp:phone-id:5215511111111';
    const session = await host.sessionService.createSession({
      appName: agentId,
      userId: pausedId,
      sessionId: pausedId,
    });
    await host.sessionService.appendEvent({
      session,
      event: createEvent({
        author: 'amaru',
        invocationId: 'inv-1',
        longRunningToolIds: ['call-1'],
        content: {
          role: 'model',
          parts: [
            { functionCall: { id: 'call-1', name: 'ask_choice', args: {} } },
          ],
        },
      }),
    });
    const run = vi.spyOn(host.runnerFor(agentId), 'runAsync');

    await request(app.getHttpServer())
      .post('/whatsapp/nudge')
      .send({ sessionId: pausedId })
      .expect(409);

    expect(run).not.toHaveBeenCalled();
  });

  it('closes a paused ask_choice when the customer writes instead of clicking', async () => {
    const host = app.get(AdkHostService);
    const agentId = whatsAppAgentId(app);
    const pausedId = 'whatsapp:phone-id:5215533333333';
    const session = await host.sessionService.createSession({
      appName: agentId,
      userId: pausedId,
      sessionId: pausedId,
    });
    await host.sessionService.appendEvent({
      session,
      event: createEvent({
        author: 'amaru',
        invocationId: 'inv-text',
        longRunningToolIds: ['call-text'],
        content: {
          role: 'model',
          parts: [
            { functionCall: { id: 'call-text', name: 'ask_choice', args: {} } },
          ],
        },
      }),
    });
    const run = vi
      .spyOn(host.runnerFor(agentId), 'runAsync')
      .mockImplementation(async function* () {
        yield createEvent({
          author: 'amaru',
          invocationId: 'inv-text',
          content: { role: 'model', parts: [{ text: 'otras' }] },
        });
      });

    const view = await host.inbound(pausedId, 'dame otras', {
      channel: 'whatsapp',
      userId: pausedId,
      target: '5215522222222',
      agentId,
    });

    expect(view.mechanism).toBe('LongRunningFunctionTool');
    expect(view.functionCallId).toBe('call-text');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        newMessage: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-text',
                name: 'ask_choice',
                response: { status: 'text', text: 'dame otras' },
              },
            },
          ],
        },
      }),
    );
  });

  it('returns 409 when the last inbound is older than 24 hours', async () => {
    const host = app.get(AdkHostService);
    const agentId = whatsAppAgentId(app);
    const staleId = 'whatsapp:phone-id:5215522222222';
    await host.sessionService.createSession({
      appName: agentId,
      userId: staleId,
      sessionId: staleId,
    });
    app
      .get(WhatsAppDirectory)
      .remember(staleId, 'wamid.old', '2020-01-01T00:00:00.000Z');
    const run = vi.spyOn(host.runnerFor(agentId), 'runAsync');

    await request(app.getHttpServer())
      .post('/whatsapp/nudge')
      .send({ sessionId: staleId })
      .expect(409);

    expect(run).not.toHaveBeenCalled();
  });
});

function whatsAppAgentId(app: INestApplication): string {
  return (
    app.get(ConfigService).get<string>('WHATSAPP_AGENT_ID') ?? DEFAULT_AGENT_ID
  );
}
