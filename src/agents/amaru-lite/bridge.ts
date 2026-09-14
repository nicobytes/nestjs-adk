import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';
import { loadInstructionPair, withSessionContext } from './instructions/load.js';

export const BRIDGE_NAME = 'bridge';

const STATIC = loadInstructionPair('bridge');

export function createBridgeAgent(): LlmAgent {
  return new LlmAgent({
    name: BRIDGE_NAME,
    model: MODEL,
    description: 'Closing handoff text only. No tools.',
    instruction: () => withSessionContext(STATIC),
  });
}
