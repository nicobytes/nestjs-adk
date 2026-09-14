import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AdkHostService, RunView } from '../src/adk/adk-host.service.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { WhatsAppApiError } from '../src/adapters/whatsapp/whatsapp.errors.js';
import { createPocApp } from './app-harness.js';

const sessionId = 'whatsapp:phone-id:5215512345678';
const context = {
  channel: 'whatsapp' as const,
  userId: sessionId,
  target: '5215512345678',
  agentId: 'amaru',
};

const view: RunView = {
  sessionId,
  paused: false,
  replyText: 'ok',
  events: [],
  sessionEvents: [],
};

function textWebhook(id: string, body = 'hola', phoneNumberId = 'phone-id') {
  return envelope(
    {
      id,
      from: '5215512345678',
      type: 'text',
      text: { body },
    },
    phoneNumberId,
  );
}

function buttonWebhook(id: string, buttonId = 'b') {
  return envelope({
    id,
    from: '5215512345678',
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: buttonId, title: 'B' },
    },
  });
}

function envelope(message: unknown, phoneNumberId?: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              ...(phoneNumberId
                ? { metadata: { phone_number_id: phoneNumberId } }
                : {}),
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('whatsapp channel', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('WHATSAPP_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'verify-me');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret');
    app = await createPocApp(`sqlite://./data/whatsapp-${randomUUID()}.sqlite`);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies the Meta webhook challenge as plain text', async () => {
    const response = await request(app.getHttpServer())
      .get('/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-me',
        'hub.challenge': '12345',
      })
      .expect(200);
    expect(response.text).toBe('12345');
  });

  it('rejects a bad verify token', async () => {
    await request(app.getHttpServer())
      .get('/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'nope',
        'hub.challenge': '12345',
      })
      .expect(403);
  });

  it('rejects a webhook without a valid signature', async () => {
    await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .send(textWebhook('wamid.unsigned'))
      .expect(401);
  });

  it('acks before inbound finishes, then types and dispatches', async () => {
    const host = app.get(AdkHostService);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      order.push('typing');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        status: 'read',
        message_id: 'wamid.slow',
        typing_indicator: { type: 'text' },
      });
      return jsonResponse({ success: true });
    });
    vi.spyOn(host, 'inbound').mockImplementation(async () => {
      order.push('inbound');
      started();
      await gate;
      return view;
    });

    const pending = signed(app, textWebhook('wamid.slow'));
    const httpDone = pending.then((res) => res.status);
    const status = await Promise.race([
      httpDone,
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () =>
            reject(new Error('webhook did not ack while inbound was blocked')),
          1000,
        );
      }),
    ]);
    expect(status).toBe(200);
    await startedPromise;
    expect(order).toEqual(['typing', 'inbound']);
    release();
    await pending;
  });

  it('inbounds text and resumes a button click', async () => {
    const host = app.get(AdkHostService);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    const resume = vi.spyOn(host, 'resume').mockResolvedValue(view);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true })),
    );

    await signed(app, textWebhook('wamid.text')).expect(200);
    await vi.waitFor(() =>
      expect(inbound).toHaveBeenCalledWith(sessionId, 'hola', context),
    );

    await signed(app, buttonWebhook('wamid.click')).expect(200);
    await vi.waitFor(() =>
      expect(resume).toHaveBeenCalledWith(sessionId, 'b', context),
    );
    expect(inbound).toHaveBeenCalledTimes(1);
  });

  it('falls back to the configured phone number id', async () => {
    const host = app.get(AdkHostService);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true })),
    );

    await signed(app, textWebhook('wamid.fallback', 'hola', '')).expect(200);
    await vi.waitFor(() =>
      expect(inbound).toHaveBeenCalledWith(sessionId, 'hola', context),
    );
  });

  it('ignores a duplicate WhatsApp message id', async () => {
    const host = app.get(AdkHostService);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true })),
    );
    const payload = textWebhook('wamid.dup');

    await signed(app, payload).expect(200);
    await vi.waitFor(() => expect(inbound).toHaveBeenCalledTimes(1));
    await signed(app, payload).expect(200);
    expect(inbound).toHaveBeenCalledTimes(1);
  });

  it('inbounds an image as a placeholder', async () => {
    const host = app.get(AdkHostService);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true })),
    );

    await signed(
      app,
      envelope({
        id: 'wamid.image',
        from: '5215512345678',
        type: 'image',
        image: { caption: 'the lobby' },
      }, 'phone-id'),
    ).expect(200);
    await vi.waitFor(() =>
      expect(inbound).toHaveBeenCalledWith(sessionId, 'the lobby', context),
    );
  });

  it('posts a map pin and an image link to Graph', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ messages: [{ id: 'wamid.out' }] })),
      );
    const channel = app.get(ChannelService);
    channel.bind(sessionId, 'whatsapp', '5215512345678');

    await channel.sendLocation(sessionId, {
      latitude: -19.04,
      longitude: -65.24,
      name: 'HQ',
    });
    await channel.sendMedia(sessionId, {
      url: 'https://cdn.example/photo.jpg',
      mimeType: 'image/jpeg',
      caption: 'Lobby',
    });

    const bodies = fetchSpy.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(bodies[0]).toMatchObject({
      type: 'location',
      to: '5215512345678',
      location: { latitude: -19.04, longitude: -65.24, name: 'HQ' },
    });
    expect(bodies[1]).toMatchObject({
      type: 'image',
      to: '5215512345678',
      image: { link: 'https://cdn.example/photo.jpg', caption: 'Lobby' },
    });
  });

  it('posts interactive buttons to Graph when the session is bound to WhatsApp', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ messages: [{ id: 'wamid.out' }] })),
      );
    const channel = app.get(ChannelService);
    channel.bind(sessionId, 'whatsapp', '5215512345678');

    await channel.sendButtons(sessionId, '¿A o B?', [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/phone-id/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5215512345678',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '¿A o B?' },
      },
    });
  });

  it('does not swallow a Graph error from sendButtons', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ error: { message: 'bad token', code: 190 } }, 401),
      ),
    );
    const channel = app.get(ChannelService);
    channel.bind(sessionId, 'whatsapp', '5215512345678');

    await expect(
      channel.sendButtons(sessionId, '¿A o B?', [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ]),
    ).rejects.toMatchObject({
      name: 'WhatsAppApiError',
      status: 401,
      code: 'AUTH_FAILED',
    });
    expect(new WhatsAppApiError(429, '{"error":{"code":130429}}').code).toBe(
      'RATE_LIMITED',
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function signed(app: INestApplication, body: unknown) {
  const raw = JSON.stringify(body);
  const digest = createHmac('sha256', 'app-secret').update(raw).digest('hex');
  return request(app.getHttpServer())
    .post('/whatsapp/webhook')
    .set('Content-Type', 'application/json')
    .set('x-hub-signature-256', `sha256=${digest}`)
    .send(body);
}
