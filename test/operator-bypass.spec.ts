import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { createPocApp } from './app-harness.js';

describe('operator bypass', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/operator-${randomUUID()}.sqlite`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an operator reply without sessionId', async () => {
    await request(app.getHttpServer())
      .post('/operator/reply')
      .send({ text: 'no session' })
      .expect(400);
  });

  it('operator reply bypasses the runner', async () => {
    const host = app.get(AdkHostService);
    const channel = app.get(ChannelService);
    const runSpy = vi.spyOn(host.runner, 'runAsync');
    const sessionId = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/operator/reply')
      .send({ sessionId, text: 'operator says hi' })
      .expect(201);

    expect(runSpy).not.toHaveBeenCalled();
    expect(response.body.message.kind).toBe('text');
    expect(channel.list(sessionId).map((message) => message.payload.text)).toContain(
      'operator says hi',
    );
  });
});
