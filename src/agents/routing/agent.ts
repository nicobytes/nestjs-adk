import {
  BaseAgent,
  createEvent,
  FunctionNode,
  LlmAgent,
  Workflow,
} from '@google/adk';
import { z } from 'zod';
import { MODEL } from '../../constants.js';
import { AgentDeps, AgentRoot } from '../types.js';
import {
  createDayTripAgent,
  createFoodieAgent,
  createTransportationAgent,
  createWeekendGuideAgent,
} from '../travel/specialists.js';

export const ROUTING_ID = 'routing';

const ROUTES = [
  'find_and_navigate_agent',
  'weekend_guide_workflow',
  'day_trip_workflow',
] as const;

type RouteName = (typeof ROUTES)[number];

const ROUTER_INSTRUCTION = `You are a coordinator for specialist travel agents.
Analyze the user's request and choose exactly one workflow. Do not answer the query yourself.

Use this priority order:
1. find_and_navigate_agent: the user wants a place found and then directions to it.
2. weekend_guide_workflow: the user wants events, concerts, or activities on a weekend or other timeframe.
3. day_trip_workflow: any other day-trip or "what should I do" request.

Reply with the chosen workflow name and nothing else.`;

export function createRoutingAgent(_deps: AgentDeps): Promise<AgentRoot> {
  const findAndNavigate = sequential(
    'find_and_navigate_agent',
    'Finds one restaurant, then gives directions to it. Use when the user wants a place and how to get there.',
    [
      createFoodieAgent({ outputKey: 'destination', namesOnly: true }),
      createTransportationAgent(),
    ],
  );
  const dayTrip = sequential(
    'day_trip_workflow',
    'Plans a single-day itinerary when no destination-plus-directions request is involved.',
    [createDayTripAgent()],
  );
  const weekend = sequential(
    'weekend_guide_workflow',
    'Finds time-based events such as concerts or festivals happening on a weekend.',
    [createWeekendGuideAgent()],
  );
  const router = new LlmAgent({
    name: 'route_picker',
    model: MODEL,
    description: 'Chooses one travel workflow and returns its name.',
    instruction: ROUTER_INSTRUCTION,
    outputSchema: z.object({
      route: z.enum(ROUTES),
    }),
  });
  const dispatcher = new FunctionNode('route_dispatch', (_ctx, input) =>
    createEvent({
      author: 'route_dispatch',
      route: readRoute(input),
    }),
  );
  return Promise.resolve(
    new Workflow({
      name: ROUTING_ID,
      description:
        'Routes a travel request to one specialist workflow and returns that workflow reply.',
      edges: [
        [
          'START',
          router,
          dispatcher,
          {
            find_and_navigate_agent: findAndNavigate,
            weekend_guide_workflow: weekend,
            day_trip_workflow: dayTrip,
          },
        ],
      ],
    }),
  );
}

function sequential(
  name: string,
  description: string,
  steps: BaseAgent[],
): Workflow {
  return new Workflow({
    name,
    description,
    edges: [['START', ...steps]],
  });
}

function readRoute(input: unknown): RouteName {
  const raw =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object' && 'route' in input
        ? String(input.route)
        : '';
  return ROUTES.find((route) => raw.includes(route)) ?? 'day_trip_workflow';
}
