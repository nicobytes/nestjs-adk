export type InterestLevel = 'Low' | 'Medium' | 'High';
export type BudgetStatus = 'NotMentioned' | 'Insufficient' | 'Aligned';
export type PurchaseUrgency =
  | 'Immediate'
  | 'ShortTerm'
  | 'LongTerm'
  | 'Uncertain';

export interface BantSignals {
  interest_level: InterestLevel;
  budget_status: BudgetStatus;
  purchase_urgency: PurchaseUrgency;
  has_decision_authority: boolean;
  explicit_human_request: boolean;
  plan_and_date_confirmed: boolean;
  custom_group_accepted: boolean;
  disability_access_inquiry: boolean;
}

export const HANDOFF_REASON_HUMAN = 'Cliente solicitó atención humana.';
export const HANDOFF_REASON_DISABILITY =
  'Consulta por discapacidad o accesibilidad.';
export const HANDOFF_REASON_GROUP = 'Quiere armar grupo o fecha a medida.';
export const HANDOFF_REASON_PLAN_DATE =
  'Plan y fecha confirmados para reserva.';

export interface HandoffDecision {
  qualifies: boolean;
  reason?: string;
}

export function defaultBantSignals(
  overrides: Partial<BantSignals> = {},
): BantSignals {
  return {
    interest_level: 'Low',
    budget_status: 'NotMentioned',
    purchase_urgency: 'Uncertain',
    has_decision_authority: false,
    explicit_human_request: false,
    plan_and_date_confirmed: false,
    custom_group_accepted: false,
    disability_access_inquiry: false,
    ...overrides,
  };
}

/**
 * Four-path Amaru gate + turn-1 rule.
 * Score is intentionally ignored — even a high score without a path does not qualify.
 */
export function decideHandoff(
  signals: BantSignals,
  userTurnCount: number,
): HandoffDecision {
  if (signals.explicit_human_request) {
    return { qualifies: true, reason: HANDOFF_REASON_HUMAN };
  }
  if (signals.disability_access_inquiry) {
    return { qualifies: true, reason: HANDOFF_REASON_DISABILITY };
  }

  const budgetOk = signals.budget_status !== 'Insufficient';
  const planPath = signals.plan_and_date_confirmed && budgetOk;
  const groupPath = signals.custom_group_accepted && budgetOk;

  if (userTurnCount <= 1) {
    return { qualifies: false };
  }

  if (groupPath) {
    return { qualifies: true, reason: HANDOFF_REASON_GROUP };
  }
  if (planPath) {
    return { qualifies: true, reason: HANDOFF_REASON_PLAN_DATE };
  }

  return { qualifies: false };
}
