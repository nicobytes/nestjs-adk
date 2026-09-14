import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { TurnService } from '../src/queue/turn.service.js';
import { createPocApp } from './app-harness.js';

const emptyView = {
  sessionId: 'x',
  paused: false,
  replyText: 'ok',
  events: [],
  sessionEvents: [],
};

describe('queue ack / retry / restart', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/queue-ack-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/queue-ack-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('returns http before the runner finishes', async () => {
    const turn = app.get(TurnService);
    vi.spyOn(turn, 'runTextTurn').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return emptyView;
    });

    const started = Date.now();
    const response = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-ack-${suffix}`, text: 'hola lento' })
      .expect(201);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(100);
    expect(response.body.conversationId).toBeTruthy();
    expect(response.body.accepted).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    vi.restoreAllMocks();
  });

  it('retries a failed job and then runs the agent', async () => {
    const turn = app.get(TurnService);
    let calls = 0;
    const spy = vi.spyOn(turn, 'runTextTurn').mockImplementation(async (input) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('simulated processor failure');
      }
      return { ...emptyView, sessionId: input.conversationId, replyText: input.text };
    });

    await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-retry-${suffix}`, text: 'retry please' })
      .expect(201);

    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2), {
      timeout: 10_000,
      interval: 200,
    });
    spy.mockRestore();
  });
});
