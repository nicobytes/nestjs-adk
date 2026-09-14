import {
  BaseAgent,
  createEvent,
  Event,
  InMemorySessionService,
  InvocationContext,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAmaruLiteWithAgents } from '../src/agents/amaru-lite/agent.js';
import {
  BantSignals,
  defaultBantSignals,
} from '../src/agents/amaru-lite/gate.js';
import { AMARU_LITE_ID } from '../src/agents/amaru-lite/orchestrator.js';
import {
  HANDOFF_WAITING_HUMAN,
  STATE_ACTIVATE_PENDING,
  STATE_BANT_RESULT,
  STATE_HANDOFF_PHASE,
  STATE_USER_TURN_COUNT,
} from '../src/agents/amaru-lite/state.js';
import { USER_ID } from '../src/constants.js';

class FakeTextAgent extends BaseAgent {
  constructor(
    name: string,
    private readonly text: string,
    private readonly onRun?: (context: InvocationContext) => void | Promise<void>,
  ) {
    super({ name, description: `fake ${name}` });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    await this.onRun?.(context);
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      content: {
        role: 'model',
        parts: [{ text: this.text }],
      },
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
    const json = JSON.stringify(this.signals);
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      content: {
        role: 'model',
        parts: [{ text: json }],
      },
      actions: {
        stateDelta: { [STATE_BANT_RESULT]: this.signals },
      },
    });
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
  }
}

class ThrowingCustomer extends BaseAgent {
  constructor() {
    super({ name: 'customer', description: 'throws if run' });
  }

  protected async *runAsyncImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
    throw new Error('customer must not run on handoff');
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
  }
}

async function collectRun(options: {
  orchestrator: BaseAgent;
  text: string;
  sessionId?: string;
  state?: Record<string, unknown>;
}): Promise<{ events: Event[]; sessionState: Record<string, unknown> }> {
  const sessionService = new InMemorySessionService();
  const sessionId = options.sessionId ?? randomUUID();
  await sessionService.createSession({
    appName: AMARU_LITE_ID,
    userId: USER_ID,
    sessionId,
    state: options.state ?? {},
  });
  const runner = new Runner({
    appName: AMARU_LITE_ID,
    agent: options.orchestrator,
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

function authorsOf(events: Event[]): string[] {
  return events
    .map((event) => event.author)
    .filter((author): author is string => Boolean(author));
}

function textsOf(events: Event[]): string[] {
  return events.flatMap((event) =>
    (event.content?.parts ?? [])
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string'),
  );
}

describe('amaru-lite orchestrator', () => {
  it('does not yield qualifier events to the stream', async () => {
    const signals = defaultBantSignals({ interest_level: 'Medium' });
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(signals),
      bridge: new FakeTextAgent('bridge', 'bridge-text'),
      activate: new FakeTextAgent('activate', 'activate-text'),
      customer: new FakeTextAgent('customer', 'customer-text'),
    });

    const { events, sessionState } = await collectRun({
      orchestrator,
      text: 'hola',
    });

    expect(textsOf(events).some((text) => text.includes('interest_level'))).toBe(
      false,
    );
    expect(authorsOf(events)).not.toContain('qualifier');
    expect(sessionState[STATE_BANT_RESULT]).toMatchObject(signals);
    expect(authorsOf(events)).toContain('customer');
  });

  it('runs only bridge when gate qualifies', async () => {
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(
        defaultBantSignals({ explicit_human_request: true }),
      ),
      bridge: new FakeTextAgent('bridge', 'te paso con un asesor'),
      activate: new FakeTextAgent('activate', 'activate-text'),
      customer: new ThrowingCustomer(),
    });

    const { events, sessionState } = await collectRun({
      orchestrator,
      text: 'quiero un asesor',
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });

    expect(authorsOf(events)).toContain('bridge');
    expect(authorsOf(events)).not.toContain('customer');
    expect(sessionState[STATE_HANDOFF_PHASE]).toBe(HANDOFF_WAITING_HUMAN);
  });

  it('runs customer when gate does not qualify', async () => {
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(defaultBantSignals()),
      bridge: new FakeTextAgent('bridge', 'bridge-text'),
      activate: new FakeTextAgent('activate', 'activate-text'),
      customer: new FakeTextAgent('customer', 'customer-ok'),
    });

    const { events } = await collectRun({
      orchestrator,
      text: 'hola de nuevo',
      state: { [STATE_USER_TURN_COUNT]: 1 },
    });

    expect(authorsOf(events)).toContain('customer');
    expect(authorsOf(events)).not.toContain('bridge');
  });

  it('blocks plan-and-date handoff on turn 1', async () => {
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(
        defaultBantSignals({
          plan_and_date_confirmed: true,
          budget_status: 'Aligned',
        }),
      ),
      bridge: new FakeTextAgent('bridge', 'bridge-text'),
      activate: new FakeTextAgent('activate', 'activate-text'),
      customer: new FakeTextAgent('customer', 'customer-turn1'),
    });

    const { events, sessionState } = await collectRun({
      orchestrator,
      text: 'quiero reservar el cocuy en octubre',
      state: { [STATE_USER_TURN_COUNT]: 0 },
    });

    expect(sessionState[STATE_USER_TURN_COUNT]).toBe(1);
    expect(authorsOf(events)).toContain('customer');
    expect(authorsOf(events)).not.toContain('bridge');
    expect(sessionState[STATE_HANDOFF_PHASE]).toBeUndefined();
  });

  it('activate_pending skips qualifier and does not bump turn count', async () => {
    let qualifierRan = false;
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeTextAgent('qualifier', 'should-not-run', () => {
        qualifierRan = true;
      }),
      bridge: new FakeTextAgent('bridge', 'bridge-text'),
      activate: new FakeTextAgent('activate', 'activate-nudge'),
      customer: new FakeTextAgent('customer', 'customer-text'),
    });

    const { events, sessionState } = await collectRun({
      orchestrator,
      text: 'ping',
      state: {
        [STATE_ACTIVATE_PENDING]: 'true',
        [STATE_USER_TURN_COUNT]: 3,
      },
    });

    expect(qualifierRan).toBe(false);
    expect(authorsOf(events)).toContain('activate');
    expect(authorsOf(events)).not.toContain('customer');
    expect(authorsOf(events)).not.toContain('bridge');
    expect(sessionState[STATE_USER_TURN_COUNT]).toBe(3);
    expect(sessionState[STATE_ACTIVATE_PENDING]).toBe(false);
  });

  it('handoff does not run customer even if customer fake would throw', async () => {
    const orchestrator = createAmaruLiteWithAgents({
      qualifier: new FakeQualifier(
        defaultBantSignals({ explicit_human_request: true }),
      ),
      bridge: new FakeTextAgent('bridge', 'handoff-ok'),
      activate: new FakeTextAgent('activate', 'activate-text'),
      customer: new ThrowingCustomer(),
    });

    const { events } = await collectRun({
      orchestrator,
      text: 'asesor por favor',
      state: { [STATE_USER_TURN_COUNT]: 2 },
    });

    expect(authorsOf(events)).toContain('bridge');
    expect(textsOf(events)).toContain('handoff-ok');
  });
});
