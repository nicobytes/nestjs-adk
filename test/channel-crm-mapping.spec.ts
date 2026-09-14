import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChannelService } from '../src/channel/channel.service.js';
import { ConversationStore } from '../src/conversations/conversation.store.js';
import { createPocApp } from './app-harness.js';

describe('ask_choice idempotency and stray click', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/idem-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/idem-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('ask_choice sendButtons is idempotent across job retry', async () => {
    const channel = app.get(ChannelService);
    const store = app.get(ConversationStore);
    const conversation = store.findOrCreateOpen(`wa-idem-${suffix}`);
    channel.bind(conversation.id, 'fake', conversation.wa_id);
    const callId = `call-${suffix}`;

    await channel.sendButtons(
      conversation.id,
      'pick',
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      { functionCallId: callId, invocationId: 'inv-1' },
    );
    await channel.sendButtons(
      conversation.id,
      'pick',
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      { functionCallId: callId, invocationId: 'inv-1' },
    );

    const buttons = channel
      .list(conversation.id)
      .filter((message) => message.kind === 'buttons');
    expect(buttons).toHaveLength(1);
  });

  it('stores stray click without running the agent', async () => {
    const created = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-stray-${suffix}`, text: 'hi' })
      .expect(201);
    const conversationId = created.body.conversationId as string;

    await request(app.getHttpServer())
      .post('/inbound/interactive')
      .send({ conversationId, buttonId: 'ghost' })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const store = app.get(ConversationStore);
    const messages = store.listMessages(conversationId);
    expect(
      messages.some((m) => m.kind === 'choice' && m.body.includes('ghost')),
    ).toBe(true);
  });
});

describe('crm dual-write', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/dual-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/dual-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('crm messages and adk session are dual-write not prompt injection', async () => {
    const { AdkHostService } = await import('../src/adk/adk-host.service.js');
    const host = app.get(AdkHostService);
    const inboundSpy = vi.spyOn(host, 'inbound');

    const created = await request(app.getHttpServer())
      .post('/inbound')
      .send({ waId: `wa-dual-${suffix}`, text: 'ping dual' })
      .expect(201);
    const conversationId = created.body.conversationId as string;

    await vi.waitFor(() => expect(inboundSpy).toHaveBeenCalled(), {
      timeout: 5000,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const store = app.get(ConversationStore);
    const messages = store.listMessages(conversationId);
    expect(messages.some((m) => m.role === 'customer')).toBe(true);

    const session = await host.sessionService.getSession({
      appName: 'amaru',
      userId: 'user_1',
      sessionId: conversationId,
    });
    expect(session?.events?.length ?? 0).toBeGreaterThan(0);
    // Agent must not be fed by selecting from messages table into prompt — inbound uses session only.
    expect(inboundSpy.mock.calls[0][0]).toBe(conversationId);
  });

  it('operator inbox does not require parsing session events', async () => {
    const store = app.get(ConversationStore);
    const conversation = store.findOrCreateOpen(`wa-inbox-${suffix}`);
    store.insertMessage({
      conversationId: conversation.id,
      role: 'bot',
      kind: 'buttons',
      body: 'Pick one',
      payload: {
        prompt: 'Pick one',
        options: [
          { id: 'a', title: 'Alpha' },
          { id: 'b', title: 'Beta' },
        ],
      },
      source: 'ask_choice',
    });
    const { toInbox } = await import('../src/conversations/inbox-view.js');
    const view = toInbox(store.listMessages(conversation.id));
    expect(view[0].kind).toBe('buttons');
    expect((view[0].payload as { options: unknown[] }).options).toHaveLength(2);
  });
});
