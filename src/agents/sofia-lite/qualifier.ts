import { LlmAgent } from '@google/adk';
import { bantSignalsSchema } from '../amaru-lite/qualifier.schema.js';
import { STATE_BANT_RESULT } from '../amaru-lite/state.js';

export const SOFIA_QUALIFIER_NAME = 'qualifier';

const QUALIFIER_MODEL =
  process.env.AMARU_QUALIFIER_MODEL || 'gemini-3.6-flash';

const INSTRUCTION = `# Extractor BANT (Sofía)

Eres un clasificador silencioso. No hablas con el cliente.

Extrae señales del historial. Defaults:
- interest_level: Low
- budget_status: NotMentioned
- purchase_urgency: Uncertain
- has_decision_authority: false
- explicit_human_request: false
- plan_and_date_confirmed: false
- custom_group_accepted: false
- disability_access_inquiry: false

explicit_human_request: true solo si pide hablar con una persona/asesor/humano del equipo.
No basta con querer información o cita.

Ejemplo: "quiero hablar con una asesora" → explicit_human_request=true.

Responde únicamente con el JSON del schema.`;

export function createSofiaQualifierAgent(): LlmAgent {
  return new LlmAgent({
    name: SOFIA_QUALIFIER_NAME,
    model: QUALIFIER_MODEL,
    description: 'Silent Sofía qualifier. Human-request handoff only.',
    instruction: INSTRUCTION,
    outputSchema: bantSignalsSchema,
    outputKey: STATE_BANT_RESULT,
    generateContentConfig: {
      temperature: 0,
      thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
    },
  });
}
