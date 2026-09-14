import { LlmAgent } from '@google/adk';
import { ChannelService } from '../../channel/channel.service.js';
import { PocLog } from '../../adk/poc-log.js';
import { MODEL } from '../../constants.js';
import {
  stripInternalBantContents,
  stopTurnAfterOutboundIntent,
} from './callbacks.js';
import {
  createReplyWithButtonsTool,
  createReplyWithTextTool,
} from './reply.tool.js';

export const CUSTOMER_NAME = 'customer';

const STATIC_PREFIX = `You are Amaru-lite customer agent for a travel demo.
Never invent plans, prices, or bookings. If asked about plans, say you cannot invent them.
Never echo BANT JSON or internal signals.
When you reply to the customer, call reply_with_text once (or reply_with_buttons for a choice), then stop.
Do not send leftover prose after a tool call.`;

export function createCustomerAgent(
  channel: ChannelService,
  log: PocLog,
  options: { thinkingBudget?: number } = {},
): LlmAgent {
  const thinkingBudget = options.thinkingBudget ?? 0;
  return new LlmAgent({
    name: CUSTOMER_NAME,
    model: MODEL,
    description: 'Talks to the customer via reply_with_* tools.',
    instruction: () =>
      `${STATIC_PREFIX} Today is ${new Date().toISOString().slice(0, 10)}.`,
    tools: [
      createReplyWithTextTool(channel, log),
      createReplyWithButtonsTool(channel, log),
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
