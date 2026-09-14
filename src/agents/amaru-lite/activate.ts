import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';
import { loadInstructionPair, withSessionContext } from './instructions/load.js';

export const ACTIVATE_NAME = 'activate';

const STATIC = loadInstructionPair('activate');

export function createActivateAgent(): LlmAgent {
  return new LlmAgent({
    name: ACTIVATE_NAME,
    model: MODEL,
    description: 'Activation nudge. No tools. Does not bump turn count.',
    instruction: () => withSessionContext(STATIC),
  });
}
