import {
  BaseAgent,
  createEvent,
  Event,
  InMemorySessionService,
  InvocationContext,
  LlmAgent,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PocLog } from '../src/adk/poc-log.js';
import { createAmaruLiteWithAgents } from '../src/agents/amaru-lite/agent.js';
import {
  BantSignals,
  defaultBantSignals,
  HANDOFF_REASON_DISABILITY,
  HANDOFF_REASON_GROUP,
  HANDOFF_REASON_PLAN_DATE,
} from '../src/agents/amaru-lite/gate.js';
import { AMARU_LITE_ID } from '../src/agents/amaru-lite/orchestrator.js';
import {
  createSendButtonsTool,
  createSendTextTool,
  SEND_TEXT,
} from '../src/agents/channel-tools.js';
import {
  HANDOFF_WAITING_HUMAN,
  STATE_ACTIVATE_PENDING,
  STATE_BANT_RESULT,
  STATE_HANDOFF_PHASE,
  STATE_HANDOFF_REASON,
  STATE_USER_TURN_COUNT,
} from '../src/agents/amaru-lite/state.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { USER_ID } from '../src/constants.js';
import { ScriptedLlm } from './scripted-llm.js';

class FakeTextAgent extends BaseAgent {
  constructor(
    name: string,
    private readonly text: string,
    private readonly onRun?: () => void,
  ) {
    super({ name, description: `fake ${name}` });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    this.onRun?.();
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

async function runEval(options: {
  signals: BantSignals;
  text: string;
  state?: Record<string, unknown>;
  customerText?: string;
}): Promise<{ events: Event[]; sessionState: Record<string, unknown> }> {
  const orchestrator = createAmaruLiteWithAgents({
    qualifier: new FakeQualifier(options.signals),
    bridge: new FakeTextAgent('bridge', 'bridge-handoff'),
    activate: new FakeTextAgent('activate', 'activate-nudge'),
    customer: new FakeTextAgent(
      'customer',
      options.customerText ?? 'customer-reply',
    ),
  });
  const sessionService = new InMemorySessionService();
  const sessionId = randomUUID();
  await sessionService.createSession({
    appName: AMARU_LITE_ID,
    userId: USER_ID,
    sessionId,
    state: options.state ?? {},
  });
  const runner = new Runner({
    appName: AMARU_LITE_ID,
    agent: orchestrator,
    sessionService,
  });
  const events: Event[] = [];
  for await (const event of runner.runAsync({
    userId: USER_ID,
    sessionId,
    newMessage: { role: 'user', parts: [{ text: options.text }] },
  })) {
    events.push(event);
  }
  const session = await sessionService.getSession({
    appName: AMARU_LITE_ID,
    userId: USER_ID,
    sessionId,
  });
  return { events, sessionState: session?.state ?? {} };
}

function authors(events: Event[]): string[] {
  return events
    .map((e) => e.author)
    .filter((a): a is string => Boolean(a));
}

function texts(events: Event[]): string[] {
  return events.flatMap((e) =>
    (e.content?.parts ?? [])
      .map((p) => p.text)
      .filter((t): t is string => typeof t === 'string'),
  );
}

describe('amaru-lite evals (fake qualifier)', () => {
  it('es_greeting_no_handoff', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals(),
      text: 'hola',
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });
    expect(authors(events)).toContain('customer');
    expect(sessionState[STATE_HANDOFF_PHASE]).not.toBe(HANDOFF_WAITING_HUMAN);
  });

