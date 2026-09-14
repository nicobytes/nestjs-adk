import {
  BaseAgent,
  createEvent,
  Event,
  InvocationContext,
} from '@google/adk';
import {
  BantSignals,
  decideHandoff,
  defaultBantSignals,
  HandoffDecision,
} from './gate.js';
import {
  HANDOFF_WAITING_HUMAN,
  isActivatePending,
  readBantResult,
  readTurnCount,
  STATE_ACTIVATE_PENDING,
  STATE_BANT_RESULT,
  STATE_HANDOFF_PHASE,
  STATE_HANDOFF_REASON,
  STATE_LEAD_QUALIFIES,
  STATE_USER_TURN_COUNT,
} from './state.js';

export const AMARU_LITE_ID = 'amaru_lite';
export const ORCHESTRATOR_NAME = 'amaru_lite';

export type HandoffGate = (
  signals: BantSignals,
  userTurnCount: number,
) => HandoffDecision;

function mergeStateDelta(
  context: InvocationContext,
  event: Event,
): void {
  const delta = event.actions?.stateDelta;
  if (!delta || typeof delta !== 'object') return;
  Object.assign(context.session.state, delta);
}

function parseBantFromEvents(events: Event[]): BantSignals | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const parts = events[i].content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text !== 'string') continue;
      const trimmed = part.text.trim();
      const jsonish = trimmed.startsWith('{')
        ? trimmed
        : trimmed.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonish) continue;
      try {
        const parsed = JSON.parse(jsonish) as BantSignals;
        if (parsed && typeof parsed === 'object' && 'interest_level' in parsed) {
          return parsed;
        }
      } catch {
        // ignore non-JSON
      }
    }
  }
  return undefined;
}

function coerceBant(raw: unknown): BantSignals | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as BantSignals;
      if (parsed && typeof parsed === 'object' && 'interest_level' in parsed) {
        return parsed;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (typeof raw === 'object' && 'interest_level' in (raw as object)) {
    return raw as BantSignals;
  }
  return undefined;
}

/**
 * Amaru-lite orchestrator: activate shortcut, qualifier (swallowed), gate, bridge|customer.
 * Sub-agents are injectable so tests can use fakes without Gemini.
 */
export class AmaruLiteOrchestrator extends BaseAgent {
  private readonly gate: HandoffGate;

  constructor(
    private readonly qualifier: BaseAgent,
    private readonly bridge: BaseAgent,
    private readonly activate: BaseAgent,
    private readonly customer: BaseAgent,
    options: { name?: string; gate?: HandoffGate } = {},
  ) {
    super({
      name: options.name ?? ORCHESTRATOR_NAME,
      description:
        'Qualifier is swallowed; gate decides bridge handoff vs customer.',
      subAgents: [qualifier, bridge, activate, customer],
    });
    this.gate = options.gate ?? decideHandoff;
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    if (isActivatePending(context.session.state)) {
      yield* this.runActivate(context);
      return;
    }

    const nextTurn = readTurnCount(context.session.state) + 1;
    context.session.state[STATE_USER_TURN_COUNT] = nextTurn;
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      actions: {
        stateDelta: { [STATE_USER_TURN_COUNT]: nextTurn },
      },
    });

    const qualifierEvents: Event[] = [];
    for await (const event of this.qualifier.runAsync(context)) {
      mergeStateDelta(context, event);
      qualifierEvents.push(event);
      // swallow: do not yield qualifier events (BANT JSON stays off the stream)
    }

    const signals =
      coerceBant(readBantResult(context.session.state)) ??
      parseBantFromEvents(qualifierEvents) ??
      defaultBantSignals();

    context.session.state[STATE_BANT_RESULT] = signals;
    const decision = this.gate(signals, nextTurn);
    context.session.state[STATE_LEAD_QUALIFIES] = decision.qualifies;

    if (decision.qualifies) {
      context.session.state[STATE_HANDOFF_PHASE] = HANDOFF_WAITING_HUMAN;
      context.session.state[STATE_HANDOFF_REASON] = decision.reason;
      yield createEvent({
        author: this.name,
        invocationId: context.invocationId,
        actions: {
          stateDelta: {
            [STATE_BANT_RESULT]: signals,
            [STATE_LEAD_QUALIFIES]: true,
            [STATE_HANDOFF_PHASE]: HANDOFF_WAITING_HUMAN,
            [STATE_HANDOFF_REASON]: decision.reason,
          },
        },
      });
      yield* this.bridge.runAsync(context);
      return;
    }

    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      actions: {
        stateDelta: {
          [STATE_BANT_RESULT]: signals,
          [STATE_LEAD_QUALIFIES]: false,
        },
      },
    });
    yield* this.customer.runAsync(context);
  }

  private async *runActivate(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    const turn = readTurnCount(context.session.state);
    context.session.state[STATE_ACTIVATE_PENDING] = false;
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      actions: {
        stateDelta: {
          [STATE_ACTIVATE_PENDING]: false,
          [STATE_USER_TURN_COUNT]: turn,
        },
      },
    });
    yield* this.activate.runAsync(context);
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
    throw new Error('live is out of scope for amaru_lite');
  }
}
