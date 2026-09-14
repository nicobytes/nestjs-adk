import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';

export const BRIDGE_NAME = 'bridge';

export function createBridgeAgent(): LlmAgent {
  return new LlmAgent({
    name: BRIDGE_NAME,
    model: MODEL,
    description: 'Closing handoff text only. No tools.',
    instruction: `You are the handoff bridge. Write one short Spanish closing message telling the customer a human advisor will continue. Do not ask questions. Do not call tools. Do not mention BANT or internal signals.`,
  });
}
