import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { DEFAULT_AGENT_ID, USER_ID } from '../src/constants.js';
import { createPocApp } from './app-harness.js';
import { hasGeminiKey } from './has-key.js';

describe.skipIf(!hasGeminiKey)('session restart', () => {
  const dbUrl = `sqlite://./data/restart-${randomUUID()}.sqlite`;
  const apps: INestApplication[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('session survives process restart', async () => {
    const sessionId = randomUUID();
    const first = await createPocApp(dbUrl);
    apps.push(first);
    await request(first.getHttpServer())
      .post('/inbound')
      .send({ sessionId, text: 'di solo hola y recuerda la palabra manzana' })
      .expect(201);
    await first.close();

    const second = await createPocApp(dbUrl);
    apps.push(second);
    const followUp = await request(second.getHttpServer())
      .post('/inbound')
      .send({ sessionId, text: 'qué palabra te pedí que recordaras?' })
      .expect(201);

    const session = await second.get(AdkHostService).sessionService.getSession({
      appName: DEFAULT_AGENT_ID,
      userId: USER_ID,
      sessionId,
    });
    const history = (session?.events ?? [])
      .flatMap((event) => event.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join(' ');
    expect(history.toLowerCase()).toContain('manzana');
    expect(followUp.body.replyText.toLowerCase()).toContain('manzana');
  }, 180_000);
});
