import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdkHostService, RunView } from '../src/adk/adk-host.service.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { playgroundIntent, toPlaygroundEvent } from '../src/channel/playground.js';
import { createPocApp } from './app-harness.js';

const view: RunView = {
  sessionId: 's_123',
  paused: false,
  replyText: 'ok',
  events: [
    {
      id: 'e1',
      author: 'customer',
      invocationId: 'inv',
      longRunningToolIds: [],
      parts: [{ text: 'ok' }],
    },
  ],
  sessionEvents: [],
};

describe('playground channel', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/playground-${randomUUID()}.sqlite`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('forwards model errors so DevUI can stop loading', () => {
    expect(
      toPlaygroundEvent({
        id: 'e1',
        author: 'amaru',
        invocationId: 'inv',
        longRunningToolIds: [],
        parts: [],
        errorCode: '503',
        errorMessage: 'This model is currently experiencing high demand.',
      }),
    ).toMatchObject({
      id: 'e1',
      author: 'amaru',
      invocationId: 'inv',
      errorCode: '503',
      errorMessage: 'This model is currently experiencing high demand.',
    });
    expect(
      toPlaygroundEvent({
        id: 'e1',
        author: 'amaru',
        invocationId: 'inv',
        longRunningToolIds: [],
        parts: [],
        errorCode: '503',
        errorMessage: 'This model is currently experiencing high demand.',
      }),
    ).not.toHaveProperty('content');
  });

  it('maps a click to a choice, not to user text', () => {
    expect(
      playgroundIntent({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'ask_choice',
              response: { buttonId: 'b', status: 'selected' },
            },
          },
        ],
      }),
    ).toEqual({ kind: 'choice', buttonId: 'b' });
  });

  it('serves the official playground UI and lets it open a session', async () => {
    const page = await request(app.getHttpServer()).get('/dev-ui/').expect(200);
    expect(page.text).toContain('Agent Development Kit Dev UI');
    expect(page.headers['content-type']).toMatch(/html/);
    const script = page.text.match(/src="\.\/(main-[^"]+\.js)"/)?.[1];
    expect(script).toBeTruthy();
    await request(app.getHttpServer())
      .get(`/dev-ui/${script}`)
      .expect(200)
      .expect('Content-Type', /javascript/);

    await request(app.getHttpServer()).get('/').expect(302).expect('Location', '/dev-ui/');

    await request(app.getHttpServer())
      .get('/dev/apps/amaru/debug/trace/session/s_123')
      .expect(200)
      .expect([]);
    await request(app.getHttpServer()).get('/dev/apps/amaru/eval_sets').expect(200).expect([]);
    await request(app.getHttpServer()).get('/dev/apps/amaru/eval_results').expect(200).expect([]);
    await request(app.getHttpServer()).get('/dev/apps/amaru/build_graph').expect(200);

    const created = await request(app.getHttpServer())
      .post('/apps/amaru/users/user/sessions')
      .expect(200);
    expect(created.body.id).toEqual(expect.any(String));
    expect(created.body.userId).toBe('user');
  });

  it('lists the app and stores playground session ids', async () => {
    const listed = await request(app.getHttpServer()).get('/list-apps').expect(200);
    expect(listed.body).toEqual(['amaru', 'sequential_flow', 'routing']);

    const created = await request(app.getHttpServer())
      .post('/apps/amaru/users/u_123/sessions/s_123')
      .send({ topic: 'buttons' })
      .expect(200);
    expect(created.body).toMatchObject({
      id: 's_123',
      appName: 'amaru',
      userId: 'u_123',
    });

    const loaded = await request(app.getHttpServer())
      .get('/apps/amaru/users/u_123/sessions/s_123')
      .expect(200);
    expect(loaded.body.userId).toBe('u_123');

    await request(app.getHttpServer())
      .post('/apps/amaru/users/u_123/sessions/s_123')
      .send({})
      .expect(400);

    await request(app.getHttpServer()).get('/apps/other/users/u_123/sessions/s_123').expect(404);
  });

  it('resumes on a function response and does not inbound the click as text', async () => {
    const host = app.get(AdkHostService);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    const resume = vi.spyOn(host, 'resume').mockResolvedValue(view);

    const response = await request(app.getHttpServer())
      .post('/run')
      .send({
        appName: 'amaru',
        userId: 'u_123',
        sessionId: 's_123',
        newMessage: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-1',
                name: 'ask_choice',
                response: { buttonId: 'b' },
              },
            },
          ],
        },
      })
      .expect(200);

    expect(resume).toHaveBeenCalledWith('s_123', 'b', {
      userId: 'u_123',
      channel: 'playground',
      agentId: 'amaru',
    });
    expect(inbound).not.toHaveBeenCalled();
    expect(response.body[0].content.parts[0].text).toBe('ok');
    inbound.mockRestore();
    resume.mockRestore();
  });

  it('treats a matching button id as a click and other text as inbound', async () => {
    const host = app.get(AdkHostService);
    const channel = app.get(ChannelService);
    channel.bind('s_123', 'playground');
    channel.sendButtons('s_123', 'pick', [{ id: 'b', title: 'B' }]);
    const inbound = vi.spyOn(host, 'inbound').mockResolvedValue(view);
    const resume = vi.spyOn(host, 'resume').mockResolvedValue(view);

    await request(app.getHttpServer())
      .post('/run')
      .send({
        appName: 'amaru',
        userId: 'u_123',
        sessionId: 's_123',
        newMessage: { role: 'user', parts: [{ text: 'b' }] },
      })
      .expect(200);
    expect(resume).toHaveBeenCalledWith('s_123', 'b', {
      userId: 'u_123',
      channel: 'playground',
      agentId: 'amaru',
    });

    await request(app.getHttpServer())
      .post('/run_sse')
      .send({
        appName: 'amaru',
        userId: 'u_123',
        sessionId: 's_123',
        newMessage: { role: 'user', parts: [{ text: 'otra cosa' }] },
      })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    expect(inbound).toHaveBeenCalledWith('s_123', 'otra cosa', {
      userId: 'u_123',
      channel: 'playground',
      agentId: 'amaru',
    });
    inbound.mockRestore();
    resume.mockRestore();
  });
});