  it('es_no_handoff_turn1_booking', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({
        plan_and_date_confirmed: true,
        budget_status: 'Aligned',
      }),
      text: 'quiero reservar el cocuy en octubre',
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });
    expect(authors(events)).toContain('customer');
    expect(authors(events)).not.toContain('bridge');
    expect(sessionState[STATE_HANDOFF_PHASE]).not.toBe(HANDOFF_WAITING_HUMAN);
  });

  it('es_handoff_plan_and_date', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({
        plan_and_date_confirmed: true,
        budget_status: 'Aligned',
      }),
      text: 'confirmo el cocuy el 12',
      state: { [STATE_USER_TURN_COUNT]: 1 },
    });
    expect(authors(events)).toContain('bridge');
    expect(authors(events)).not.toContain('customer');
    expect(sessionState[STATE_HANDOFF_REASON]).toBe(HANDOFF_REASON_PLAN_DATE);
  });

  it('es_yes_after_reserve_ask', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({
        plan_and_date_confirmed: true,
        budget_status: 'Aligned',
      }),
      text: 'sí',
      state: { [STATE_USER_TURN_COUNT]: 2 },
    });
    expect(authors(events)).toContain('bridge');
    expect(sessionState[STATE_HANDOFF_PHASE]).toBe(HANDOFF_WAITING_HUMAN);
  });

  it('es_disability_access_handoff', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({ disability_access_inquiry: true }),
      text: 'puedo ir en silla de ruedas',
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });
    expect(authors(events)).toContain('bridge');
    expect(sessionState[STATE_HANDOFF_REASON]).toBe(HANDOFF_REASON_DISABILITY);
  });

  it('es_accept_custom_group_handoff', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({
        custom_group_accepted: true,
        budget_status: 'Aligned',
      }),
      text: 'arme un grupo a medida',
      state: { [STATE_USER_TURN_COUNT]: 1 },
    });
    expect(authors(events)).toContain('bridge');
    expect(sessionState[STATE_HANDOFF_REASON]).toBe(HANDOFF_REASON_GROUP);
  });

  it('es_high_score_no_confirm_no_handoff', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals({
        interest_level: 'High',
        has_decision_authority: true,
        purchase_urgency: 'Immediate',
      }),
      text: 'me interesa mucho',
      state: { [STATE_USER_TURN_COUNT]: 2 },
    });
    expect(authors(events)).toContain('customer');
    expect(sessionState[STATE_HANDOFF_PHASE]).not.toBe(HANDOFF_WAITING_HUMAN);
  });

  it('es_activate_nudge', async () => {
    const { events, sessionState } = await runEval({
      signals: defaultBantSignals(),
      text: 'ping',
      state: {
        [STATE_ACTIVATE_PENDING]: 'true',
        [STATE_USER_TURN_COUNT]: 4,
      },
    });
    expect(authors(events)).toContain('activate');
    expect(authors(events)).not.toContain('customer');
    expect(sessionState[STATE_USER_TURN_COUNT]).toBe(4);
  });

  it('es_no_bant_json_on_channel', async () => {
    const { events } = await runEval({
      signals: defaultBantSignals({ interest_level: 'High' }),
      text: 'hola',
      state: { [STATE_USER_TURN_COUNT]: 0 },
      customerText: 'Hola, ¿en qué te ayudo?',
    });
    expect(
      texts(events).some(
        (t) => t.includes('interest_level') || t.includes('bant_result'),
      ),
    ).toBe(false);
    expect(authors(events)).not.toContain('qualifier');
  });
});

describe('amaru-lite outbound gist', () => {
  it('outbound tool result is gist not channel json', async () => {
    const channel = new ChannelService(new PocLog(), []);
    const sessionId = randomUUID();
    channel.bind(sessionId, 'fake');

    const fakeModel = new ScriptedLlm([
      () => ({
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-out-1',
                name: SEND_TEXT,
                args: { body: 'mensaje canal' },
              },
            },
          ],
        },
      }),
    ]);

    const agent = new LlmAgent({
      name: 'customer_gist',
      model: fakeModel,
      instruction: 'Use send_text once.',
      tools: [
        createSendTextTool(channel, new PocLog()),
        createSendButtonsTool(channel, new PocLog()),
      ],
    });

    const sessionService = new InMemorySessionService();
    await sessionService.createSession({
      appName: 'gist_probe',
      userId: USER_ID,
      sessionId,
    });
    const runner = new Runner({
      appName: 'gist_probe',
      agent,
      sessionService,
    });

    const events: Event[] = [];
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: 'hola' }] },
    })) {
      events.push(event);
    }

    const channelMsgs = channel.list(sessionId);
    expect(channelMsgs).toHaveLength(1);
    expect(channelMsgs[0].payload).toMatchObject({ text: 'mensaje canal' });

    const functionResponses = events.flatMap((event) =>
      (event.content?.parts ?? [])
        .map((part) => part.functionResponse)
        .filter(Boolean),
    );
    expect(functionResponses.length).toBeGreaterThanOrEqual(1);
    for (const fr of functionResponses) {
      const response = fr?.response;
      // gist: null / empty, never Graph channel JSON
      if (response && typeof response === 'object') {
        expect(JSON.stringify(response)).not.toContain('mensaje canal');
        expect(response).not.toHaveProperty('messaging_product');
      }
    }
    expect(fakeModel.calls).toBe(1);
  });
});
