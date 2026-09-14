import { LongRunningFunctionTool } from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../channel/channel.service.js';
import { ASK_CHOICE_TOOL } from '../constants.js';
import { PocLog } from './poc-log.js';

const askChoiceParameters = z.object({
  prompt: z.string().describe('Question shown with the buttons.'),
  options: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .min(2),
});

export function createAskChoiceTool(channel: ChannelService, log: PocLog) {
  return new LongRunningFunctionTool({
    name: ASK_CHOICE_TOOL,
    description:
      'Show choice buttons and pause this turn until the user clicks one or replies in text. Call it once, then stop. Do not invent the choice.',
    parameters: askChoiceParameters,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) {
        throw new Error('ask_choice requires a session');
      }
      log.event('tool_call', {
        name: ASK_CHOICE_TOOL,
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
