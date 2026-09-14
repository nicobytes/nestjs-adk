import { z } from 'zod';
import { LlmAgent } from '@google/adk';
import { MODEL } from '../../constants.js';

export const bantSignalsSchema = z.object({
  interest_level: z.enum(['Low', 'Medium', 'High']),
  budget_status: z.enum(['NotMentioned', 'Insufficient', 'Aligned']),
  purchase_urgency: z.enum([
    'Immediate',
    'ShortTerm',
    'LongTerm',
    'Uncertain',
  ]),
  has_decision_authority: z.boolean(),
  explicit_human_request: z.boolean(),
  plan_and_date_confirmed: z.boolean(),
  custom_group_accepted: z.boolean(),
  disability_access_inquiry: z.boolean(),
});

export const QUALIFIER_NAME = 'qualifier';

export function createQualifierAgent(): LlmAgent {
  return new LlmAgent({
    name: QUALIFIER_NAME,
    model: MODEL,
    description: 'Silent BANT classifier. No tools. Events are swallowed.',
    instruction: `Classify the latest user message into BANT signals.
Return ONLY the JSON schema fields. No prose.
Set explicit_human_request true only if they clearly ask for a human advisor.
Set disability_access_inquiry true only for disability or accessibility questions.
Set plan_and_date_confirmed true only when both a specific plan and date are confirmed.
Set custom_group_accepted true only when they accept a custom group/date arrangement.
Do not invent budget; use NotMentioned when unknown.`,
    outputSchema: bantSignalsSchema,
  });
}
