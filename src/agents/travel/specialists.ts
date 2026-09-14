import { GOOGLE_SEARCH, LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';

const DAY_TRIP_INSTRUCTION = `You are the "Spontaneous Day Trip" Generator. Create a full-day itinerary from a mood, interest, and budget.

Guidelines:
1. Budget-aware: match hints like cheap, affordable, or splurge. Use Google Search for activities that fit the budget.
2. Full-day structure: morning, afternoon, and evening.
3. Real-time focus: search for current hours and events.
4. Mood matching: align suggestions with the requested mood.

Return the itinerary in markdown with time blocks and specific venue names.
Ignore any previous message that is only a route name.`;

const WEEKEND_INSTRUCTION = `You are a local events guide. Find interesting events, concerts, festivals, and activities happening on a specific weekend. Use Google Search.
Ignore any previous message that is only a route name.`;

export function createDayTripAgent(name = 'day_trip_agent'): LlmAgent {
  return new LlmAgent({
    name,
    model: MODEL,
    description:
      'Generates a spontaneous full-day itinerary from mood, interests, and budget.',
    instruction: DAY_TRIP_INSTRUCTION,
    tools: [GOOGLE_SEARCH],
  });
}

export function createWeekendGuideAgent(name = 'weekend_guide_agent'): LlmAgent {
  return new LlmAgent({
    name,
    model: MODEL,
    description:
      'Finds events, concerts, festivals, and activities on a specific weekend.',
    instruction: WEEKEND_INSTRUCTION,
    tools: [GOOGLE_SEARCH],
  });
}

export function createFoodieAgent(options?: {
  name?: string;
  outputKey?: string;
  namesOnly?: boolean;
}): LlmAgent {
  const namesOnly = options?.namesOnly === true;
  return new LlmAgent({
    name: options?.name ?? 'foodie_agent',
    model: MODEL,
    description: 'Finds restaurants and culinary experiences.',
    instruction: namesOnly
      ? `You are an expert food critic. Find the best restaurant for the user's request. Use Google Search.
When you recommend a place, output only the establishment name and nothing else.
For example, if the best sushi is at Jin Sho, output only: Jin Sho`
      : `You are an expert food critic. Find the best food, restaurants, or culinary experiences for the user's request. Use Google Search.
When you recommend a place, state its name clearly in bold. For example: The best sushi is at **Jin Sho**.
Ignore any previous message that is only a route name.`,
    tools: [GOOGLE_SEARCH],
    outputKey: options?.outputKey,
  });
}

export function createTransportationAgent(name = 'transportation_agent'): LlmAgent {
  return new LlmAgent({
    name,
    model: MODEL,
    description: 'Gives directions to a destination already chosen.',
    instruction: `You are a navigation assistant. The user wants to go to: {destination}.
Analyze the user's original query to find their starting point.
Then give clear directions from that starting point to {destination}.
Use Google Search if you need current transit or route details.`,
    tools: [GOOGLE_SEARCH],
  });
}
