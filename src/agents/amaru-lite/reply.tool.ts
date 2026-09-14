import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../../channel/channel.service.js';
import { PocLog } from '../../adk/poc-log.js';

export const REPLY_WITH_TEXT = 'reply_with_text';
export const REPLY_WITH_BUTTONS = 'reply_with_buttons';

const textParams = z.object({
  body: z.string().describe('Customer-facing text to send on the channel.'),
});

const buttonsParams = z.object({
  prompt: z.string(),
  options: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .min(2),
});

export function createReplyWithTextTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: REPLY_WITH_TEXT,
    description:
      'Send one text message to the customer on the channel, then stop. Call once.',
    parameters: textParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('reply_with_text requires a session');
      log.event('tool_call', { name: REPLY_WITH_TEXT, sessionId });
      await channel.sendText(sessionId, args.body);
      toolContext.actions.skipSummarization = true;
      return null;
    },
  });
}

export function createReplyWithButtonsTool(
  channel: ChannelService,
  log: PocLog,
) {
  return new FunctionTool({
    name: REPLY_WITH_BUTTONS,
    description:
      'Send choice buttons to the customer on the channel, then stop. Call once.',
    parameters: buttonsParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('reply_with_buttons requires a session');
      log.event('tool_call', {
        name: REPLY_WITH_BUTTONS,
        sessionId,
        functionCallId: toolContext.functionCallId,
      });
      await channel.sendButtons(sessionId, args.prompt, args.options, {
        functionCallId: toolContext.functionCallId,
        invocationId: toolContext.invocationId,
      });
      toolContext.actions.skipSummarization = true;
      return null;
    },
  });
}
