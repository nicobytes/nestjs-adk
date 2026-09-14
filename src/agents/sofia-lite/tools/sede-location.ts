import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { ChannelService } from '../../../channel/channel.service.js';
import { PocLog } from '../../../adk/poc-log.js';

export const SEND_SEDE_LOCATION = 'send_sede_location';

export const SEDE_PINS = {
  sucre: {
    key: 'sucre',
    displayName: 'Be Unique — Sucre',
    address: 'Calle Destacamento 317 #994, Barrio Petrolero, Sucre, Bolivia',
    latitude: -19.0401406,
    longitude: -65.2444091,
  },
  cochabamba: {
    key: 'cochabamba',
    displayName: 'Be Unique — Cochabamba',
    address:
      'Calle A. M. Torrico esq. Av. América, Edificio Altos Casah, 1er piso of. F, Queru Queru, Cochabamba, Bolivia',
    latitude: -17.373292,
    longitude: -66.155718,
  },
} as const;

export type SedeKey = keyof typeof SEDE_PINS;

const params = z.object({
  sede: z.enum(['sucre', 'cochabamba']),
});

export function createSendSedeLocationTool(
  channel: ChannelService,
  log: PocLog,
) {
  return new FunctionTool({
    name: SEND_SEDE_LOCATION,
    description:
      'Send the map pin for a Be Unique sede. Pass only sucre or cochabamba. Do not invent coordinates.',
    parameters: params,
    execute: async (args, toolContext) => {
      const sessionId = toolContext?.sessionId;
      if (!sessionId) throw new Error('send_sede_location requires a session');
      const pin = SEDE_PINS[args.sede];
      log.event('tool_call', {
        name: SEND_SEDE_LOCATION,
        sessionId,
        sede: args.sede,
      });
      await channel.sendLocation(sessionId, {
        latitude: pin.latitude,
        longitude: pin.longitude,
        name: pin.displayName,
        address: pin.address,
      });
      toolContext.actions.skipSummarization = true;
      // gist to model: no lat/lng
      return { ok: true, sede: args.sede };
    },
  });
}
