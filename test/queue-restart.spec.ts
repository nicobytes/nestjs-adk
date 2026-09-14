import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { MESSAGES_QUEUE } from '../src/constants.js';
import { MessageBufferService } from '../src/queue/message-buffer.js';
import { TurnService } from '../src/queue/turn.service.js';
import { createPocApp } from './app-harness.js';

describe('queue restart', () => {
  it('runs a delayed job after nest restart', async () => {
    const suffix = randomUUID();
    const sessionUrl = `sqlite://./data/queue-restart-${suffix}.sqlite`;
    const pocUrl = `sqlite://./data/queue-restart-${suffix}-poc.sqlite`;
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

    let app = await createPocApp(sessionUrl, { pocDbUrl: pocUrl, redisUrl });
    const buffer = app.get(MessageBufferService);
    const queue = app.get<Queue>(getQueueToken(MESSAGES_QUEUE));

    const created = await (
      await import('supertest')
    )
      .default(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-restart-${suffix}`, text: 'placeholder' })
      .expect(201);
    const conversationId = created.body.conversationId as string;

    const existing = await queue.getJob(conversationId);
    if (existing) await existing.remove();
    await buffer.drainTexts(conversationId);
    await buffer.pushText(conversationId, 'survive restart');
    await queue.add(
      'process',
      { kind: 'text', conversationId },
      {
        jobId: conversationId,
        delay: 2000,
        attempts: 3,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true,
      },
    );

    await app.close();

    app = await createPocApp(sessionUrl, { pocDbUrl: pocUrl, redisUrl });
    const turn = app.get(TurnService);
    const spy = vi.spyOn(turn, 'runTextTurn').mockResolvedValue({
      sessionId: conversationId,
      paused: false,
      replyText: 'ok',
      events: [],
      sessionEvents: [],
    });

    await vi.waitFor(
      () => {
        expect(
          spy.mock.calls.some((call) =>
            String(call[0]?.text ?? '').includes('survive restart'),
          ),
        ).toBe(true);
      },
      { timeout: 10_000, interval: 200 },
    );

    await app.close();
  }, 30_000);
});
