import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';

export const ACTIVATE_NAME = 'activate';

export function createActivateAgent(): LlmAgent {
  return new LlmAgent({
    name: ACTIVATE_NAME,
    model: MODEL,
    description: 'Activation nudge. No tools. Does not bump turn count.',
    instruction: `You are an activation nudge. Write one short Spanish follow-up to re-engage the customer. Do not call tools. Do not invent that they already booked.`,
  });
}
