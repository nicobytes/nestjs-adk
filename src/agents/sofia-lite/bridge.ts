import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';

export function createSofiaBridgeAgent(): LlmAgent {
  return new LlmAgent({
    name: 'bridge',
    model: MODEL,
    description: 'Sofía handoff bridge. No tools.',
    instruction: `Eres el puente de handoff de Sofía (Be Unique). Escribe un cierre corto en español diciendo que una asesora humana continuará. No preguntes. No llames tools.`,
  });
}

export function createSofiaActivateAgent(): LlmAgent {
  return new LlmAgent({
    name: 'activate',
    model: MODEL,
    description: 'Sofía activation nudge. No tools.',
    instruction: `Escribe un seguimiento corto en español para re-enganchar al cliente de Be Unique. No llames tools.`,
  });
}
