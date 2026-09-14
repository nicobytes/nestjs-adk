import { LlmAgent } from '@google/adk';
import { bantSignalsSchema } from './qualifier.schema.js';
import { loadInstructionPair } from './instructions/load.js';
import { STATE_BANT_RESULT } from './state.js';

export { bantSignalsSchema } from './qualifier.schema.js';

export const QUALIFIER_NAME = 'qualifier';

/**
 * Prefer gemini-3.6-flash: gemini-2.5-flash is 404 for new keys; gemini-3.7-flash
 * often returns empty finals in this ADK path. Override with AMARU_QUALIFIER_MODEL.
 */
const QUALIFIER_MODEL =
  process.env.AMARU_QUALIFIER_MODEL || 'gemini-3.6-flash';

const INSTRUCTION = `${loadInstructionPair('qualifier')}

## Ejemplos
- "quiero hablar con un asesor humano por favor" → explicit_human_request=true
- "viajo en silla de ruedas, ¿accesible?" → disability_access_inquiry=true
- "hola" → todos false / defaults

Si el último mensaje pide asesor/humano/persona → explicit_human_request DEBE ser true.
Si pregunta discapacidad/accesibilidad/silla de ruedas → disability_access_inquiry DEBE ser true.
`;

export function createQualifierAgent(): LlmAgent {
  return new LlmAgent({
    name: QUALIFIER_NAME,
    model: QUALIFIER_MODEL,
    description: 'Silent BANT classifier. No tools. Events are swallowed.',
    instruction: INSTRUCTION,
    outputSchema: bantSignalsSchema,
    outputKey: STATE_BANT_RESULT,
    generateContentConfig: {
      temperature: 0,
      thinkingConfig: {
        includeThoughts: false,
        thinkingBudget: 0,
      },
    },
  });
}
