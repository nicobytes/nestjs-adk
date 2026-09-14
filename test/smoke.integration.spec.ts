import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocApp } from './app-harness.js';
import { hasGeminiKey } from './has-key.js';

describe.skipIf(!hasGeminiKey)('smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/smoke-${randomUUID()}.sqlite`);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('returns model text from runAsync', async () => {
    const response = await request(app.getHttpServer())
      .post('/inbound')
      .send({ sessionId: randomUUID(), text: 'di solo hola' })
      .expect(201);

    expect(response.body.replyText.toLowerCase()).toContain('hola');
    expect(response.body.events.length).toBeGreaterThan(0);
  }, 120_000);
});
