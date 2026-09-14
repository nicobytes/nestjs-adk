import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../channel/channel.service.js';
import { isHttpsUrl } from '../channel/channel.types.js';
import { SEND_LOCATION_TOOL, SEND_MEDIA_TOOL } from '../constants.js';
import { PocLog } from './poc-log.js';

const sendMediaParameters = z.object({
  url: z.string().describe('Public https URL of the file.'),
  mimeType: z
    .string()
    .describe('MIME type, for example image/jpeg, video/mp4, or audio/mpeg.'),
  caption: z.string().optional().describe('Optional caption. Do not also say it as text.'),
  filename: z.string().optional().describe('Optional filename for documents.'),
});

const sendLocationParameters = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

export function createSendMediaTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_MEDIA_TOOL,
    description:
      'Send a file by https URL. The channel picks image, video, audio, or document from the MIME type. Call once, then do not repeat the caption.',
    parameters: sendMediaParameters,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_media requires a session');
      if (!isHttpsUrl(args.url)) {
        throw new Error('send_media requires an https URL');
      }
      log.event('tool_call', {
        name: SEND_MEDIA_TOOL,
        sessionId,
        functionCallId: toolContext.functionCallId,
      });
      await channel.sendMedia(sessionId, args);
      return { ok: true };
    },
  });
}

export function createSendLocationTool(channel: ChannelService, log: PocLog) {
  return new FunctionTool({
    name: SEND_LOCATION_TOOL,
    description:
      'Send a map pin. Pass latitude and longitude. Do not also paste the coordinates as text.',
    parameters: sendLocationParameters,
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
        name: SEND_LOCATION_TOOL,
        sessionId,
        functionCallId: toolContext.functionCallId,
      });
      await channel.sendLocation(sessionId, args);
      return { ok: true };
    },
  });
}
