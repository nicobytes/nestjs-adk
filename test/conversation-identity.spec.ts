import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationStore } from '../src/conversations/conversation.store.js';
import { createPocApp } from './app-harness.js';

describe('conversation identity', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/conv-id-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/conv-id-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('uses conversation uuid as adk session id', async () => {
    const store = app.get(ConversationStore);
    const a = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-a-${suffix}`, text: 'hi' })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-b-${suffix}`, text: 'hi' })
      .expect(201);
    expect(a.body.conversationId).not.toBe(b.body.conversationId);

    const a2 = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-a-${suffix}`, text: 'again' })
      .expect(201);
    expect(a2.body.conversationId).toBe(a.body.conversationId);

    await request(app.getHttpServer())
      .post(`/conversations/${a.body.conversationId}/close`)
      .expect(201);

    const a3 = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-a-${suffix}`, text: 'new thread' })
      .expect(201);
    expect(a3.body.conversationId).not.toBe(a.body.conversationId);

    const closed = store.getById(a.body.conversationId);
    expect(closed?.status).toBe('CLOSED');
  });
});
