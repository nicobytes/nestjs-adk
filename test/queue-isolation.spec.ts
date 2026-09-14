import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TurnService } from '../src/queue/turn.service.js';
import { createPocApp } from './app-harness.js';

describe('queue isolation', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/queue-iso-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/queue-iso-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('serves another conversation while runAsync is in flight', async () => {
    const turn = app.get(TurnService);
    const original = turn.runTextTurn.bind(turn);
    vi.spyOn(turn, 'runTextTurn').mockImplementation(async (input) => {
      if (input.text.includes('slow')) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return original(input);
    });

    void request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-slow-${suffix}`, text: 'slow turn' });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const started = Date.now();
    await request(app.getHttpServer()).get('/health').expect(200);
    const healthElapsed = Date.now() - started;
    expect(healthElapsed).toBeLessThan(200);

    const otherStarted = Date.now();
    const other = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-other-${suffix}`, text: 'other' })
      .expect(201);
    expect(Date.now() - otherStarted).toBeLessThan(200);
    expect(other.body.conversationId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 2000));
    vi.restoreAllMocks();
  });
});
