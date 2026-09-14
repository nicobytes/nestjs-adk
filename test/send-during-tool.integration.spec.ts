import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { createPocApp } from './app-harness.js';
import { hasGeminiKey } from './has-key.js';

describe.skipIf(!hasGeminiKey)('send during tool', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/during-${randomUUID()}.sqlite`);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('sends buttons during the tool call', async () => {
    const channel = app.get(ChannelService);
    const host = app.get(AdkHostService);
    let runClosed = false;
    const sendButtons = channel.sendButtons.bind(channel);
    const spy = vi.spyOn(channel, 'sendButtons').mockImplementation((...args) => {
      expect(runClosed).toBe(false);
      return sendButtons(...args);
    });

    const view = await host.inbound(
      randomUUID(),
      'pregúntame A o B con la tool. Opciones: A (id a) y B (id b).',
    );
    runClosed = true;

    expect(spy).toHaveBeenCalled();
    expect(view.paused).toBe(true);
    expect(view.functionCallId).toBeTruthy();
  }, 120_000);
});
