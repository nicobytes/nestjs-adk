import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { choiceResponseMessage, choiceTextMessage } from '../src/adk/events.js';
import { createPocApp } from './app-harness.js';
import { hasGeminiKey } from './has-key.js';

describe('resume payload', () => {
  it('builds a function response, not user text', () => {
    const message = choiceResponseMessage(
      { functionCallId: 'call-1', invocationId: 'inv-1', name: 'ask_choice' },
      'b',
    );
    expect(message.role).toBe('user');
    expect(message.parts?.[0]?.text).toBeUndefined();
    expect(message.parts?.[0]?.functionResponse).toEqual({
      id: 'call-1',
      name: 'ask_choice',
      response: { buttonId: 'b', status: 'selected' },
    });
  });

  it('closes a paused choice with free text instead of a click', () => {
    const message = choiceTextMessage(
      { functionCallId: 'call-1', invocationId: 'inv-1', name: 'ask_choice' },
      'dame otras',
    );
    expect(message.parts?.[0]?.text).toBeUndefined();
    expect(message.parts?.[0]?.functionResponse).toEqual({
      id: 'call-1',
      name: 'ask_choice',
      response: { status: 'text', text: 'dame otras' },
    });
  });
});

describe.skipIf(!hasGeminiKey)('resume same turn', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/resume-${randomUUID()}.sqlite`);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('resumes the same turn from button id', async () => {
    const sessionId = randomUUID();
    const first = await request(app.getHttpServer())
      .post('/inbound')
      .send({
        sessionId,
        text: 'pregúntame A o B con la tool. Opciones: A (id a) y B (id b). No elijas tú.',
      })
      .expect(201);

    const callId = first.body.functionCallId as string;
    expect(callId).toBeTruthy();
    expect(first.body.paused).toBe(true);

    const second = await request(app.getHttpServer())
      .post('/inbound/interactive')
      .send({ sessionId, buttonId: 'b' })
      .expect(201);

    const userTurns = (second.body.sessionEvents as Array<{
      author?: string;
      invocationId: string;
      parts: Array<{
        text?: string;
        functionResponse?: { id?: string; name?: string; response?: { buttonId?: string } };
      }>;
    }>).filter((event) => event.author === 'user');
    const resumeTurn = userTurns.at(-1);
    expect(resumeTurn?.parts.some((part) => part.text === 'b')).toBe(false);
    expect(resumeTurn?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            id: callId,
            name: 'ask_choice',
            response: expect.objectContaining({ buttonId: 'b' }),
          }),
        }),
      ]),
    );
    expect(second.body.mechanism).toBe('LongRunningFunctionTool');
  }, 180_000);
});
