import { LlmAgent } from '@google/adk';
import { ChannelService } from '../../channel/channel.service.js';
import { PocLog } from '../../adk/poc-log.js';
import { MODEL } from '../../constants.js';
import { createSendTextTool } from '../channel-tools.js';
import {
  stripInternalBantContents,
  stopTurnAfterOutboundIntent,
} from './callbacks.js';
import {
  loadInstructionPair,
  withSessionContext,
} from './instructions/load.js';
import { createSearchContextTool } from './tools/search-context.js';
import { readTurnCount } from './state.js';

export const CUSTOMER_NAME = 'customer';

const STATIC = loadInstructionPair('customer');

export function createCustomerAgent(
  channel: ChannelService,
  log: PocLog,
  options: { thinkingBudget?: number } = {},
): LlmAgent {
  const thinkingBudget = options.thinkingBudget ?? 0;
  return new LlmAgent({
    name: CUSTOMER_NAME,
    model: MODEL,
    description: 'Talks to the customer via search_context + send_text.',
    instruction: (context) =>
      withSessionContext(STATIC, {
        user_turn_count: readTurnCount(context.state.toRecord()),
      }),
    tools: [
      createSearchContextTool(log),
      createSendTextTool(channel, log),
    ],
    beforeModelCallback: stripInternalBantContents,
    afterToolCallback: stopTurnAfterOutboundIntent,
    generateContentConfig: {
      thinkingConfig: {
        includeThoughts: false,
        thinkingBudget,
      },
    },
  });
}
