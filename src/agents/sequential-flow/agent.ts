import { BaseAgent, createEvent, Event, InvocationContext, LlmAgent } from '@google/adk';
import { visibleText } from '../../adk/events.js';
import { MODEL } from '../../constants.js';
import { AgentDeps } from '../types.js';
import {
  createDayTripAgent,
  createFoodieAgent,
  createTransportationAgent,
  createWeekendGuideAgent,
} from '../travel/specialists.js';

export const SEQUENTIAL_FLOW_ID = 'sequential_flow';
export const FIND_AND_NAVIGATE_COMBO = 'find_and_navigate_combo';

const ROUTES = [
  'foodie_agent',
  'weekend_guide_agent',
  'day_trip_agent',
  FIND_AND_NAVIGATE_COMBO,
] as const;

type DirectRoute = 'foodie_agent' | 'weekend_guide_agent' | 'day_trip_agent';

const ROUTER_INSTRUCTION = `You are a request router. Analyze the user's query and decide which agent or workflow should handle it.
Do not answer the query yourself. Return only the name of the most appropriate choice.

Available options:
- foodie_agent: queries only about food, restaurants, or eating.
- weekend_guide_agent: events, concerts, or activities on a specific timeframe such as a weekend.
- day_trip_agent: any other day-trip request.
- find_and_navigate_combo: complex queries that first find a place and then ask for directions to it.

Return the single option name and nothing else.`;

export function parseRoute(text: string): string | undefined {
  const cleaned = text.trim().replace(/^['"`]+|['"`]+$/g, '').trim();
  if ((ROUTES as readonly string[]).includes(cleaned)) return cleaned;
  return cleaned.match(
    /find_and_navigate_combo|weekend_guide_agent|day_trip_agent|foodie_agent/,
  )?.[0];
}

export function extractDestination(text: string): string | undefined {
  const bold = text.match(/\*\*(.+?)\*\*/);
  const name = bold?.[1]?.trim();
  return name || undefined;
}

export class ManualSequentialFlow extends BaseAgent {
  constructor(
    private readonly router: LlmAgent,
    private readonly workers: Record<DirectRoute, LlmAgent>,
    private readonly foodie: LlmAgent,
    private readonly transportation: LlmAgent,
  ) {
    super({
      name: SEQUENTIAL_FLOW_ID,
      description:
        'Routes a request, then runs one worker or a foodie-then-directions combo.',
      subAgents: [
        router,
        workers.day_trip_agent,
        workers.foodie_agent,
        workers.weekend_guide_agent,
        transportation,
      ],
    });
  }

  protected async *runAsyncImpl(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    const routerEvents: Event[] = [];
    for await (const event of this.router.runAsync(context)) {
      routerEvents.push(event);
      yield event;
    }
    const route = parseRoute(lastVisible(routerEvents));
    if (route === FIND_AND_NAVIGATE_COMBO) {
      yield* this.runCombo(context);
      return;
    }
    const worker = isDirectRoute(route) ? this.workers[route] : undefined;
    if (!worker) {
      yield unknownRoute(context, route);
      return;
    }
    yield* worker.runAsync(context);
  }

  protected async *runLiveImpl(): AsyncGenerator<Event, void, void> {
    yield* [];
    throw new Error('live is out of scope');
  }

  private async *runCombo(
    context: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    const foodieEvents: Event[] = [];
    for await (const event of this.foodie.runAsync(context)) {
      foodieEvents.push(event);
      yield event;
    }
    const destination = extractDestination(lastVisible(foodieEvents));
    if (!destination) {
      yield createEvent({
        author: this.name,
        invocationId: context.invocationId,
        content: {
          role: 'model',
          parts: [
            {
              text: 'Could not determine the destination. Expected a **name** in the foodie reply.',
            },
          ],
        },
      });
      return;
    }
    context.session.state.destination = destination;
    yield createEvent({
      author: this.name,
      invocationId: context.invocationId,
      actions: { stateDelta: { destination } },
    });
    yield* this.transportation.runAsync(context);
  }
}

export function createSequentialFlowAgent(
  _deps: AgentDeps,
): Promise<BaseAgent> {
  const foodie = createFoodieAgent();
  const dayTrip = createDayTripAgent();
  const weekend = createWeekendGuideAgent();
  const transportation = createTransportationAgent();
  return Promise.resolve(
    new ManualSequentialFlow(
      new LlmAgent({
        name: 'router_agent',
        model: MODEL,
        description: 'Chooses a worker name or the find-and-navigate combo. Does not answer.',
        instruction: ROUTER_INSTRUCTION,
      }),
      {
        day_trip_agent: dayTrip,
        foodie_agent: foodie,
        weekend_guide_agent: weekend,
      },
      foodie,
      transportation,
    ),
  );
}

function isDirectRoute(route: string | undefined): route is DirectRoute {
  return (
    route === 'foodie_agent' ||
    route === 'weekend_guide_agent' ||
    route === 'day_trip_agent'
  );
}

function lastVisible(events: Event[]): string {
  return events.map(visibleText).filter(Boolean).at(-1) ?? '';
}

function unknownRoute(context: InvocationContext, route: string | undefined): Event {
  return createEvent({
    author: SEQUENTIAL_FLOW_ID,
    invocationId: context.invocationId,
    content: {
      role: 'model',
      parts: [{ text: `Unknown route: ${route ?? '(empty)'}` }],
    },
  });
}
