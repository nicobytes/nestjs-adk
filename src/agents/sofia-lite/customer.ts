import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlmAgent } from '@google/adk';
import { ChannelService } from '../../channel/channel.service.js';
import { PocLog } from '../../adk/poc-log.js';
import {
  createSendButtonsTool,
  createSendListTool,
  createSendTextTool,
} from '../channel-tools.js';
import {
  stripInternalBantContents,
  stopTurnAfterOutboundIntent,
} from '../amaru-lite/callbacks.js';
import { MODEL } from '../../constants.js';
import { createSendSedeLocationTool } from './tools/sede-location.js';
import {
  createBookAppointmentTool,
  createListAvailableDaysTool,
  createListAvailableHoursTool,
} from './tools/scheduling.js';
import {
  createListSkillsTool,
  createLoadSkillResourceTool,
  createLoadSkillTool,
} from './tools/skills.js';

export const SOFIA_CUSTOMER_NAME = 'customer';

const here = dirname(fileURLToPath(import.meta.url));
const PERSONALITY = readFileSync(
  join(here, 'instructions', 'personality.md'),
  'utf8',
).trim();
const INSTRUCTIONS = readFileSync(
  join(here, 'instructions', 'instructions.md'),
  'utf8',
).trim();

export function createSofiaCustomerAgent(
  channel: ChannelService,
  log: PocLog,
): LlmAgent {
  return new LlmAgent({
    name: SOFIA_CUSTOMER_NAME,
    model: MODEL,
    description: 'Sofía customer agent: sede buttons, skills, fake agenda, pins.',
    instruction: () =>
      `${PERSONALITY}\n\n${INSTRUCTIONS}\n\n## Session\n- today: ${new Date().toISOString().slice(0, 10)}`,
    tools: [
      createSendTextTool(channel, log),
      createSendButtonsTool(channel, log),
      createSendListTool(channel, log),
      createSendSedeLocationTool(channel, log),
      createListSkillsTool(log),
      createLoadSkillTool(log),
      createLoadSkillResourceTool(log),
      createListAvailableDaysTool(log),
      createListAvailableHoursTool(log),
      createBookAppointmentTool(log),
    ],
    beforeModelCallback: stripInternalBantContents,
    afterToolCallback: stopTurnAfterOutboundIntent,
    generateContentConfig: {
      thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
    },
  });
}
