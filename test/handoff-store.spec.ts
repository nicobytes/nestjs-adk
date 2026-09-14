import {
  BaseAgent,
  createEvent,
  Event,
  InMemorySessionService,
  InvocationContext,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { createAmaruLiteWithAgents } from '../src/agents/amaru-lite/agent.js';
import {
  BantSignals,
  defaultBantSignals,
} from '../src/agents/amaru-lite/gate.js';
import { AMARU_LITE_ID } from '../src/agents/amaru-lite/orchestrator.js';
import {
  HANDOFF_WAITING_HUMAN,
  STATE_BANT_RESULT,
  STATE_HANDOFF_PHASE,
  STATE_USER_TURN_COUNT,
} from '../src/agents/amaru-lite/state.js';
import { ConversationStore } from '../src/conversations/conversation.store.js';
import { TurnService } from '../src/queue/turn.service.js';
import { USER_ID } from '../src/constants.js';
import { createPocApp } from './app-harness.js';

class FakeTextAgent extends BaseAgent {
  constructor(name: string, private readonly text: string) {
    super({ name, description: `fake ${name}` });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      content: { role: 'model', parts: [{ text: this.text }] },
    });
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
  }
}

class FakeQualifier extends BaseAgent {
  constructor(private readonly signals: BantSignals) {
    super({ name: 'qualifier', description: 'fake qualifier' });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    context.session.state[STATE_BANT_RESULT] = this.signals;
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      content: {
        role: 'model',
        parts: [{ text: JSON.stringify(this.signals) }],
      },
      actions: { stateDelta: { [STATE_BANT_RESULT]: this.signals } },
    });
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
  }
}

describe('HITL store sync (A4)', () => {
  let app: INestApplication;
  const suffix = randomUUID();

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/handoff-store-${suffix}.sqlite`, {
      pocDbUrl: `sqlite://./data/handoff-store-${suffix}-poc.sqlite`,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('handoff sets conversation WAITING_HUMAN', async () => {
    const store = app.get(ConversationStore);
    const turn = app.get(TurnService);
    const host = app.get(AdkHostService);

    const conversation = store.findOrCreateOpen(`wa-handoff-${suffix}`);
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(
        defaultBantSignals({ explicit_human_request: true }),
      ),
      bridge: new FakeTextAgent('bridge', 'te paso con un humano'),
      activate: new FakeTextAgent('activate', 'activate'),
      customer: new FakeTextAgent('customer', 'should-not-run'),
    });

    // Swap runner for amaru_lite with fake agents for this test.
    (host as unknown as { agents: Map<string, unknown> }).agents.set(
      AMARU_LITE_ID,
      orchestrator,
    );
    (host as unknown as { runners: Map<string, Runner> }).runners.set(
      AMARU_LITE_ID,
      new Runner({
        appName: AMARU_LITE_ID,
        agent: orchestrator,
        sessionService: host.sessionService,
      }),
    );

    await host.sessionService.getOrCreateSession({
      appName: AMARU_LITE_ID,
      userId: USER_ID,
      sessionId: conversation.id,
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });

    await turn.runTextTurn({
      conversationId: conversation.id,
      text: 'quiero un asesor',
      agentId: AMARU_LITE_ID,
    });

    const updated = store.getById(conversation.id);
    expect(updated?.status).toBe('WAITING_HUMAN');

    const session = await host.sessionService.getSession({
      appName: AMARU_LITE_ID,
      userId: USER_ID,
      sessionId: conversation.id,
    });
    expect(session?.state[STATE_HANDOFF_PHASE]).toBe(HANDOFF_WAITING_HUMAN);
  });
});
