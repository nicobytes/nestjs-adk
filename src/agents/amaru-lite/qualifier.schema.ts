import { z } from 'zod';

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
