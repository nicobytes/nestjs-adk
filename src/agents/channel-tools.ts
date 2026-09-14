import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../channel/channel.service.js';
import { PocLog } from '../adk/poc-log.js';

export const SEND_TEXT = 'send_text';
export const SEND_BUTTONS = 'send_buttons';
export const SEND_LIST = 'send_list';
export const SEND_LOCATION = 'send_location';

export const OUTBOUND_SEND_TOOLS = new Set([
  SEND_TEXT,
  SEND_BUTTONS,
  SEND_LIST,
  SEND_LOCATION,
  'send_sede_location',
]);

const textParams = z.object({
  body: z.string().describe('Customer-facing text to send on the channel.'),
});

const buttonsParams = z.object({
  prompt: z.string().describe('Prompt shown above the buttons.'),
  options: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .min(2)
    .max(3),
});

const listParams = z.object({
  prompt: z.string().describe('Body text above the list.'),
  buttonLabel: z
    .string()
    .optional()
    .describe('CTA label that opens the list (default Elegir).'),
  sections: z
    .array(
      z.object({
        title: z.string(),
        rows: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              description: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .optional(),
  options: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .min(1)
    .optional(),
});

const locationParams = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

export function createSendTextTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_TEXT,
    description:
      'Send one text message to the customer on the channel, then stop. Call once.',
    parameters: textParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_text requires a session');
      log.event('tool_call', { name: SEND_TEXT, sessionId });
      await channel.sendText(sessionId, args.body);
      toolContext.actions.skipSummarization = true;
      return null;
    },
  });
}

export function createSendButtonsTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_BUTTONS,
    description:
      'Send 2–3 choice buttons to the customer on the channel, then stop. Call once.',
    parameters: buttonsParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_buttons requires a session');
      log.event('tool_call', {
        name: SEND_BUTTONS,
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

export function createSendListTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_LIST,
    description:
      'Send an interactive list (4+ options) to the customer, then stop. Call once. Prefer sections; options alone become one section.',
    parameters: listParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_list requires a session');
      if (!args.sections?.length && !args.options?.length) {
        throw new Error('send_list requires sections or options');
      }
      log.event('tool_call', {
        name: SEND_LIST,
        sessionId,
        functionCallId: toolContext.functionCallId,
      });
      await channel.sendList(sessionId, args.prompt, {
        buttonLabel: args.buttonLabel,
        sections: args.sections,
        options: args.options,
      });
      toolContext.actions.skipSummarization = true;
      return null;
    },
  });
}

export function createSendLocationTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_LOCATION,
    description:
      'Send a map pin. Pass latitude and longitude. Do not also paste coordinates as text.',
    parameters: locationParams,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_location requires a session');
      if (
        !Number.isFinite(args.latitude) ||
        !Number.isFinite(args.longitude) ||
        args.latitude < -90 ||
        args.latitude > 90 ||
        args.longitude < -180 ||
        args.longitude > 180
      ) {
        throw new Error('send_location requires a valid latitude and longitude');
      }
      log.event('tool_call', {
        name: SEND_LOCATION,
        sessionId,
        functionCallId: toolContext.functionCallId,
      });
      await channel.sendLocation(sessionId, args);
      toolContext.actions.skipSummarization = true;
      return null;
    },
  });
}
