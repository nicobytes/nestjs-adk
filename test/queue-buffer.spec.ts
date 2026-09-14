import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TurnService } from '../src/queue/turn.service.js';
import { createPocApp } from './app-harness.js';

describe('queue buffer', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/queue-buf-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/queue-buf-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('batches three inbound texts into one runAsync', async () => {
    const turn = app.get(TurnService);
    const spy = vi.spyOn(turn, 'runTextTurn').mockResolvedValue({
      sessionId: 'x',
      paused: false,
      replyText: 'ok',
      events: [],
      sessionEvents: [],
    });
    const waId = `wa-batch-${suffix}`;

    await Promise.all([
      request(app.getHttpServer())
        .post('/inbound')
        .send({ waId, text: 'hola' })
        .expect(201),
      request(app.getHttpServer())
        .post('/inbound')
        .send({ waId, text: 'como estas' })
        .expect(201),
      request(app.getHttpServer())
        .post('/inbound')
        .send({ waId, text: 'todo bien' })
        .expect(201),
    ]);

    await vi.waitFor(() => expect(spy).toHaveBeenCalled(), {
      timeout: 5000,
      interval: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    const textCalls = spy.mock.calls.filter((call) =>
      String(call[0]?.text ?? '').includes('hola'),
    );
    expect(textCalls.length).toBe(1);
    expect(textCalls[0][0].text).toContain('hola');
    expect(textCalls[0][0].text).toContain('como estas');
    expect(textCalls[0][0].text).toContain('todo bien');
    spy.mockRestore();
  });

  it('follow-up job drains texts that arrived while the worker was busy', async () => {
    const turn = app.get(TurnService);
    const waId = `wa-follow-${suffix}`;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = TurnService.prototype.runTextTurn;
    const spy = vi.spyOn(turn, 'runTextTurn').mockImplementation(async (input) => {
      if (spy.mock.calls.length === 1) {
        await gate;
      }
      return real.call(turn, input);
    });

    await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId, text: 'first' })
      .expect(201);

    await vi.waitFor(() => expect(spy).toHaveBeenCalled(), {
      timeout: 3000,
      interval: 50,
    });

    await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId, text: 'during-busy' })
      .expect(201);

    release();

    await vi.waitFor(
      () => {
        const joined = spy.mock.calls.map((call) => call[0]?.text ?? '').join('\n');
        expect(joined).toContain('during-busy');
      },
      { timeout: 8000, interval: 100 },
    );
    spy.mockRestore();
  });
});
