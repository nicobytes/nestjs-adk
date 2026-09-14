import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationStore } from '../src/conversations/conversation.store.js';
import { TurnService } from '../src/queue/turn.service.js';
import { createPocApp } from './app-harness.js';

const emptyView = {
  sessionId: 'x',
  paused: false,
  replyText: 'ok',
  events: [],
  sessionEvents: [],
};

describe('HITL skip', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/hitl-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/hitl-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('skips the runner when conversation is WAITING_HUMAN', async () => {
    const turn = app.get(TurnService);
    const spy = vi.spyOn(turn, 'runTextTurn').mockResolvedValue(emptyView);
    const created = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-hitl-${suffix}`, text: 'start' })
      .expect(201);
    const id = created.body.conversationId as string;
    await vi.waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 3000 });

    await request(app.getHttpServer())
      .post(`/conversations/${id}/handoff`)
      .expect(201);

    spy.mockClear();
    await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-hitl-${suffix}`, text: 'while human' })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(spy).not.toHaveBeenCalled();

    const store = app.get(ConversationStore);
    const messages = store.listMessages(id);
    expect(messages.some((m) => m.body === 'while human')).toBe(true);

    store.setStatus(id, 'HUMAN_ACTIVE');
    spy.mockClear();
    await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-hitl-${suffix}`, text: 'still human' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(spy).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/conversations/${id}/release`)
      .expect(201);
    spy.mockRestore();
  });

  it('keeps already-scheduled job running after handoff', async () => {
    const turn = app.get(TurnService);
    let started = false;
    let finished = false;
    const spy = vi.spyOn(turn, 'runTextTurn').mockImplementation(async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      finished = true;
      return emptyView;
    });

    const created = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-sched-${suffix}`, text: 'scheduled' })
      .expect(201);
    const id = created.body.conversationId as string;

    await vi.waitFor(() => expect(started).toBe(true), { timeout: 3000 });
    await request(app.getHttpServer())
      .post(`/conversations/${id}/handoff`)
      .expect(201);

    await vi.waitFor(() => expect(finished).toBe(true), { timeout: 5000 });
    spy.mockRestore();
  });
});
