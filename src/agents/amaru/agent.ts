import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlmAgent, loadSkillFromDir, SkillToolset } from '@google/adk';
import { createAskChoiceTool } from '../../adk/ask-choice.tool.js';
import {
  createSendLocationTool,
  createSendMediaTool,
} from '../../adk/send-rich.tool.js';
import { NUDGE_PREFIX } from '../../adk/events.js';
import { MODEL } from '../../constants.js';
import { AgentDeps } from '../types.js';

export const ASK_CHOICE_SKILL_DIR = resolveAskChoiceSkillDir();

function resolveAskChoiceSkillDir(): string {
  const beside = join(
    dirname(fileURLToPath(import.meta.url)),
    'skills/ask-choice',
  );
  if (existsSync(join(beside, 'SKILL.md'))) return beside;
  return join(process.cwd(), 'src/agents/amaru/skills/ask-choice');
}

export async function createAmaruAgent(deps: AgentDeps): Promise<LlmAgent> {
  const skill = await loadSkillFromDir(ASK_CHOICE_SKILL_DIR);
  const tools = new SkillToolset([skill], {
    additionalTools: [
      createAskChoiceTool(deps.channel, deps.log),
      createSendMediaTool(deps.channel, deps.log),
      createSendLocationTool(deps.channel, deps.log),
    ],
  });
  return new LlmAgent({
    name: 'amaru',
    model: MODEL,
    description:
      'Asks with ask_choice, or sends a file or map pin, then stops repeating that payload.',
    instruction: `You are a choice agent for session-bound buttons.
When the user wants a choice, load the ask-choice skill and follow it exactly.
To send a file, call send_media once with an https URL and mime type. To send a map pin, call send_location with latitude and longitude. Do not repeat the caption or coordinates as text.
Never say the user already chose. Never answer A or B yourself.
If ask_choice returns status text, they did not click. Follow that text. If they want other options, call ask_choice again. Do not invent a click.
If the latest message starts with ${NUDGE_PREFIX}, write one short follow-up in the thread's language and do not call tools.`,
    tools: [tools],
  });
}
